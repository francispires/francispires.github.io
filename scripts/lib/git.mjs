import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

/**
 * Commits all blog post files and pushes to origin/master.
 * GitHub Actions will deploy within ~60s.
 */
export async function publishToGit({ title, includeConfig = false }) {
  const filesToAdd = ['src/content/blog/', 'public/img/posts/'];
  if (includeConfig) filesToAdd.push('src/content/config.ts');

  for (const f of filesToAdd) run('git', ['add', f]);
  run('git', ['commit', '-m', `post: ${title}`]);
  run('git', ['push', 'origin', 'master']);

  console.log(chalk.green('\n✓ Pushed to GitHub — deploying in ~60s\n'));
}
