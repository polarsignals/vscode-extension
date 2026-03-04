import * as vscode from 'vscode';
import * as http from 'http';
import * as crypto from 'crypto';

const OAUTH_AUTH_ENDPOINT = 'https://identity.polarsignals.com/auth';
const OAUTH_TOKEN_ENDPOINT = 'https://identity.polarsignals.com/token';
const CLI_LOGIN_ENDPOINT = 'https://cloud.polarsignals.com/login/cli';
const CLIENT_ID = 'polarsignals-mcp';
const SCOPES = ['openid', 'profile', 'email', 'offline_access'];

const TOKEN_SECRET_KEY = 'polarsignals.oauth.accessToken';
const REFRESH_TOKEN_KEY = 'polarsignals.oauth.refreshToken';
const SESSION_KEY = 'polarsignals.oauth.session';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
}

interface StoredSession {
  id: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  account: {
    id: string;
    label: string;
  };
}

export class PolarSignalsAuthProvider implements vscode.AuthenticationProvider {
  static readonly id = 'polarsignals';
  static readonly label = 'Polar Signals';

  private readonly _onDidChangeSessions =
    new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();

  readonly onDidChangeSessions = this._onDidChangeSessions.event;

  private _sessions: vscode.AuthenticationSession[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    this.loadSessions();
  }

  private async loadSessions(): Promise<void> {
    const storedSession = this.context.globalState.get<StoredSession>(SESSION_KEY);
    if (!storedSession) {
      return;
    }

    const accessToken = await this.context.secrets.get(TOKEN_SECRET_KEY);
    if (!accessToken) {
      await this.context.globalState.update(SESSION_KEY, undefined);
      return;
    }

    this._sessions = [
      {
        id: storedSession.id,
        accessToken,
        account: storedSession.account,
        scopes: SCOPES,
      },
    ];
  }

  async getSessions(
    scopes?: readonly string[],
    _options?: vscode.AuthenticationProviderSessionOptions,
  ): Promise<vscode.AuthenticationSession[]> {
    await this.loadSessions();

    if (!scopes || scopes.length === 0) {
      return [...this._sessions];
    }

    return this._sessions.filter(session => scopes.every(scope => session.scopes.includes(scope)));
  }

  async createSession(scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
    const {codeVerifier, codeChallenge, redirectUri} = this.generatePKCE();

    const authCode = await this.startAuthFlow(codeChallenge, redirectUri);
    const tokens = await this.exchangeCodeForToken(authCode, codeVerifier, redirectUri);

    const session: vscode.AuthenticationSession = {
      id: crypto.randomUUID(),
      accessToken: tokens.access_token,
      account: {
        id: 'polarsignals-user',
        label: 'Polar Signals',
      },
      scopes: [...scopes],
    };

    await this.context.secrets.store(TOKEN_SECRET_KEY, tokens.access_token);
    if (tokens.refresh_token) {
      await this.context.secrets.store(REFRESH_TOKEN_KEY, tokens.refresh_token);
    }

    const storedSession: StoredSession = {
      id: session.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
      account: session.account,
    };
    await this.context.globalState.update(SESSION_KEY, storedSession);

    this._sessions = [session];
    this._onDidChangeSessions.fire({added: [session], removed: [], changed: []});

    return session;
  }

  async removeSession(sessionId: string): Promise<void> {
    const session = this._sessions.find(s => s.id === sessionId);
    if (!session) {
      return;
    }

    await this.context.secrets.delete(TOKEN_SECRET_KEY);
    await this.context.secrets.delete(REFRESH_TOKEN_KEY);
    await this.context.globalState.update(SESSION_KEY, undefined);

    this._sessions = this._sessions.filter(s => s.id !== sessionId);
    this._onDidChangeSessions.fire({added: [], removed: [session], changed: []});
  }

  private generatePKCE(): {codeVerifier: string; codeChallenge: string; redirectUri: string} {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const port = 30000 + Math.floor(Math.random() * 10000);
    const redirectUri = `http://127.0.0.1:${port}`;
    return {codeVerifier, codeChallenge, redirectUri};
  }

