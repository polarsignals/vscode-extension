--- OAuth PKCE authentication module for Polar Signals Cloud.
--- Opens the browser, starts a local HTTP server to capture the redirect, and
--- exchanges the authorization code for tokens.  Tokens are stored via
--- vim.fn.writefile into a cache file (XDG_CACHE_HOME or ~/.cache).

local config = require('polar-signals.config')
local M = {}

local AUTH_BASE   = 'https://identity.polarsignals.com'
local CLI_LOGIN   = 'https://cloud.polarsignals.com/login/cli'
local CLIENT_ID   = 'polarsignals-mcp'
local SCOPES      = 'openid profile email offline_access'
local TOKEN_FILE  = (os.getenv('XDG_CACHE_HOME') or (os.getenv('HOME') .. '/.cache'))
                    .. '/polar-signals-nvim/token.json'

--- Base64url-encode a string (no padding, url-safe alphabet).
local function b64url(s)
  local b64 = vim.base64 and vim.base64.encode(s)
               or require('polar-signals.base64').encode(s)
  return b64:gsub('+', '-'):gsub('/', '_'):gsub('=', '')
end

--- Generate N random bytes as a hex string.
local function random_hex(n)
  math.randomseed(os.clock() * 1e9)
  local t = {}
  for _ = 1, n do t[#t + 1] = string.format('%02x', math.random(0, 255)) end
  return table.concat(t)
end

--- SHA-256 of `s` via openssl CLI, returned as raw bytes (string).
local function sha256_raw(s)
  local tmp = os.tmpname()
  local f = io.open(tmp, 'wb'); f:write(s); f:close()
  local handle = io.popen('openssl dgst -sha256 -binary ' .. tmp)
  local result = handle:read('*a')
  handle:close()
  os.remove(tmp)
  return result
end

--- Ensure the cache directory exists.
local function ensure_cache_dir()
  local dir = vim.fn.fnamemodify(TOKEN_FILE, ':h')
  vim.fn.mkdir(dir, 'p')
end

--- Persist token data to disk.
---@param data table
local function save_tokens(data)
  ensure_cache_dir()
  local json = vim.json.encode(data)
  vim.fn.writefile({json}, TOKEN_FILE)
end

--- Load token data from disk.
---@return table|nil
local function load_tokens()
  if vim.fn.filereadable(TOKEN_FILE) == 0 then return nil end
  local lines = vim.fn.readfile(TOKEN_FILE)
  if #lines == 0 then return nil end
  local ok, data = pcall(vim.json.decode, lines[1])
  return ok and data or nil
end

--- Return current access token (refreshed if expired).
---@return string|nil
function M.get_token()
  local tokens = load_tokens()
  if not tokens then return nil end
  -- Check expiry (with 5-minute buffer)
  if tokens.expires_at and os.time() < tokens.expires_at - 300 then
    return tokens.access_token
  end
  -- Attempt refresh
  if tokens.refresh_token then
    local refreshed = M.refresh(tokens.refresh_token)
    if refreshed then return refreshed end
  end
  return nil
end

--- Exchange a refresh token for a new access token (synchronous via curl).
---@param refresh_token string
---@return string|nil
function M.refresh(refresh_token)
  local cfg = config.get()
  local body = table.concat({
    'grant_type=refresh_token',
    'client_id=' .. CLIENT_ID,
    'refresh_token=' .. vim.uri_encode(refresh_token),
  }, '&')
  local cmd = string.format(
    'curl -s -X POST -H "Content-Type: application/x-www-form-urlencoded" --data-raw %q %s/token',
    body, AUTH_BASE
  )
  local handle = io.popen(cmd)
  local resp = handle:read('*a')
  handle:close()
  local ok, data = pcall(vim.json.decode, resp)
  if not ok or not data.access_token then return nil end
  save_tokens({
    access_token  = data.access_token,
    refresh_token = data.refresh_token or refresh_token,
    expires_at    = os.time() + (data.expires_in or 3600),
  })
  return data.access_token
end

--- Start the PKCE OAuth flow.  Opens the browser and blocks until the user
--- completes the login, then stores the token and calls cb(ok, token).
---@param cb fun(ok:boolean, token:string|nil)
function M.sign_in(cb)
  -- 1. Generate PKCE pair
  local verifier = random_hex(32)
  local challenge = b64url(sha256_raw(verifier))

  -- 2. Pick a random local port
  local port = math.random(30000, 39999)
  local redirect_uri = 'http://localhost:' .. port .. '/callback'

  -- 3. Build the auth URL
  local params = {
    'response_type=code',
    'client_id=' .. CLIENT_ID,
    'redirect_uri=' .. vim.uri_encode(redirect_uri),
    'scope=' .. vim.uri_encode(SCOPES),
    'code_challenge=' .. challenge,
    'code_challenge_method=S256',
  }
  local auth_url = CLI_LOGIN .. '?' .. table.concat(params, '&')

  -- 4. Open browser
  local open_cmd
  if vim.fn.has('mac') == 1 then
    open_cmd = 'open'
  elseif vim.fn.has('win32') == 1 then
    open_cmd = 'start'
  else
    open_cmd = 'xdg-open'
  end
  vim.fn.jobstart({open_cmd, auth_url}, {detach = true})
  vim.notify('[Polar Signals] Browser opened for authentication. Waiting for callback…', vim.log.levels.INFO)

  -- 5. Listen for the redirect with a minimal TCP server via socat / python
  --    (Neovim's libuv TCP is not exposed to Lua in all versions, so we use
  --     a small shell snippet with nc or python3 as a fallback.)
  local script = string.format([[
import socket, urllib.parse, sys
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(('127.0.0.1', %d))
s.listen(1)
conn, _ = s.accept()
data = b''
while b'\r\n\r\n' not in data:
    data += conn.recv(4096)
conn.sendall(b'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<h1>Login successful! You can close this tab.</h1>')
conn.close()
s.close()
line = data.decode().split('\n')[0]
path = line.split(' ')[1]
qs = path.split('?', 1)[1] if '?' in path else ''
params = dict(urllib.parse.parse_qsl(qs))
print(params.get('code', ''))
]], port)

  local code_buf = {}
  local server_job = vim.fn.jobstart({'python3', '-c', script}, {
    on_stdout = function(_, lines, _)
      for _, l in ipairs(lines) do
        if l ~= '' then code_buf[#code_buf + 1] = l end
      end
    end,
    on_exit = function(_, _, _)
      local code = code_buf[1]
      if not code or code == '' then
        cb(false, nil)
        return
      end
      -- 6. Exchange code for tokens
      local body = table.concat({
        'grant_type=authorization_code',
        'client_id=' .. CLIENT_ID,
        'code=' .. vim.uri_encode(code),
        'redirect_uri=' .. vim.uri_encode(redirect_uri),
        'code_verifier=' .. verifier,
      }, '&')
      local curl_cmd = string.format(
        'curl -s -X POST -H "Content-Type: application/x-www-form-urlencoded" --data-raw %q %s/token',
        body, AUTH_BASE
      )
      local handle = io.popen(curl_cmd)
      local resp = handle:read('*a')
      handle:close()
      local ok, data = pcall(vim.json.decode, resp)
      if not ok or not data.access_token then
        vim.schedule(function()
          cb(false, nil)
          vim.notify('[Polar Signals] Token exchange failed', vim.log.levels.ERROR)
        end)
        return
      end
      save_tokens({
        access_token  = data.access_token,
        refresh_token = data.refresh_token,
        expires_at    = os.time() + (data.expires_in or 3600),
      })
      config.set('oauth_token', data.access_token)
      vim.schedule(function()
        cb(true, data.access_token)
        vim.notify('[Polar Signals] Signed in successfully.', vim.log.levels.INFO)
      end)
    end,
  })

  if server_job <= 0 then
    vim.notify('[Polar Signals] Failed to start local callback server (python3 required)', vim.log.levels.ERROR)
    cb(false, nil)
  end
end

--- Sign out: delete stored tokens.
function M.sign_out()
  vim.fn.delete(TOKEN_FILE)
  config.set('oauth_token', nil)
  vim.notify('[Polar Signals] Signed out.', vim.log.levels.INFO)
end

--- Load persisted token into config on startup.
function M.restore()
  local token = M.get_token()
  if token then
    config.set('oauth_token', token)
  end
end

return M
