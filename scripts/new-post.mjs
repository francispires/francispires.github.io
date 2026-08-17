#!/usr/bin/env node
/**
 * AI-assisted blog post generator / revisor.
 *
 * Modes:
 *   generate  AI writes a full post from a topic (default)
 *   revise    You write the draft, AI refines it — formats, improves, adds diagrams
 *
 * Usage:
 *   npm run new-post -- --mode generate --topic "dbt + DuckDB" --category data-engineering --lang both
 *   npm run new-post -- --mode revise --input ./drafts/my-idea.md --category python --lang both
 *   npm run new-post   (interactive wizard)
 *
 * Requires in .env:
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   UNSPLASH_ACCESS_KEY=...  (optional, for hero images)
 */

import Anthropic from '@anthropic-ai/sdk';
import slugify from 'slugify';
import { config } from 'dotenv';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import prompts from 'prompts';
import chalk from 'chalk';
import ora from 'ora';
import {
  GENERATE_SYSTEM,
  REVISE_SYSTEM,
  buildGeneratePrompt,
  buildRevisePrompt,
  callClaude,
  translatePost,
} from './lib/claude.mjs';
import { publishToLinkedIn } from './publishers/linkedin.mjs';
import { publishToInstagram } from './publishers/instagram.mjs';
import { postReviewLoop } from './lib/post-review.mjs';
import { publishToGit } from './lib/git.mjs';

config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT     = join(__dirname, '..');
const BLOG_DIR     = join(ROOT, 'src/content/blog');
const PROJECTS_DIR = join(ROOT, 'src/content/projects');
const IMG_DIR      = join(ROOT, 'public/img/posts');

const CONFIG_PATH = join(ROOT, 'src/content/config.ts');

function loadCategories() {
  const src = readFileSync(CONFIG_PATH, 'utf8');
  const match = src.match(/category:[\s\S]*?\.enum\(\[([^\]]+)\]\)/);
  if (!match) return ['misc'];
  return match[1].split(',').map(s => s.trim().replace(/'/g, ''));
}

function addCategoryToSchema(newCat) {
  let src = readFileSync(CONFIG_PATH, 'utf8');
  src = src.replace(/(category:[\s\S]*?\.enum\(\[[^\]]+)(\]\))/, `$1, '${newCat}'$2`);
  writeFileSync(CONFIG_PATH, src);
}

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      result[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    }
  }
  return result;
}

// ─── Interactive prompts ─────────────────────────────────────────────────────

async function askMissing(args) {
  const questions = [];
  const onCancel = () => { console.log(chalk.yellow('\nCancelled.')); process.exit(0); };

  if (!args.mode) {
    const { mode } = await prompts({
      type: 'select',
      name: 'mode',
      message: 'How do you want to create this post?',
      choices: [
        { title: 'Generate — AI writes from a topic',         value: 'generate' },
        { title: 'Revise  — I wrote a draft, AI polishes it', value: 'revise'   },
        { title: 'Project — create a new CV project entry',   value: 'project'  },
      ],
    }, { onCancel });
    args.mode = mode;
  }

  // Project mode needs its own prompts — skip blog-specific questions
  if (args.mode === 'project') return args;

  if (args.mode === 'revise' && !args.input) {
    const { input } = await prompts({
      type: 'text',
      name: 'input',
      message: 'Path to your draft file (e.g. drafts/my-post.md):',
      validate: v => {
        const p = resolve(ROOT, v.trim());
        return existsSync(p) ? true : `File not found: ${p}`;
      },
    }, { onCancel });
    args.input = input;
  }

  if (args.mode === 'generate' && !args.topic) {
    const { topic } = await prompts({
      type: 'text',
      name: 'topic',
      message: 'Post topic:',
      validate: v => v.length > 3 || 'Need at least a few words',
    }, { onCancel });
    args.topic = topic;
  }

  if (!args.category) {
    const cats = loadCategories();
    const { category } = await prompts({
      type: 'select',
      name: 'category',
      message: 'Category:',
      choices: [
        ...cats.map(c => ({ title: c, value: c })),
        { title: '+ New category...', value: '__new__' },
      ],
    }, { onCancel });

    if (category === '__new__') {
      const { newSlug } = await prompts({
        type: 'text',
        name: 'newSlug',
        message: 'Category slug (lowercase, hyphens only — e.g. "react", "asp-net"):',
        validate: v => /^[a-z][a-z0-9-]*$/.test(v.trim()) || 'Use lowercase letters, numbers, hyphens only',
      }, { onCancel });
      const slug = newSlug.trim();
      addCategoryToSchema(slug);
      console.log(chalk.green(`  ✓ Added "${slug}" to src/content/config.ts`));
      args.category = slug;
      args._newCategory = true;
    } else {
      args.category = category;
    }
  }

  if (!args.lang) {
    const { lang } = await prompts({
      type: 'select',
      name: 'lang',
      message: 'Language:',
      initial: 2,
      choices: [
        { title: 'Portuguese only',       value: 'pt-BR' },
        { title: 'English only',          value: 'en'    },
        { title: 'Both (bilingual pair)', value: 'both'  },
      ],
    }, { onCancel });
    args.lang = lang;
  }

  if (!args.image) {
    const { image } = await prompts({
      type: 'confirm',
      name: 'image',
      message: 'Fetch hero image from Unsplash?',
      initial: !!process.env.UNSPLASH_ACCESS_KEY,
    }, { onCancel });
    args.image = image;
  }

  return args;
}