  private async startAuthFlow(codeChallenge: string, redirectUri: string): Promise<string> {
    const port = parseInt(new URL(redirectUri).port, 10);

    return await new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', `http://localhost`);
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400, {'Content-Type': 'text/html'});
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>Authentication Failed</h1>
                <p>${url.searchParams.get('error_description') ?? error}</p>
                <p>You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(error));
          return;
        }

        if (code) {
          res.writeHead(200, {'Content-Type': 'text/html'});
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1>Authentication Successful</h1>
                <p>You can close this window and return to your editor.</p>
                <script>window.close();</script>
              </body>
            </html>
          `);
          server.close();
          resolve(code);
          return;
        }

        res.writeHead(400, {'Content-Type': 'text/plain'});
        res.end('Invalid request');
      });

      server.listen(port, '127.0.0.1', () => {
        const state = crypto.randomBytes(16).toString('hex');

        const authUrl = new URL(CLI_LOGIN_ENDPOINT);
        authUrl.searchParams.set('auth_endpoint', OAUTH_AUTH_ENDPOINT);
        authUrl.searchParams.set('client_id', CLIENT_ID);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('scope', SCOPES.join(' '));
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');

        vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));

        setTimeout(
          () => {
            server.close();
            reject(new Error('Authentication timed out'));
          },
          5 * 60 * 1000,
        );
      });

      server.on('error', reject);
    });
  }

  private async exchangeCodeForToken(
    code: string,
    codeVerifier: string,
    redirectUri: string,
  ): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });

    const response = await fetch(OAUTH_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    return (await response.json()) as TokenResponse;
  }

  private async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    });

    const response = await fetch(OAUTH_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token refresh failed: ${errorText}`);
    }

    return (await response.json()) as TokenResponse;
  }

  private isTokenExpired(storedSession: StoredSession): boolean {
    if (!storedSession.expiresAt) {
      return false;
    }
    const bufferMs = 5 * 60 * 1000;
    return Date.now() >= storedSession.expiresAt - bufferMs;
  }

  async getAccessToken(): Promise<string | undefined> {
    const storedSession = this.context.globalState.get<StoredSession>(SESSION_KEY);
    if (!storedSession) {
      return undefined;
    }

    const accessToken = await this.context.secrets.get(TOKEN_SECRET_KEY);
    if (!accessToken) {
      return undefined;
    }

    if (this.isTokenExpired(storedSession)) {
      const refreshToken = await this.context.secrets.get(REFRESH_TOKEN_KEY);
      if (refreshToken) {
        try {
          const tokens = await this.refreshAccessToken(refreshToken);
          await this.updateStoredTokens(storedSession, tokens);
          return tokens.access_token;
        } catch (error) {
          console.error('[Polar Signals] Token refresh failed:', error);
          await this.clearSession(storedSession.id);
          return undefined;
        }
      }
    }

    return accessToken;
  }

  private async updateStoredTokens(
    storedSession: StoredSession,
    tokens: TokenResponse,
  ): Promise<void> {
    await this.context.secrets.store(TOKEN_SECRET_KEY, tokens.access_token);
    if (tokens.refresh_token) {
      await this.context.secrets.store(REFRESH_TOKEN_KEY, tokens.refresh_token);
    }

    const updatedSession: StoredSession = {
      ...storedSession,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? storedSession.refreshToken,
      expiresAt: tokens.expires_in
        ? Date.now() + tokens.expires_in * 1000
        : storedSession.expiresAt,
    };
    await this.context.globalState.update(SESSION_KEY, updatedSession);

    if (this._sessions.length > 0) {
      this._sessions[0] = {
        ...this._sessions[0],
        accessToken: tokens.access_token,
      };
      this._onDidChangeSessions.fire({added: [], removed: [], changed: [this._sessions[0]]});
    }
  }

  private async clearSession(sessionId: string): Promise<void> {
    const session = this._sessions.find(s => s.id === sessionId);
    await this.context.secrets.delete(TOKEN_SECRET_KEY);
    await this.context.secrets.delete(REFRESH_TOKEN_KEY);
    await this.context.globalState.update(SESSION_KEY, undefined);
    this._sessions = [];
    if (session) {
      this._onDidChangeSessions.fire({added: [], removed: [session], changed: []});
    }
  }
}

let providerInstance: PolarSignalsAuthProvider | undefined;
let disposable: vscode.Disposable | undefined;

export function registerAuthProvider(context: vscode.ExtensionContext): PolarSignalsAuthProvider {
  if (providerInstance) {
    return providerInstance;
  }

  providerInstance = new PolarSignalsAuthProvider(context);

  disposable = vscode.authentication.registerAuthenticationProvider(
    PolarSignalsAuthProvider.id,
    PolarSignalsAuthProvider.label,
    providerInstance,
    {supportsMultipleAccounts: false},
  );

  context.subscriptions.push(disposable);

  return providerInstance;
}

export function getAuthProvider(): PolarSignalsAuthProvider | undefined {
  return providerInstance;
}
