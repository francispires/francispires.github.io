import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { URL } from 'node:url';
import { readEnvKey, writeEnvKeys } from '../env.mjs';
import chalk from 'chalk';

const PORT       = 3333;
const REDIRECT   = `http://localhost:${PORT}/callback`;
const SCOPES     = ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement'];
const FB_VERSION = 'v21.0';

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
      if (error) reject(new Error(`Meta OAuth error: ${error}`));
      else resolve(code);
    });
    server.listen(PORT, () => {});
    server.on('error', reject);
  });
}

async function exchangeCode(code, appId, appSecret) {
  const url = `https://graph.facebook.com/${FB_VERSION}/oauth/access_token?` +
    `client_id=${appId}&redirect_uri=${encodeURIComponent(REDIRECT)}&` +
    `client_secret=${appSecret}&code=${code}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Meta token exchange failed: ${await res.text()}`);
  return res.json();
}

async function getLongLivedToken(shortToken, appId, appSecret) {
  const url = `https://graph.facebook.com/${FB_VERSION}/oauth/access_token?` +
    `grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Long-lived token exchange failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function getIgUserId(accessToken) {
  const pagesRes = await fetch(
    `https://graph.facebook.com/${FB_VERSION}/me/accounts?access_token=${accessToken}`,
  );
  if (!pagesRes.ok) throw new Error(`Failed to get Facebook pages: ${await pagesRes.text()}`);
  const pages = await pagesRes.json();

  for (const page of (pages.data ?? [])) {
    const igRes  = await fetch(
      `https://graph.facebook.com/${FB_VERSION}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`,
    );
    const igData = await igRes.json();
    if (igData.instagram_business_account?.id) {
      return igData.instagram_business_account.id;
    }
  }
  throw new Error(
    'No Instagram Business/Creator account found connected to your Facebook pages.\n' +
    'See docs/INSTAGRAM-SETUP.md — ensure your Instagram is linked to a Facebook Page.',
  );
}

/**
 * Ensures INSTAGRAM_BUSINESS_ACCOUNT_ID and FACEBOOK_ACCESS_TOKEN are set in .env.
 * Runs the Meta OAuth flow if they are missing.
 * @returns {Promise<{ igUserId: string, accessToken: string }>}
 */
export async function ensureInstagramToken() {
  let accessToken = readEnvKey('FACEBOOK_ACCESS_TOKEN');
  let igUserId    = readEnvKey('INSTAGRAM_BUSINESS_ACCOUNT_ID');

  if (accessToken && igUserId) return { igUserId, accessToken };

  const appId     = readEnvKey('INSTAGRAM_APP_ID');
  const appSecret = readEnvKey('INSTAGRAM_APP_SECRET');

  if (!appId || !appSecret) {
    console.error(chalk.red(
      '\nInstagram not configured.\n' +
      'Follow docs/INSTAGRAM-SETUP.md and add INSTAGRAM_APP_ID + INSTAGRAM_APP_SECRET to .env.\n',
    ));
    process.exit(1);
  }

  const authUrl = new URL(`https://www.facebook.com/${FB_VERSION}/dialog/oauth`);
  authUrl.searchParams.set('client_id',     appId);
  authUrl.searchParams.set('redirect_uri',  REDIRECT);
  authUrl.searchParams.set('scope',         SCOPES.join(','));
  authUrl.searchParams.set('response_type', 'code');

  console.log(chalk.cyan('\nInstagram/Meta auth required. Opening browser...'));
  console.log(chalk.dim(`If browser did not open, visit:\n${authUrl.toString()}\n`));
  openBrowser(authUrl.toString());

  const code               = await waitForCode();
  const { access_token }   = await exchangeCode(code, appId, appSecret);
  accessToken              = await getLongLivedToken(access_token, appId, appSecret);
  igUserId                 = await getIgUserId(accessToken);

  writeEnvKeys({
    FACEBOOK_ACCESS_TOKEN:           accessToken,
    INSTAGRAM_BUSINESS_ACCOUNT_ID:   igUserId,
  });
  console.log(chalk.green('Instagram token saved to .env'));

  return { igUserId, accessToken };
}