// ─── Read draft file ─────────────────────────────────────────────────────────

function readDraft(input) {
  const p = resolve(ROOT, input.trim());
  if (!existsSync(p)) {
    console.error(chalk.red(`Draft file not found: ${p}`));
    process.exit(1);
  }
  return readFileSync(p, 'utf8');
}

// ─── Unsplash image ──────────────────────────────────────────────────────────

async function fetchHeroImage(query, slug) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    console.log(chalk.yellow('  No UNSPLASH_ACCESS_KEY — skipping image'));
    return null;
  }

  const spinner = ora(`Fetching hero image: "${query}"...`).start();
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
    const res = await fetch(url, { headers: { Authorization: `Client-ID ${key}` } });
    const data = await res.json();

    if (!data.results?.length) {
      spinner.warn('No Unsplash results');
      return null;
    }

    const photo = data.results[0];
    const downloadUrl = `${photo.urls.regular}&w=1200&q=80`;
    const filename = `${slug}.jpg`;
    const filepath = join(IMG_DIR, filename);

    mkdirSync(IMG_DIR, { recursive: true });
    const imgRes = await fetch(downloadUrl);
    await pipeline(imgRes.body, createWriteStream(filepath));

    spinner.succeed(`Image saved: public/img/posts/${filename}`);
    return `/img/posts/${filename}`;
  } catch (err) {
    spinner.fail(`Image fetch failed: ${err.message}`);
    return null;
  }
}

// ─── File writing ─────────────────────────────────────────────────────────────

function buildFrontmatter({ title, description, pubDate, lang, translationKey, category, tags, heroImage, authored }) {
  const lines = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    `pubDate: ${pubDate}`,
    `lang: ${lang}`,
  ];
  if (translationKey) lines.push(`translationKey: ${translationKey}`);
  lines.push(`category: ${category}`);
  lines.push(`tags: [${tags.map(t => JSON.stringify(t)).join(', ')}]`);
  lines.push('draft: true');
  if (authored) lines.push('authored: true');
  if (heroImage) lines.push(`heroImage: ${JSON.stringify(heroImage)}`);
  lines.push('---', '');
  return lines.join('\n');
}

function writePost({ result, lang, category, translationKey, heroImage, slug, date, authored }) {
  const frontmatter = buildFrontmatter({
    title: result.title,
    description: result.description,
    pubDate: date,
    lang,
    translationKey,
    category,
    tags: result.tags,
    heroImage,
    authored,
  });

  const suffix = lang === 'pt-BR' ? '-pt' : '';
  const filename = `${date}-${slug}${suffix}.md`;
  const filepath = join(BLOG_DIR, filename);

  writeFileSync(filepath, frontmatter + result.body + '\n');
  return { filename, filepath };
}

// ─── Project mode ────────────────────────────────────────────────────────────

