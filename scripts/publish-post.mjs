#!/usr/bin/env node
/**
 * Publishes an existing blog post to social platforms.
 *
 * Usage:
 *   npm run publish-post                                      (interactive — picks file + platform)
 *   npm run publish-post -- --file src/content/blog/my-post.md --platform linkedin
 *   npm run publish-post -- --file src/content/blog/my-post.md --platform all
 */

import { config } from 'dotenv';
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import prompts from 'prompts';
import chalk from 'chalk';
import { publishToLinkedIn } from './publishers/linkedin.mjs';
import { publishToInstagram } from './publishers/instagram.mjs';

config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const BLOG_DIR  = join(ROOT, 'src/content/blog');

function onCancel() {
  console.log(chalk.yellow('\nCancelled.'));
  process.exit(0);
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (!key || !rest.length) continue;
    let val = rest.join(':').trim().replace(/^"(.*)"$/, '$1');
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^"(.*)"$/, '$1'));
    }
    fm[key.trim()] = val;
  }
  return fm;
}

function extractBody(content) {
  return content.replace(/^---[\s\S]*?---\n/, '').trim();
}

function slugFromFilename(filename) {
  return basename(filename, '.md')
    .replace(/-pt$/, '')           // strip -pt suffix
    .replace(/^\d{4}-\d{2}-\d{2}-/, ''); // strip date prefix
}

async function pickFile(filePath) {
  if (filePath) return filePath;

  const files = readdirSync(BLOG_DIR)
    .filter(f => f.endsWith('.md') && !f.endsWith('-pt.md'))
    .sort()
    .reverse()
    .slice(0, 20);

  const { chosen } = await prompts({
    type:    'select',
    name:    'chosen',
    message: 'Which post do you want to publish?',
    choices: files.map(f => ({ title: f, value: join(BLOG_DIR, f) })),
  }, { onCancel });

  return chosen;
}

async function pickPlatforms(platformArg) {
  if (platformArg) {
    return {
      linkedin:  platformArg === 'linkedin'  || platformArg === 'all',
      instagram: platformArg === 'instagram' || platformArg === 'all',
    };
  }

  const { destinations } = await prompts({
    type:    'multiselect',
    name:    'destinations',
    message: 'Where do you want to publish?',
    choices: [
      { title: 'LinkedIn',  value: 'linkedin'  },
      { title: 'Instagram', value: 'instagram' },
    ],
    hint: '(space to select, enter to confirm)',
  }, { onCancel });

  return {
    linkedin:  (destinations ?? []).includes('linkedin'),
    instagram: (destinations ?? []).includes('instagram'),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const get  = (flag) => { const i = argv.indexOf(flag); return i !== -1 ? argv[i + 1] : undefined; };
  const args = { file: get('--file'), platform: get('--platform') };

  const filePath  = await pickFile(args.file);
  const platforms = await pickPlatforms(args.platform);

  if (!platforms.linkedin && !platforms.instagram) {
    console.log(chalk.yellow('No platform selected. Exiting.'));
    process.exit(0);
  }

  const content = readFileSync(filePath, 'utf8');
  const fm      = parseFrontmatter(content);
  const body    = extractBody(content);
  const slug    = slugFromFilename(filePath);

  const blogPost = {
    title:          fm.title      ?? 'Untitled',
    description:    fm.description ?? '',
    tags:           Array.isArray(fm.tags) ? fm.tags : [],
    body,
    unsplashQuery:  fm.unsplashQuery ?? fm.title,
  };

  console.log(chalk.cyan(`\nPublishing: ${chalk.bold(blogPost.title)}\n`));

  if (platforms.linkedin)  await publishToLinkedIn({ blogPost, slug });
  if (platforms.instagram) await publishToInstagram({ blogPost, slug });
}

main().catch(err => {
  console.error(chalk.red('\nError:'), err.message);
  process.exit(1);
});
