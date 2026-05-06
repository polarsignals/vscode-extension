import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {execSync} from 'child_process';
import {renderCallbackPage} from '../src/auth/callback-page';

const variant = process.argv[2] === 'error' ? 'error' : 'success';
const sampleError = 'invalid_grant: The authorization code has expired or been revoked.';
const logoSvg = fs.readFileSync(path.join(__dirname, '..', 'images', 'ps-logo.svg'), 'utf8');

const html =
  variant === 'error'
    ? renderCallbackPage('error', logoSvg, sampleError)
    : renderCallbackPage('success', logoSvg);

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-callback-preview-'));
const outFile = path.join(outDir, `${variant}.html`);
fs.writeFileSync(outFile, html);

console.log(`Wrote ${outFile}`);

const opener =
  process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
execSync(`${opener} "${outFile}"`);