async function askProjectDetails() {
  const onCancel = () => { console.log(chalk.yellow('\nCancelled.')); process.exit(0); };
  const cats = loadCategories();

  return prompts([
    {
      type: 'text', name: 'title',
      message: 'Project title (EN):',
      validate: v => v.trim().length > 2 || 'Required',
    },
    {
      type: 'text', name: 'titlePt',
      message: 'Project title (PT, blank to skip):',
    },
    {
      type: 'text', name: 'description',
      message: 'Short description (EN):',
      validate: v => v.trim().length > 5 || 'Required',
    },
    {
      type: 'text', name: 'descriptionPt',
      message: 'Short description (PT, blank to skip):',
    },
    {
      type: 'text', name: 'position',
      message: 'Position/role (e.g. Lead Developer, blank to skip):',
    },
    {
      type: 'text', name: 'company',
      message: 'Company/organization (blank to skip):',
    },
    {
      type: 'text', name: 'startDate',
      message: 'Start date (YYYY-MM, blank to skip):',
      validate: v => !v.trim() || /^\d{4}-\d{2}$/.test(v.trim()) || 'Format: YYYY-MM',
    },
    {
      type: 'text', name: 'endDate',
      message: 'End date (YYYY-MM, blank = present):',
      validate: v => !v.trim() || /^\d{4}-\d{2}$/.test(v.trim()) || 'Format: YYYY-MM',
    },
    {
      type: 'select', name: 'category',
      message: 'Category:',
      choices: cats.map(c => ({ title: c, value: c })),
    },
    {
      type: 'text', name: 'tech',
      message: 'Tech tags (comma-separated, e.g. Python, SQL, dbt):',
      validate: v => v.trim().length > 0 || 'At least one tag required',
    },
    {
      type: 'text', name: 'github',
      message: 'GitHub URL (blank to skip):',
    },
    {
      type: 'text', name: 'url',
      message: 'Project URL (blank to skip):',
    },
    {
      type: 'confirm', name: 'featured',
      message: 'Featured project?',
      initial: false,
    },
  ], { onCancel });
}

