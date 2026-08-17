import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { URL } from 'node:url';
import { readEnvKey, writeEnvKeys } from '../env.mjs';
import chalk from 'chalk';

const SCOPES   = ['w_member_social'];
const PORT     = 3333;
const REDIRECT = `http://localhost:${PORT}/callback`;

function openBrowser(url) {
  const { platform } = process;
  const cmd = platform === 'win32' ? 'start' : platform === 'darwin' ? 'open' : 'xdg-open';
  spawnSync(cmd, [url], { stdio: 'ignore', detached: true });
}

function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const u     = new URL(req.url, `http://localhost:${PORT}`);
      const code  = u.searchParams.get('code');
      const error = u.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h2>Done! You can close this tab.</h2></body></html>');
      server.close();
      if (error) reject(new Error(`LinkedIn OAuth error: ${error}`));
      else resolve(code);
    });
    server.listen(PORT, () => {});
    server.on('error', reject);
  });
}

async function exchangeCode(code, clientId, clientSecret) {
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  REDIRECT,
      client_id:     clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json();
}

async function getPersonUrn(accessToken) {
  // Try OpenID Connect userinfo first (requires "Sign In with LinkedIn" product)
  const uiRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (uiRes.ok) {
    const data = await uiRes.json();
    if (data.sub) return `urn:li:person:${data.sub}`;
  }

  // Try classic /v2/me (requires r_liteprofile product)
  const meRes = await fetch('https://api.linkedin.com/v2/me', {
    headers: { Authorization: `Bearer ${accessToken}`, 'X-Restli-Protocol-Version': '2.0.0' },
  });
  if (meRes.ok) {
    const data = await meRes.json();
    if (data.id) return `urn:li:person:${data.id}`;
  }

  // Fallback: ask the user to paste their URN manually
  console.log(chalk.yellow(
    '\nCould not fetch your LinkedIn member ID automatically.\n' +
    'Find it at: https://www.linkedin.com/developers/tools/oauth/token-inspector\n' +
    '  1. Paste your access token in the inspector\n' +
    '  2. Copy the "sub" (member ID) value\n' +
    '  3. Paste it below (just the ID, e.g. abc123XYZ)\n',
  ));

  const { default: prompts } = await import('prompts');
  const { memberId } = await prompts({
    type:     'text',
    name:     'memberId',
    message:  'Your LinkedIn member ID:',
    validate: v => v.trim().length > 0 || 'Required',
  });

  if (!memberId) throw new Error('LinkedIn member ID is required.');
  return `urn:li:person:${memberId.trim()}`;
}

/**
 * Ensures LINKEDIN_ACCESS_TOKEN and LINKEDIN_PERSON_URN are set in .env.
 * Runs the OAuth flow if they are missing.
 * @returns {Promise<{ accessToken: string, personUrn: string }>}
 */
export async function ensureLinkedInToken() {
  let accessToken = readEnvKey('LINKEDIN_ACCESS_TOKEN');
  let personUrn   = readEnvKey('LINKEDIN_PERSON_URN');

  if (accessToken && personUrn) return { accessToken, personUrn };

  const clientId     = readEnvKey('LINKEDIN_CLIENT_ID');
  const clientSecret = readEnvKey('LINKEDIN_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    console.error(chalk.red(
      '\nLinkedIn not configured.\n' +
      'Follow docs/LINKEDIN-SETUP.md and add LINKEDIN_CLIENT_ID + LINKEDIN_CLIENT_SECRET to .env.\n',
    ));
    process.exit(1);
  }

  const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id',     clientId);
  authUrl.searchParams.set('redirect_uri',  REDIRECT);
  authUrl.searchParams.set('scope',         SCOPES.join(' '));

  console.log(chalk.cyan('\nLinkedIn auth required. Opening browser...'));
  console.log(chalk.dim(`If browser did not open, visit:\n${authUrl.toString()}\n`));
  openBrowser(authUrl.toString());

  const code   = await waitForCode();
  const tokens = await exchangeCode(code, clientId, clientSecret);
  accessToken  = tokens.access_token;
  personUrn    = await getPersonUrn(accessToken);

  writeEnvKeys({ LINKEDIN_ACCESS_TOKEN: accessToken, LINKEDIN_PERSON_URN: personUrn });
  console.log(chalk.green('LinkedIn token saved to .env'));

  return { accessToken, personUrn };
}
