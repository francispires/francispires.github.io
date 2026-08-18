#!/usr/bin/env node
/**
 * Removes a blog post (EN + PT files + hero image) and pushes to GitHub.
 *
 * Usage:
 *   npm run remove-post
 */

import { config } from 'dotenv';
import { readdirSync, rmSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import prompts from 'prompts';
import chalk from 'chalk';

config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const BLOG_DIR  = join(ROOT, 'src/content/blog');
const IMG_DIR   = join(ROOT, 'public/img/posts');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

function onCancel() {
  console.log(chalk.yellow('\nCancelled.'));
  process.exit(0);
}

// Group EN + PT files by base slug
function groupPosts() {
  const files = readdirSync(BLOG_DIR).filter(f => f.endsWith('.md'));
  const groups = new Map();

  for (const file of files) {
    const isPt  = file.endsWith('-pt.md');
    const base  = isPt ? file.replace(/-pt\.md$/, '') : file.replace(/\.md$/, '');
    if (!groups.has(base)) groups.set(base, { base, en: null, pt: null });
    if (isPt) groups.get(base).pt = file;
    else       groups.get(base).en = file;
  }

  return [...groups.values()].sort((a, b) => b.base.localeCompare(a.base));
}

async function main() {
  const groups = groupPosts();

  if (!groups.length) {
    console.log(chalk.yellow('No blog posts found.'));
    process.exit(0);
  }

  const { chosen } = await prompts({
    type:    'select',
    name:    'chosen',
    message: 'Which post do you want to remove?',
    choices: groups.map(g => ({
      title: `${g.base}${g.pt ? ' [EN+PT]' : ' [EN only]'}`,
      value: g,
    })),
  }, { onCancel });

  const { confirmed } = await prompts({
    type:    'confirm',
    name:    'confirmed',
    message: `Remove "${chosen.base}" and push to GitHub?`,
    initial: false,
  }, { onCancel });

  if (!confirmed) { console.log(chalk.yellow('Aborted.')); process.exit(0); }

  const removed = [];

  if (chosen.en) {
    const p = join(BLOG_DIR, chosen.en);
    rmSync(p);
    removed.push(p);
  }
  if (chosen.pt) {
    const p = join(BLOG_DIR, chosen.pt);
    rmSync(p);
    removed.push(p);
  }

  // Remove hero image if present (same base slug, any extension)
  const slugNoDate = chosen.base.replace(/^\d{4}-\d{2}-\d{2}-/, '');
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
    const img = join(IMG_DIR, slugNoDate + ext);
    if (existsSync(img)) { rmSync(img); removed.push(img); }
  }

  removed.forEach(f => console.log(chalk.dim(`  removed ${basename(f)}`)));

  run('git', ['add', '-A', 'src/content/blog/', 'public/img/posts/']);
  run('git', ['commit', '-m', `remove post: ${chosen.base}`]);
  run('git', ['push', 'origin', 'master']);

  console.log(chalk.green('\n✓ Post removed and pushed — will disappear from site in ~60s\n'));
}

main().catch(err => {
  console.error(chalk.red('\nError:'), err.message);
  process.exit(1);
});
