#!/usr/bin/env node
/**
 * AI-assisted blog post generator.
 *
 * Usage:
 *   npm run new-post -- --topic "dbt + DuckDB" --category data-engineering --lang both
 *   npm run new-post   (interactive wizard)
 *
 * Requires in .env:
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   UNSPLASH_ACCESS_KEY=...  (optional, for hero images)
 */

import Anthropic from '@anthropic-ai/sdk';
import slugify from 'slugify';
import { config } from 'dotenv';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import prompts from 'prompts';
import chalk from 'chalk';
import ora from 'ora';

config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BLOG_DIR = join(ROOT, 'src/content/blog');
const IMG_DIR  = join(ROOT, 'public/img/posts');

const CATEGORIES = [
  'data-engineering',
  'python',
  'sql',
  'javascript',
  'devops',
  'math',
  'misc',
];

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

  if (!args.topic) {
    questions.push({
      type: 'text',
      name: 'topic',
      message: 'Post topic:',
      validate: v => v.length > 3 || 'Need at least a few words',
    });
  }

  if (!args.category) {
    questions.push({
      type: 'select',
      name: 'category',
      message: 'Category:',
      choices: CATEGORIES.map(c => ({ title: c, value: c })),
    });
  }

  if (!args.lang) {
    questions.push({
      type: 'select',
      name: 'lang',
      message: 'Language:',
      choices: [
        { title: 'English only', value: 'en' },
        { title: 'Portuguese only', value: 'pt-BR' },
        { title: 'Both (bilingual pair)', value: 'both' },
      ],
    });
  }

  if (!args.image) {
    questions.push({
      type: 'confirm',
      name: 'image',
      message: 'Fetch hero image from Unsplash?',
      initial: !!process.env.UNSPLASH_ACCESS_KEY,
    });
  }

  const answers = await prompts(questions, {
    onCancel: () => { console.log(chalk.yellow('\nCancelled.')); process.exit(0); },
  });

  return { ...args, ...answers };
}

// ─── Claude API ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a technical blog writer for Francis Pires, a Brazilian developer and data analyst.
Writing style: clear, direct, no fluff. Practical code examples where relevant.
Use Markdown with proper headings (##, ###). Code blocks with language tags.
Never add a preamble like "Here is the post" — output only the requested JSON.`;

function buildPrompt(topic, category, lang) {
  const langNote =
    lang === 'pt-BR'
      ? 'Write the entire post in Brazilian Portuguese (pt-BR).'
      : 'Write the entire post in English.';

  return `Generate a technical blog post.

Topic: ${topic}
Category: ${category}
${langNote}
Target audience: developers and data analysts
Length: 800–1400 words
Include: practical code examples where relevant

Return ONLY valid JSON (no markdown wrapper) with this shape:
{
  "title": "...",
  "description": "...",
  "tags": ["tag1", "tag2", "tag3"],
  "body": "...",
  "unsplashQuery": "..."
}

Rules:
- "description" is 1–2 sentences, SEO-friendly
- "tags" is 3–5 lowercase slugs (e.g. "python", "sql", "data-engineering")
- "body" is the full Markdown body — no frontmatter, no title at the top
- "unsplashQuery" is 2–4 words for an Unsplash image search`;
}

async function generatePost(client, topic, category, lang) {
  const spinner = ora(`Generating ${lang === 'pt-BR' ? 'pt-BR' : 'EN'} post with Claude...`).start();
  try {
    const msg = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(topic, category, lang) }],
    });

    const text = msg.content[0].text.trim();
    // Strip markdown code fences if Claude added them
    const json = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    const result = JSON.parse(json);
    spinner.succeed(`Post generated (${lang})`);
    return result;
  } catch (err) {
    spinner.fail('Generation failed');
    throw err;
  }
}

async function translatePost(client, result, targetLang) {
  const spinner = ora(`Translating to ${targetLang}...`).start();
  try {
    const langLabel = targetLang === 'pt-BR' ? 'Brazilian Portuguese' : 'English';
    const msg = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Translate and adapt this blog post to ${langLabel}.
Keep code blocks unchanged. Adapt idioms naturally — don't translate mechanically.
Return ONLY valid JSON with the same shape: { title, description, tags, body, unsplashQuery }

Original post JSON:
${JSON.stringify(result)}`,
      }],
    });
    const text = msg.content[0].text.trim();
    const json = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    const translated = JSON.parse(json);
    spinner.succeed(`Translated to ${targetLang}`);
    return translated;
  } catch (err) {
    spinner.fail('Translation failed');
    throw err;
  }
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
    const ext = 'jpg';
    const filename = `${slug}.${ext}`;
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

function buildFrontmatter({ title, description, pubDate, lang, translationKey, category, tags, heroImage }) {
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
  if (heroImage) lines.push(`heroImage: ${JSON.stringify(heroImage)}`);
  lines.push('---', '');
  return lines.join('\n');
}

function writePost({ result, lang, category, translationKey, heroImage, slug, date }) {
  const frontmatter = buildFrontmatter({
    title: result.title,
    description: result.description,
    pubDate: date,
    lang,
    translationKey,
    category,
    tags: result.tags,
    heroImage,
  });

  const suffix = lang === 'pt-BR' ? '-pt' : '';
  const filename = `${date}-${slug}${suffix}.md`;
  const filepath = join(BLOG_DIR, filename);

  writeFileSync(filepath, frontmatter + result.body + '\n');
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

  const { topic, category, lang, image: wantImage } = args;
  const client = new Anthropic();

  const date = new Date().toISOString().split('T')[0];
  const isBilingual = lang === 'both';
  const primaryLang = isBilingual ? 'en' : lang;

  // Generate primary post
  const primary = await generatePost(client, topic, category, primaryLang);

  // Generate secondary post (translation) if bilingual
  let secondary = null;
  if (isBilingual) {
    secondary = await translatePost(client, primary, 'pt-BR');
  }

  // Slugify from English title
  const slug = slugify(primary.title, { lower: true, strict: true });
  const translationKey = isBilingual ? slug : undefined;

  // Fetch hero image (shared between both language versions)
  let heroImage = null;
  if (wantImage) {
    heroImage = await fetchHeroImage(primary.unsplashQuery, slug);
  }

  // Write files
  mkdirSync(BLOG_DIR, { recursive: true });

  const enFile = writePost({ result: primary, lang: primaryLang, category, translationKey, heroImage, slug, date });

  let ptFile = null;
  if (secondary) {
    ptFile = writePost({ result: secondary, lang: 'pt-BR', category, translationKey, heroImage, slug, date });
  }

  // Summary
  console.log('\n' + chalk.green('✓ Done!\n'));
  console.log(chalk.dim('Files created:'));
  console.log('  ' + chalk.cyan(`src/content/blog/${enFile.filename}`));
  if (ptFile) console.log('  ' + chalk.cyan(`src/content/blog/${ptFile.filename}`));

  console.log('\n' + chalk.dim('Next steps:'));
  console.log('  1. ' + chalk.white('Review and edit the draft(s)'));
  console.log('  2. ' + chalk.white('npm run dev') + chalk.dim('  →  http://localhost:4321'));
  console.log('  3. ' + chalk.white('Set') + chalk.cyan(' draft: false') + chalk.white(' when ready to publish'));
  console.log('  4. ' + chalk.white('git add src/content/blog/ && git commit -m "post: ' + primary.title + '"'));
  console.log('  5. ' + chalk.white('git push origin master') + chalk.dim('  →  GitHub Actions deploys in ~60s\n'));
}

main().catch(err => {
  console.error(chalk.red('\nFatal error:'), err.message);
  process.exit(1);
});