function writeProject(details, date) {
  const slug     = slugify(details.title, { lower: true, strict: true });
  const filename = `${date}-${slug}.md`;
  const filepath = join(PROJECTS_DIR, filename);
  const tech     = details.tech.split(',').map(t => t.trim()).filter(Boolean);

  const lines = ['---'];
  lines.push(`title: ${JSON.stringify(details.title)}`);
  if (details.titlePt?.trim())       lines.push(`titlePt: ${JSON.stringify(details.titlePt.trim())}`);
  lines.push(`description: ${JSON.stringify(details.description)}`);
  if (details.descriptionPt?.trim()) lines.push(`descriptionPt: ${JSON.stringify(details.descriptionPt.trim())}`);
  lines.push(`tech: [${tech.map(t => JSON.stringify(t)).join(', ')}]`);
  if (details.category)              lines.push(`category: "${details.category}"`);
  if (details.position?.trim())      lines.push(`position: ${JSON.stringify(details.position.trim())}`);
  if (details.company?.trim())       lines.push(`company: ${JSON.stringify(details.company.trim())}`);
  if (details.startDate?.trim())     lines.push(`startDate: "${details.startDate.trim()}"`);
  if (details.endDate?.trim())       lines.push(`endDate: "${details.endDate.trim()}"`);
  if (details.github?.trim())        lines.push(`github: ${JSON.stringify(details.github.trim())}`);
  if (details.url?.trim())           lines.push(`url: ${JSON.stringify(details.url.trim())}`);
  lines.push(`featured: ${details.featured ? 'true' : 'false'}`);
  lines.push('---', '');

  lines.push('<div class="lang-en">', '', '## Overview', '', details.description.trim(), '', '</div>', '');
  const descPt = details.descriptionPt?.trim() || details.description.trim();
  lines.push('<div class="lang-pt">', '', '## Visão Geral', '', descPt, '', '</div>', '');

  writeFileSync(filepath, lines.join('\n'));
  return { filename, filepath };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(chalk.green('\n$ npm run new-post\n'));

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(chalk.red('Error: ANTHROPIC_API_KEY not set. Copy .env.example → .env and add your key.'));
    process.exit(1);
  }

  let args = parseArgs();
  args = await askMissing(args);

  // ── Project mode — no AI needed
  if (args.mode === 'project') {
    const details = await askProjectDetails();
    const date    = new Date().toISOString().split('T')[0];
    mkdirSync(PROJECTS_DIR, { recursive: true });
    const { filename } = writeProject(details, date);
    console.log('\n' + chalk.green('✓ Project created!\n'));
    console.log('  ' + chalk.cyan(`src/content/projects/${filename}`));
    console.log('\n' + chalk.dim('Next steps:'));
    console.log('  1. ' + chalk.white('Edit the file to add full content in both languages'));
    console.log('  2. ' + chalk.white('npm run dev') + chalk.dim('  →  check /cv and /projects'));
    console.log('  3. ' + chalk.white(`git add src/content/projects/${filename} && git commit -m "project: ${details.title}"`));
    console.log('  4. ' + chalk.white('git push origin master\n'));
    return;
  }

  const { mode, topic, input, category, lang, image: wantImage, _newCategory } = args;
  const client  = new Anthropic();
  const date    = new Date().toISOString().split('T')[0];
  const isBilingual  = lang === 'both';
  const primaryLang  = isBilingual ? 'pt-BR' : lang;
  const isRevise     = mode === 'revise';

  // ── Generate or revise primary post
  let primary;
  if (isRevise) {
    const draftText = readDraft(input);
    primary = await callClaude(
      client,
      REVISE_SYSTEM,
      buildRevisePrompt(draftText, category, primaryLang),
      'Revising your draft with Claude...',
    );
  } else {
    primary = await callClaude(
      client,
      GENERATE_SYSTEM,
      buildGeneratePrompt(topic, category, primaryLang),
      'Generating post with Claude...',
    );
  }

  // ── Translate if bilingual (primary is pt-BR, translate to EN)
  let secondary = null;
  if (isBilingual) {
    secondary = await translatePost(client, primary, 'en');
  }

  const slug = slugify(primary.title, { lower: true, strict: true });
  const translationKey = isBilingual ? slug : undefined;

  // ── Hero image
  let heroImage = null;
  if (wantImage) {
    heroImage = await fetchHeroImage(primary.unsplashQuery, slug);
  }

  // ── Write files
  mkdirSync(BLOG_DIR, { recursive: true });

  const ptFile = writePost({
    result: primary, lang: primaryLang, category,
    translationKey, heroImage, slug, date, authored: isRevise,
  });

  let enFile = null;
  if (secondary) {
    enFile = writePost({
      result: secondary, lang: 'en', category,
      translationKey, heroImage, slug, date, authored: isRevise,
    });
  }

  if (_newCategory) {
    console.log('\n' + chalk.yellow('⚠  New category added — config.ts will be included in the publish commit.'));
  }

  // ── Review loop → publish
  const shouldPublish = await postReviewLoop({
    client,
    slug,
    date,
    enFilePath: enFile?.filepath ?? null,
    ptFilePath: ptFile.filepath,
    isBilingual,
    primaryResult: primary,
  });

  if (!shouldPublish) {
    console.log(chalk.dim('\nPost saved as draft. Run "npm run publish-post" when ready.\n'));
    return;
  }

  // ── Git publish
  await publishToGit({ title: primary.title, includeConfig: !!_newCategory });

  // ── Social publishing
  const destinations = await askDestinations(args);
  const blogPost = {
    title:         primary.title,
    description:   primary.description,
    tags:          primary.tags,
    body:          primary.body,
    unsplashQuery: primary.unsplashQuery,
  };

  if (destinations.linkedin)  await publishToLinkedIn({ blogPost, slug });
  if (destinations.instagram) await publishToInstagram({ blogPost, slug });
}

async function askDestinations(args) {
  if (args.platform) {
    const p = args.platform;
    return {
      linkedin:  p === 'linkedin'  || p === 'all',
      instagram: p === 'instagram' || p === 'all',
    };
  }
  const onCancel = () => { console.log(chalk.yellow('\nCancelled.')); process.exit(0); };
  const { destinations } = await prompts({
    type:    'multiselect',
    name:    'destinations',
    message: 'Where do you want to publish?',
    choices: [
      { title: 'LinkedIn',  value: 'linkedin'  },
      { title: 'Instagram', value: 'instagram' },
    ],
    hint: '(space to select, enter to confirm — site is always included)',
  }, { onCancel });
  return {
    linkedin:  (destinations ?? []).includes('linkedin'),
    instagram: (destinations ?? []).includes('instagram'),
  };
}

main().catch(err => {
  console.error(chalk.red('\nFatal error:'), err.message);
  process.exit(1);
});
