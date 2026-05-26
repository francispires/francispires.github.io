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

config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT     = join(__dirname, '..');
const BLOG_DIR = join(ROOT, 'src/content/blog');
const IMG_DIR  = join(ROOT, 'public/img/posts');

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
        { title: 'Generate — AI writes from a topic', value: 'generate' },
        { title: 'Revise  — I wrote a draft, AI polishes it', value: 'revise' },
      ],
    }, { onCancel });
    args.mode = mode;
  }

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

// ─── Claude API — generate ───────────────────────────────────────────────────

const GENERATE_SYSTEM = `You are a technical blog writer for Francis Pires, a Brazilian developer and data analyst.
Writing style: clear, direct, no fluff. Practical code examples where relevant.
Use Markdown with proper headings (##, ###). Code blocks with language tags.
Never add a preamble like "Here is the post" — output only the requested JSON.`;

function buildGeneratePrompt(topic, category, lang) {
  const langNote = lang === 'pt-BR'
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

// ─── Claude API — revise ─────────────────────────────────────────────────────

const REVISE_SYSTEM = `You are a professional technical editor for Francis Pires, a Brazilian developer and data analyst.
Your job: take the author's rough draft and transform it into a polished, professional blog post.

Non-negotiable rules:
- Preserve the author's voice, opinions, and all factual content — never invent facts
- Improve clarity, structure, grammar, and flow
- Add proper Markdown headings (##, ###) to create a clear reading structure
- Format any code snippets into fenced code blocks with the correct language tag
- Where the text describes a process, flow, or architecture, insert a Mermaid diagram as a fenced \`\`\`mermaid block
- Do not pad with generic filler phrases
- Output only the requested JSON — no preamble`;

function buildRevisePrompt(draftText, category, lang) {
  const langNote = lang === 'pt-BR'
    ? 'The final post must be in Brazilian Portuguese (pt-BR). Translate if the draft is in another language, keeping the author\'s meaning.'
    : 'The final post must be in English. Translate if the draft is in another language, keeping the author\'s meaning.';

  return `Revise and polish this author draft into a professional blog post.

Category: ${category}
${langNote}

Author's draft:
---
${draftText}
---

Return ONLY valid JSON (no markdown wrapper) with this shape:
{
  "title": "...",
  "description": "...",
  "tags": ["tag1", "tag2", "tag3"],
  "body": "...",
  "unsplashQuery": "..."
}

Rules:
- "title": clear, engaging — derived from the author's content, not invented
- "description": 1–2 sentence SEO summary of what the author wrote
- "tags": 3–5 lowercase slugs matching the content
- "body": full polished Markdown — keep the author's voice and ideas, improve everything else; add \`\`\`mermaid diagrams where a flow or architecture is described
- "unsplashQuery": 2–4 words for a relevant Unsplash image`;
}

// ─── API call (shared) ────────────────────────────────────────────────────────

async function callClaude(client, system, userPrompt, label) {
  const spinner = ora(label).start();
  try {
    const msg = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = msg.content[0].text.trim();
    const json = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    const result = JSON.parse(json);
    spinner.succeed(label.replace(/\.\.\.$/, '') + ' done');
    return result;
  } catch (err) {
    spinner.fail(`Failed: ${label}`);
    throw err;
  }
}

// ─── Translation ──────────────────────────────────────────────────────────────

async function translatePost(client, result, targetLang) {
  const langLabel = targetLang === 'pt-BR' ? 'Brazilian Portuguese' : 'English';
  const prompt = `Translate and adapt this blog post to ${langLabel}.
Keep code blocks and Mermaid diagrams unchanged. Adapt idioms naturally — do not translate mechanically.
Return ONLY valid JSON with the same shape: { title, description, tags, body, unsplashQuery }

Original post JSON:
${JSON.stringify(result)}`;

  return callClaude(
    client,
    GENERATE_SYSTEM,
    prompt,
    `Translating to ${targetLang}...`,
  );
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(chalk.green('\n$ npm run new-post\n'));

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(chalk.red('Error: ANTHROPIC_API_KEY not set. Copy .env.example → .env and add your key.'));
    process.exit(1);
  }

  let args = parseArgs();
  args = await askMissing(args);

  const { mode, topic, input, category, lang, image: wantImage } = args;
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

  // ── Summary
  console.log('\n' + chalk.green('✓ Done!\n'));
  console.log(chalk.dim('Files created:'));
  console.log('  ' + chalk.cyan(`src/content/blog/${ptFile.filename}`));
  if (enFile) console.log('  ' + chalk.cyan(`src/content/blog/${enFile.filename}`));

  console.log('\n' + chalk.dim('Next steps:'));
  console.log('  1. ' + chalk.white('Review the output — check facts, voice, diagrams'));
  console.log('  2. ' + chalk.white('npm run dev') + chalk.dim('  →  http://localhost:4321'));
  console.log('  3. ' + chalk.white('Set') + chalk.cyan(' draft: false') + chalk.white(' when ready to publish'));
  console.log('  4. ' + chalk.white(`git add src/content/blog/ && git commit -m "post: ${primary.title}"`));
  console.log('  5. ' + chalk.white('git push origin master') + chalk.dim('  →  GitHub Actions deploys in ~60s\n'));
}

main().catch(err => {
  console.error(chalk.red('\nFatal error:'), err.message);
  process.exit(1);
});
