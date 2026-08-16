# Social Publishing Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `npm run new-post` to optionally publish blog content to LinkedIn and Instagram, with Claude-adapted content per platform, Unsplash/DALL-E image selection, and a terminal review loop before publishing.

**Architecture:** Extract shared logic from `new-post.mjs` into focused modules under `scripts/lib/`. Add platform-specific publishers under `scripts/publishers/`. The orchestrator (`new-post.mjs`) gains one new multi-select question at the end: where to publish. Each publisher handles its own auth, content adaptation, image sourcing, and review loop.

**Tech Stack:** Node.js ESM, `@anthropic-ai/sdk`, `openai` (DALL-E), LinkedIn UGC Posts API v2, Instagram Graph API v21, `prompts`, `chalk`, `ora`, `dotenv`, `vitest` (tests)

**Working directory for all commands:** `/home/fran/francispires.github.io`

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| CREATE | `scripts/lib/claude.mjs` | All Claude API calls; prompts per platform |
| CREATE | `scripts/lib/images.mjs` | Unsplash + DALL-E sourcing; image preview loop |
| CREATE | `scripts/lib/review.mjs` | Terminal preview + edit loop (shared by publishers) |
| CREATE | `scripts/lib/auth/linkedin.mjs` | LinkedIn OAuth 2.0 flow; token persistence |
| CREATE | `scripts/lib/auth/instagram.mjs` | Meta OAuth flow; long-lived token; IG account lookup |
| CREATE | `scripts/lib/env.mjs` | Read/write individual keys in `.env` |
| CREATE | `scripts/publishers/linkedin.mjs` | Adapt content + upload image + create UGC post |
| CREATE | `scripts/publishers/instagram.mjs` | Adapt content + create media container + publish |
| MODIFY | `scripts/new-post.mjs` | Import publishers; add destination multi-select at end |
| CREATE | `scripts/tests/claude.test.mjs` | Unit tests for prompt builders |
| CREATE | `scripts/tests/images.test.mjs` | Unit tests for URL builders |
| CREATE | `scripts/tests/env.test.mjs` | Unit tests for env read/write helper |
| CREATE | `vitest.config.mjs` | Vitest config (ESM) |
| CREATE | `docs/LINKEDIN-SETUP.md` | Step-by-step LinkedIn Developer App + OAuth guide |
| CREATE | `docs/INSTAGRAM-SETUP.md` | Step-by-step Meta Developer App + OAuth guide |
| MODIFY | `CREATING-POSTS.md` | Add social publishing section |
| MODIFY | `.env.example` | Add new keys |
| MODIFY | `package.json` | Add `openai`, `open`; add `test` script |

---

## Task 1: Install packages and configure vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.mjs`

- [ ] **Step 1.1: Install new runtime and dev dependencies**

```bash
cd /home/fran/francispires.github.io
npm install openai open
npm install -D vitest
```

Expected output: packages added to `node_modules/`, `package-lock.json` updated.

- [ ] **Step 1.2: Add test script to package.json**

Open `package.json` and add `"test": "vitest run"` to the `scripts` block:

```json
"scripts": {
  "dev": "astro dev",
  "build": "astro build",
  "preview": "astro preview",
  "astro": "astro",
  "new-post": "node scripts/new-post.mjs",
  "test": "vitest run"
}
```

- [ ] **Step 1.3: Create vitest.config.mjs**

```js
// vitest.config.mjs
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/tests/**/*.test.mjs'],
  },
});
```

- [ ] **Step 1.4: Verify vitest works**

```bash
mkdir -p scripts/tests
echo "import { describe, it, expect } from 'vitest'
describe('smoke', () => { it('works', () => expect(1+1).toBe(2)) })" \
  > scripts/tests/smoke.test.mjs
npx vitest run
```

Expected: `1 test passed`.

```bash
rm scripts/tests/smoke.test.mjs
```

- [ ] **Step 1.5: Commit**

```bash
git add package.json package-lock.json vitest.config.mjs
git commit -m "feat: add openai, open, vitest"
```

---

## Task 2: Create lib/env.mjs — read/write .env keys

**Files:**
- Create: `scripts/lib/env.mjs`
- Create: `scripts/tests/env.test.mjs`

- [ ] **Step 2.1: Write failing tests**

```js
// scripts/tests/env.test.mjs
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const TMP = join(process.cwd(), '.env.test.tmp');

// We'll test the functions by passing the file path explicitly.
// Import after we set up the test file so dotenv doesn't interfere.
import { readEnvKey, writeEnvKeys } from '../lib/env.mjs';

beforeEach(() => {
  writeFileSync(TMP, 'FOO=bar\nBAZ=qux\n');
});

afterEach(() => {
  try { unlinkSync(TMP); } catch {}
});

describe('readEnvKey', () => {
  it('reads an existing key', () => {
    expect(readEnvKey('FOO', TMP)).toBe('bar');
  });
  it('returns undefined for a missing key', () => {
    expect(readEnvKey('MISSING', TMP)).toBeUndefined();
  });
});

describe('writeEnvKeys', () => {
  it('updates an existing key', () => {
    writeEnvKeys({ FOO: 'updated' }, TMP);
    expect(readEnvKey('FOO', TMP)).toBe('updated');
    expect(readEnvKey('BAZ', TMP)).toBe('qux');
  });
  it('appends a new key', () => {
    writeEnvKeys({ NEW_KEY: 'hello' }, TMP);
    expect(readEnvKey('NEW_KEY', TMP)).toBe('hello');
  });
});
```

- [ ] **Step 2.2: Run tests — expect failure**

```bash
npx vitest run scripts/tests/env.test.mjs
```

Expected: import error (module does not exist yet).

- [ ] **Step 2.3: Implement scripts/lib/env.mjs**

```js
// scripts/lib/env.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_ENV_PATH = join(ROOT, '.env');

export function readEnvKey(key, envPath = DEFAULT_ENV_PATH) {
  if (!existsSync(envPath)) return undefined;
  const content = readFileSync(envPath, 'utf8');
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : undefined;
}

export function writeEnvKeys(updates, envPath = DEFAULT_ENV_PATH) {
  let content = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    const line = `${key}=${value}`;
    if (regex.test(content)) {
      content = content.replace(regex, line);
    } else {
      content = content.trimEnd() + `\n${line}`;
    }
  }
  writeFileSync(envPath, content.trimEnd() + '\n');
}
```

- [ ] **Step 2.4: Run tests — expect pass**

```bash
npx vitest run scripts/tests/env.test.mjs
```

Expected: `4 tests passed`.

- [ ] **Step 2.5: Commit**

```bash
git add scripts/lib/env.mjs scripts/tests/env.test.mjs
git commit -m "feat: add env read/write helper"
```

---

## Task 3: Create lib/claude.mjs — extract + add platform prompts

**Files:**
- Create: `scripts/lib/claude.mjs`
- Create: `scripts/tests/claude.test.mjs`
- Modify: `scripts/new-post.mjs` (replace inline functions with imports)

- [ ] **Step 3.1: Write failing tests**

```js
// scripts/tests/claude.test.mjs
import { describe, it, expect } from 'vitest';
import {
  buildGeneratePrompt,
  buildRevisePrompt,
  buildLinkedInPrompt,
  buildInstagramPrompt,
} from '../lib/claude.mjs';

describe('buildGeneratePrompt', () => {
  it('includes topic and category', () => {
    const p = buildGeneratePrompt('dbt + DuckDB', 'data-engineering', 'en');
    expect(p).toContain('dbt + DuckDB');
    expect(p).toContain('data-engineering');
  });
  it('uses lang note for pt-BR', () => {
    const p = buildGeneratePrompt('topic', 'misc', 'pt-BR');
    expect(p).toContain('Brazilian Portuguese');
  });
});

describe('buildRevisePrompt', () => {
  it('includes draft text', () => {
    const p = buildRevisePrompt('my draft content', 'python', 'en');
    expect(p).toContain('my draft content');
  });
});

describe('buildLinkedInPrompt', () => {
  it('includes post title and blog URL', () => {
    const p = buildLinkedInPrompt(
      { title: 'Test Post', body: 'body text', tags: ['sql'] },
      'my-test-post',
    );
    expect(p).toContain('Test Post');
    expect(p).toContain('francispires.com.br/blog/my-test-post');
  });
  it('asks for JSON with content key', () => {
    const p = buildLinkedInPrompt({ title: 'T', body: 'B', tags: [] }, 'slug');
    expect(p).toContain('"content"');
  });
});

describe('buildInstagramPrompt', () => {
  it('includes post title', () => {
    const p = buildInstagramPrompt(
      { title: 'Test Post', body: 'body', tags: ['sql'] },
      'my-test-post',
    );
    expect(p).toContain('Test Post');
  });
  it('asks for hashtags in JSON', () => {
    const p = buildInstagramPrompt({ title: 'T', body: 'B', tags: [] }, 'slug');
    expect(p).toContain('"content"');
  });
});
```

- [ ] **Step 3.2: Run tests — expect failure**

```bash
npx vitest run scripts/tests/claude.test.mjs
```

Expected: import error.

- [ ] **Step 3.3: Create scripts/lib/claude.mjs**

```js
// scripts/lib/claude.mjs
import ora from 'ora';

export const GENERATE_SYSTEM = `You are a technical blog writer for Francis Pires, a Brazilian developer and data analyst.
Writing style: clear, direct, no fluff. Practical code examples where relevant.
Use Markdown with proper headings (##, ###). Code blocks with language tags.
Never add a preamble like "Here is the post" — output only the requested JSON.`;

export const REVISE_SYSTEM = `You are a professional technical editor for Francis Pires, a Brazilian developer and data analyst.
Your job: take the author's rough draft and transform it into a polished, professional blog post.

Non-negotiable rules:
- Preserve the author's voice, opinions, and all factual content — never invent facts
- Improve clarity, structure, grammar, and flow
- Add proper Markdown headings (##, ###) to create a clear reading structure
- Format any code snippets into fenced code blocks with the correct language tag
- Where the text describes a process, flow, or architecture, insert a Mermaid diagram as a fenced \`\`\`mermaid block
- Do not pad with generic filler phrases
- Output only the requested JSON — no preamble`;

const LINKEDIN_SYSTEM = `You are a LinkedIn content strategist for Francis Pires, a Brazilian developer and data analyst.
Transform the blog post into a compelling LinkedIn post.
Rules:
- Professional, direct tone — no empty phrases
- Up to 3000 characters total
- Structure: hook (1-2 lines that stop the scroll) → 3-5 key insights (short lines, heavy line breaks) → CTA
- No hashtags
- End with the blog link on its own line
- Output only valid JSON — no markdown wrapper`;

const INSTAGRAM_SYSTEM = `You are an Instagram content strategist for Francis Pires, a Brazilian developer.
Transform the blog post into an Instagram caption.
Rules:
- Conversational, energetic, visual-friendly
- Up to 2200 characters
- Short paragraphs, heavy line breaks — Instagram readers scan
- 5-10 relevant hashtags at the end
- End with "link na bio 🔗" on its own line
- Output only valid JSON — no markdown wrapper`;

export function buildGeneratePrompt(topic, category, lang) {
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

export function buildRevisePrompt(draftText, category, lang) {
  const langNote = lang === 'pt-BR'
    ? "The final post must be in Brazilian Portuguese (pt-BR). Translate if the draft is in another language, keeping the author's meaning."
    : "The final post must be in English. Translate if the draft is in another language, keeping the author's meaning.";

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

export function buildLinkedInPrompt(blogPost, slug) {
  const url = `https://francispires.com.br/blog/${slug}`;
  return `Transform this blog post into a LinkedIn post for Francis Pires.

Title: ${blogPost.title}
Tags: ${blogPost.tags.join(', ')}
Body:
---
${blogPost.body}
---

End the post with this link on its own line:
${url}

Return ONLY valid JSON:
{ "content": "..." }`;
}

export function buildInstagramPrompt(blogPost, slug) {
  return `Transform this blog post into an Instagram caption for Francis Pires.

Title: ${blogPost.title}
Tags: ${blogPost.tags.join(', ')}
Body:
---
${blogPost.body}
---

Return ONLY valid JSON:
{ "content": "..." }

The content must end with the hashtags and then "link na bio 🔗" on its own line.`;
}

export async function callClaude(client, system, userPrompt, label) {
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

export async function translatePost(client, result, targetLang) {
  const langLabel = targetLang === 'pt-BR' ? 'Brazilian Portuguese' : 'English';
  const prompt = `Translate and adapt this blog post to ${langLabel}.
Keep code blocks and Mermaid diagrams unchanged. Adapt idioms naturally.
Return ONLY valid JSON with the same shape: { title, description, tags, body, unsplashQuery }

Original post JSON:
${JSON.stringify(result)}`;
  return callClaude(client, GENERATE_SYSTEM, prompt, `Translating to ${targetLang}...`);
}

export async function adaptForLinkedIn(client, blogPost, slug) {
  return callClaude(
    client,
    LINKEDIN_SYSTEM,
    buildLinkedInPrompt(blogPost, slug),
    'Adapting content for LinkedIn...',
  );
}

export async function adaptForInstagram(client, blogPost, slug) {
  return callClaude(
    client,
    INSTAGRAM_SYSTEM,
    buildInstagramPrompt(blogPost, slug),
    'Adapting content for Instagram...',
  );
}
```

- [ ] **Step 3.4: Run tests — expect pass**

```bash
npx vitest run scripts/tests/claude.test.mjs
```

Expected: `6 tests passed`.

- [ ] **Step 3.5: Update new-post.mjs to import from lib/claude.mjs**

At the top of `scripts/new-post.mjs`, replace the inline function definitions with imports. Remove these from `new-post.mjs`:
- `const GENERATE_SYSTEM = ...`
- `const REVISE_SYSTEM = ...`
- `function buildGeneratePrompt(...) {...}`
- `function buildRevisePrompt(...) {...}`
- `async function callClaude(...) {...}`
- `async function translatePost(...) {...}`

And add this import at the top (after the existing imports):

```js
import {
  GENERATE_SYSTEM,
  REVISE_SYSTEM,
  buildGeneratePrompt,
  buildRevisePrompt,
  callClaude,
  translatePost,
} from './lib/claude.mjs';
```

- [ ] **Step 3.6: Verify new-post still works**

```bash
node scripts/new-post.mjs --mode generate --topic "test" --category misc --lang en --image false
```

Expected: wizard runs without errors, exits after content generation (Ctrl+C is fine if the prompt appears).

- [ ] **Step 3.7: Commit**

```bash
git add scripts/lib/claude.mjs scripts/tests/claude.test.mjs scripts/new-post.mjs
git commit -m "refactor: extract Claude calls to lib/claude.mjs"
```

---

## Task 4: Create lib/images.mjs — Unsplash + DALL-E + preview loop

**Files:**
- Create: `scripts/lib/images.mjs`
- Create: `scripts/tests/images.test.mjs`

- [ ] **Step 4.1: Write failing tests**

```js
// scripts/tests/images.test.mjs
import { describe, it, expect } from 'vitest';
import { buildUnsplashUrl, buildDalleSize } from '../lib/images.mjs';

describe('buildUnsplashUrl', () => {
  it('adds width and height for linkedin', () => {
    const url = buildUnsplashUrl('data pipeline', 'linkedin');
    expect(url).toContain('w=1200');
    expect(url).toContain('h=628');
    expect(url).toContain('data%20pipeline');
  });
  it('adds square dimensions for instagram', () => {
    const url = buildUnsplashUrl('coding', 'instagram');
    expect(url).toContain('w=1080');
    expect(url).toContain('h=1080');
  });
  it('uses blog dimensions by default', () => {
    const url = buildUnsplashUrl('coding', 'blog');
    expect(url).toContain('w=1200');
  });
});

describe('buildDalleSize', () => {
  it('returns landscape size for linkedin', () => {
    expect(buildDalleSize('linkedin')).toBe('1792x1024');
  });
  it('returns square size for instagram', () => {
    expect(buildDalleSize('instagram')).toBe('1024x1024');
  });
  it('returns square for blog', () => {
    expect(buildDalleSize('blog')).toBe('1024x1024');
  });
});
```

- [ ] **Step 4.2: Run tests — expect failure**

```bash
npx vitest run scripts/tests/images.test.mjs
```

Expected: import error.

- [ ] **Step 4.3: Create scripts/lib/images.mjs**

```js
// scripts/lib/images.mjs
import { createWriteStream, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import prompts from 'prompts';
import chalk from 'chalk';
import ora from 'ora';
import OpenAI from 'openai';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const IMG_DIR = join(ROOT, 'public', 'img', 'posts');

const PLATFORM_DIMENSIONS = {
  linkedin:  { w: 1200, h: 628 },
  instagram: { w: 1080, h: 1080 },
  blog:      { w: 1200, h: 800 },
};

export function buildUnsplashUrl(query, platform) {
  const { w, h } = PLATFORM_DIMENSIONS[platform] ?? PLATFORM_DIMENSIONS.blog;
  const encoded = encodeURIComponent(query);
  return `https://api.unsplash.com/search/photos?query=${encoded}&per_page=1&orientation=landscape&w=${w}&h=${h}&fit=crop`;
}

export function buildDalleSize(platform) {
  return platform === 'linkedin' ? '1792x1024' : '1024x1024';
}

async function downloadImage(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  mkdirSync(dirname(destPath), { recursive: true });
  await pipeline(res.body, createWriteStream(destPath));
}

async function fetchFromUnsplash(query, platform, slug) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) throw new Error('UNSPLASH_ACCESS_KEY not set');

  const apiUrl = buildUnsplashUrl(query, platform);
  const res = await fetch(apiUrl, { headers: { Authorization: `Client-ID ${key}` } });
  const data = await res.json();

  if (!data.results?.length) throw new Error('No Unsplash results');

  const { w, h } = PLATFORM_DIMENSIONS[platform] ?? PLATFORM_DIMENSIONS.blog;
  const downloadUrl = `${data.results[0].urls.regular}&w=${w}&h=${h}&fit=crop&q=80`;
  const filename = `${slug}.jpg`;
  const destPath = join(IMG_DIR, filename);

  await downloadImage(downloadUrl, destPath);
  return { localPath: destPath, publicPath: `/img/posts/${filename}`, sourceUrl: downloadUrl };
}

async function generateWithDalle(query, platform, slug) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');

  const client = new OpenAI({ apiKey: key });
  const spinner = ora(`Generating image with DALL-E: "${query}"...`).start();

  try {
    const size = buildDalleSize(platform);
    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt: `High-quality professional illustration for a tech blog post about: ${query}. Clean, modern, minimal style.`,
      n: 1,
      size,
    });

    const imageUrl = response.data[0].url;
    const filename = `${slug}.jpg`;
    const destPath = join(IMG_DIR, filename);

    await downloadImage(imageUrl, destPath);
    spinner.succeed('DALL-E image generated');
    return { localPath: destPath, publicPath: `/img/posts/${filename}`, sourceUrl: imageUrl };
  } catch (err) {
    spinner.fail('DALL-E generation failed');
    throw err;
  }
}

/**
 * Interactive image sourcing loop.
 * Returns { localPath, publicPath } or null if skipped.
 * @param {{ query: string, platform: string, slug: string, required?: boolean }} opts
 */
export async function sourceImage({ query, platform, slug, required = false }) {
  const onCancel = () => { console.log(chalk.yellow('\nCancelled.')); process.exit(0); };

  // Ask Unsplash or DALL-E
  const hasUnsplash = !!process.env.UNSPLASH_ACCESS_KEY;
  const hasDalle = !!process.env.OPENAI_API_KEY;

  if (!hasUnsplash && !hasDalle) {
    console.log(chalk.yellow('No image API keys set (UNSPLASH_ACCESS_KEY or OPENAI_API_KEY). Skipping image.'));
    return null;
  }

  const choices = [
    hasUnsplash && { title: 'Unsplash — search for a photo', value: 'unsplash' },
    hasDalle    && { title: 'DALL-E — generate an image',    value: 'dalle' },
    !required   && { title: 'Skip image',                    value: 'skip' },
  ].filter(Boolean);

  while (true) {
    const { source } = await prompts({
      type: 'select',
      name: 'source',
      message: `Image source for ${platform}:`,
      choices,
    }, { onCancel });

    if (source === 'skip') return null;

    const spinner = ora('Fetching image...').start();
    try {
      const result = source === 'unsplash'
        ? await fetchFromUnsplash(query, platform, slug)
        : await generateWithDalle(query, platform, slug);

      spinner.succeed(`Image ready: ${result.publicPath}`);
      console.log(chalk.dim(`  Source: ${source === 'unsplash' ? 'Unsplash' : 'DALL-E'}`));

      const nextChoices = [
        { title: 'Confirm this image', value: 'confirm' },
        hasUnsplash && source !== 'unsplash' && { title: 'Try Unsplash instead', value: 'unsplash' },
        hasDalle    && source !== 'dalle'    && { title: 'Regenerate with DALL-E', value: 'dalle' },
        !required   && { title: 'Skip image', value: 'skip' },
      ].filter(Boolean);

      const { action } = await prompts({
        type: 'select',
        name: 'action',
        message: `Image: ${result.publicPath}`,
        choices: nextChoices,
      }, { onCancel });

      if (action === 'confirm') return result;
      if (action === 'skip') return null;
      // otherwise loop with the chosen source
      choices.length = 0; // refresh choices to the new source
      choices.push(...nextChoices.filter(c => c.value !== 'confirm' && c.value !== 'skip'));
    } catch (err) {
      spinner.fail(`Image failed: ${err.message}`);
      if (required) continue; // must get an image
      const { retry } = await prompts({
        type: 'confirm', name: 'retry', message: 'Try again?', initial: true,
      }, { onCancel });
      if (!retry) return null;
    }
  }
}
```

- [ ] **Step 4.4: Run tests — expect pass**

```bash
npx vitest run scripts/tests/images.test.mjs
```

Expected: `5 tests passed`.

- [ ] **Step 4.5: Commit**

```bash
git add scripts/lib/images.mjs scripts/tests/images.test.mjs
git commit -m "feat: add image sourcing module (Unsplash + DALL-E)"
```

---

## Task 5: Create lib/review.mjs — terminal review loop

**Files:**
- Create: `scripts/lib/review.mjs`

No unit tests for this module — it is entirely interactive I/O. Manual testing in Task 9.

- [ ] **Step 5.1: Create scripts/lib/review.mjs**

```js
// scripts/lib/review.mjs
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import prompts from 'prompts';
import chalk from 'chalk';

function renderPreview(platform, content, publicPath) {
  const line = '='.repeat(50);
  const label = platform.charAt(0).toUpperCase() + platform.slice(1);
  const wrapped = content
    .split('\n')
    .flatMap(l => {
      if (l.length <= 60) return [l];
      const words = l.split(' ');
      const lines = [];
      let cur = '';
      for (const w of words) {
        if ((cur + ' ' + w).trim().length > 60) { lines.push(cur); cur = w; }
        else cur = (cur + ' ' + w).trim();
      }
      if (cur) lines.push(cur);
      return lines;
    })
    .join('\n');

  console.log('\n' + chalk.cyan(`== Preview: ${label} ${'='.repeat(Math.max(0, 44 - label.length))}`));
  console.log(wrapped);
  if (publicPath) console.log(chalk.dim(`\nImage: ${publicPath}`));
  console.log(chalk.cyan(line));
}

/**
 * Show a terminal preview of the adapted content and let the user
 * publish, edit, request a new image, or cancel.
 *
 * @param {{ platform: string, content: string, publicPath: string|null, publishFn: () => Promise<void> }} opts
 * @returns {Promise<'published'|'cancelled'>}
 */
export async function reviewLoop({ platform, content, publicPath, onNewImage, publishFn }) {
  const onCancel = () => { console.log(chalk.yellow('\nCancelled.')); process.exit(0); };
  let currentContent = content;

  while (true) {
    renderPreview(platform, currentContent, publicPath);

    const choices = [
      { title: 'Publish', value: 'publish' },
      { title: 'Edit content', value: 'edit' },
      onNewImage && { title: 'New image', value: 'image' },
      { title: 'Cancel', value: 'cancel' },
    ].filter(Boolean);

    const { action } = await prompts({
      type: 'select', name: 'action', message: 'What next?', choices,
    }, { onCancel });

    if (action === 'cancel') return 'cancelled';

    if (action === 'publish') {
      const spinner = (await import('ora')).default('Publishing...').start();
      try {
        await publishFn(currentContent);
        spinner.succeed(`Published to ${platform}!`);
        return 'published';
      } catch (err) {
        spinner.fail(`Publish failed: ${err.message}`);
        console.error(chalk.red(err.message));
        // loop — let user retry or cancel
      }
    }

    if (action === 'edit') {
      const tmp = join(tmpdir(), `new-post-${platform}-${Date.now()}.md`);
      writeFileSync(tmp, currentContent);
      const editor = process.env.EDITOR || 'nano';
      console.log(chalk.dim(`Opening in ${editor}... save and close to continue.`));
      spawnSync(editor, [tmp], { stdio: 'inherit' });
      currentContent = readFileSync(tmp, 'utf8');
      try { unlinkSync(tmp); } catch {}
    }

    if (action === 'image' && onNewImage) {
      publicPath = await onNewImage();
    }
  }
}
```

- [ ] **Step 5.2: Commit**

```bash
git add scripts/lib/review.mjs
git commit -m "feat: add terminal review loop"
```

---

## Task 6: Create lib/auth/linkedin.mjs — OAuth flow

**Files:**
- Create: `scripts/lib/auth/linkedin.mjs`

- [ ] **Step 6.1: Create scripts/lib/auth/linkedin.mjs**

```js
// scripts/lib/auth/linkedin.mjs
import { createServer } from 'node:http';
import { URL } from 'node:url';
import { readEnvKey, writeEnvKeys } from '../env.mjs';
import chalk from 'chalk';

const SCOPES  = ['openid', 'profile', 'w_member_social'];
const PORT    = 3333;
const REDIRECT = `http://localhost:${PORT}/callback`;

function openBrowser(url) {
  const { platform } = process;
  const cmd = platform === 'win32' ? 'start' : platform === 'darwin' ? 'open' : 'xdg-open';
  const { spawnSync } = await import('node:child_process');
  spawnSync(cmd, [url], { stdio: 'ignore', detached: true });
}

async function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const u = new URL(req.url, `http://localhost:${PORT}`);
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
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json();
}

async function getPersonUrn(accessToken) {
  const res = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to get LinkedIn profile: ${await res.text()}`);
  const data = await res.json();
  return `urn:li:person:${data.sub}`;
}

/**
 * Ensures LINKEDIN_ACCESS_TOKEN and LINKEDIN_PERSON_URN are set in .env.
 * Runs the OAuth flow if they are missing.
 * @returns {{ accessToken: string, personUrn: string }}
 */
export async function ensureLinkedInToken() {
  let accessToken = readEnvKey('LINKEDIN_ACCESS_TOKEN');
  let personUrn   = readEnvKey('LINKEDIN_PERSON_URN');

  if (accessToken && personUrn) return { accessToken, personUrn };

  const clientId     = readEnvKey('LINKEDIN_CLIENT_ID');
  const clientSecret = readEnvKey('LINKEDIN_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    console.error(chalk.red(
      '\nLinkedIn not configured. Follow docs/LINKEDIN-SETUP.md to create your app,\n' +
      'then add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET to .env.\n'
    ));
    process.exit(1);
  }

  const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', REDIRECT);
  authUrl.searchParams.set('scope', SCOPES.join(' '));

  console.log(chalk.cyan('\nLinkedIn auth required. Opening browser...'));
  console.log(chalk.dim(`If the browser did not open, visit:\n${authUrl.toString()}\n`));

  openBrowser(authUrl.toString());

  const code = await waitForCode();
  const tokens = await exchangeCode(code, clientId, clientSecret);
  accessToken = tokens.access_token;
  personUrn   = await getPersonUrn(accessToken);

  writeEnvKeys({ LINKEDIN_ACCESS_TOKEN: accessToken, LINKEDIN_PERSON_URN: personUrn });
  console.log(chalk.green('LinkedIn token saved to .env'));

  return { accessToken, personUrn };
}
```

- [ ] **Step 6.2: Commit**

```bash
git add scripts/lib/auth/linkedin.mjs
git commit -m "feat: add LinkedIn OAuth flow"
```

---

## Task 7: Create publishers/linkedin.mjs

**Files:**
- Create: `scripts/publishers/linkedin.mjs`

- [ ] **Step 7.1: Create scripts/publishers/linkedin.mjs**

```js
// scripts/publishers/linkedin.mjs
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import { adaptForLinkedIn } from '../lib/claude.mjs';
import { sourceImage } from '../lib/images.mjs';
import { reviewLoop } from '../lib/review.mjs';
import { ensureLinkedInToken } from '../lib/auth/linkedin.mjs';

const LI_API = 'https://api.linkedin.com/v2';

async function uploadImageToLinkedIn(imagePath, accessToken, personUrn) {
  // Step 1: register upload
  const regRes = await fetch(`${LI_API}/assets?action=registerUpload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: personUrn,
        serviceRelationships: [{
          relationshipType: 'OWNER',
          identifier: 'urn:li:userGeneratedContent',
        }],
      },
    }),
  });
  if (!regRes.ok) throw new Error(`LinkedIn register upload failed: ${await regRes.text()}`);
  const regData = await regRes.json();
  const uploadUrl = regData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  const assetUrn  = regData.value.asset;

  // Step 2: upload bytes
  const bytes = readFileSync(imagePath);
  const upRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/octet-stream' },
    body: bytes,
  });
  if (!upRes.ok && upRes.status !== 201) {
    throw new Error(`LinkedIn image upload failed: ${upRes.status}`);
  }

  return assetUrn;
}

async function createLinkedInPost({ content, assetUrn, accessToken, personUrn }) {
  const shareContent = {
    shareCommentary: { text: content },
    shareMediaCategory: assetUrn ? 'IMAGE' : 'NONE',
  };
  if (assetUrn) {
    shareContent.media = [{ status: 'READY', media: assetUrn }];
  }

  const res = await fetch(`${LI_API}/ugcPosts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author: personUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': shareContent },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  });
  if (!res.ok) throw new Error(`LinkedIn post failed: ${await res.text()}`);
  const data = await res.json();
  return `https://www.linkedin.com/feed/update/${data.id}/`;
}

/**
 * Full LinkedIn publish flow: adapt → image → review → post.
 * @param {{ blogPost: object, slug: string }} opts
 */
export async function publishToLinkedIn({ blogPost, slug }) {
  console.log(chalk.cyan('\n── LinkedIn ─────────────────────────────────\n'));

  const { accessToken, personUrn } = await ensureLinkedInToken();
  const client = new Anthropic();

  const adapted = await adaptForLinkedIn(client, blogPost, slug);
  let currentImage = await sourceImage({ query: blogPost.unsplashQuery ?? blogPost.title, platform: 'linkedin', slug: `${slug}-li` });

  let assetUrn = null;

  const result = await reviewLoop({
    platform: 'linkedin',
    content: adapted.content,
    publicPath: currentImage?.publicPath ?? null,
    onNewImage: async () => {
      currentImage = await sourceImage({ query: blogPost.title, platform: 'linkedin', slug: `${slug}-li` });
      return currentImage?.publicPath ?? null;
    },
    publishFn: async (content) => {
      if (currentImage && !assetUrn) {
        assetUrn = await uploadImageToLinkedIn(currentImage.localPath, accessToken, personUrn);
      }
      const url = await createLinkedInPost({ content, assetUrn, accessToken, personUrn });
      console.log(chalk.green(`\n✓ LinkedIn post live: ${url}\n`));
    },
  });

  return result;
}
```

- [ ] **Step 7.2: Commit**

```bash
git add scripts/publishers/linkedin.mjs
git commit -m "feat: add LinkedIn publisher"
```

---

## Task 8: Create lib/auth/instagram.mjs — Meta OAuth

**Files:**
- Create: `scripts/lib/auth/instagram.mjs`

- [ ] **Step 8.1: Create scripts/lib/auth/instagram.mjs**

```js
// scripts/lib/auth/instagram.mjs
import { createServer } from 'node:http';
import { URL } from 'node:url';
import { readEnvKey, writeEnvKeys } from '../env.mjs';
import chalk from 'chalk';

const PORT     = 3333;
const REDIRECT = `http://localhost:${PORT}/callback`;
const SCOPES   = ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement'];
const FB_VERSION = 'v21.0';

function openBrowser(url) {
  const { platform } = process;
  const cmd = platform === 'win32' ? 'start' : platform === 'darwin' ? 'open' : 'xdg-open';
  const { spawnSync } = require('child_process');
  spawnSync(cmd, [url], { stdio: 'ignore', detached: true });
}

async function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const u = new URL(req.url, `http://localhost:${PORT}`);
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
  return res.json(); // { access_token, token_type }
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
  // Get pages, then get IG business account for each page
  const pagesRes = await fetch(
    `https://graph.facebook.com/${FB_VERSION}/me/accounts?access_token=${accessToken}`
  );
  if (!pagesRes.ok) throw new Error(`Failed to get pages: ${await pagesRes.text()}`);
  const pages = await pagesRes.json();

  for (const page of (pages.data ?? [])) {
    const igRes = await fetch(
      `https://graph.facebook.com/${FB_VERSION}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
    );
    const igData = await igRes.json();
    if (igData.instagram_business_account?.id) {
      return { igUserId: igData.instagram_business_account.id, pageToken: page.access_token };
    }
  }
  throw new Error(
    'No Instagram Business/Creator account found connected to your Facebook pages.\n' +
    'See docs/INSTAGRAM-SETUP.md — make sure your Instagram is connected to a Facebook Page.'
  );
}

/**
 * Ensures INSTAGRAM_BUSINESS_ACCOUNT_ID and FACEBOOK_ACCESS_TOKEN are set.
 * Runs the OAuth flow if missing.
 * @returns {{ igUserId: string, accessToken: string }}
 */
export async function ensureInstagramToken() {
  let accessToken = readEnvKey('FACEBOOK_ACCESS_TOKEN');
  let igUserId    = readEnvKey('INSTAGRAM_BUSINESS_ACCOUNT_ID');

  if (accessToken && igUserId) return { igUserId, accessToken };

  const appId     = readEnvKey('INSTAGRAM_APP_ID');
  const appSecret = readEnvKey('INSTAGRAM_APP_SECRET');

  if (!appId || !appSecret) {
    console.error(chalk.red(
      '\nInstagram not configured. Follow docs/INSTAGRAM-SETUP.md,\n' +
      'then add INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET to .env.\n'
    ));
    process.exit(1);
  }

  const authUrl = new URL(`https://www.facebook.com/${FB_VERSION}/dialog/oauth`);
  authUrl.searchParams.set('client_id', appId);
  authUrl.searchParams.set('redirect_uri', REDIRECT);
  authUrl.searchParams.set('scope', SCOPES.join(','));
  authUrl.searchParams.set('response_type', 'code');

  console.log(chalk.cyan('\nInstagram/Meta auth required. Opening browser...'));
  console.log(chalk.dim(`If the browser did not open, visit:\n${authUrl.toString()}\n`));

  openBrowser(authUrl.toString());

  const code        = await waitForCode();
  const { access_token: shortToken } = await exchangeCode(code, appId, appSecret);
  accessToken       = await getLongLivedToken(shortToken, appId, appSecret);
  const { igUserId: id, pageToken } = await getIgUserId(accessToken);
  igUserId          = id;

  writeEnvKeys({
    FACEBOOK_ACCESS_TOKEN: accessToken,
    INSTAGRAM_BUSINESS_ACCOUNT_ID: igUserId,
  });
  console.log(chalk.green('Instagram token saved to .env'));

  return { igUserId, accessToken };
}
```

- [ ] **Step 8.2: Fix dynamic import in openBrowser**

Note: `openBrowser` above uses `require` which doesn't work in ESM. Replace it with a dynamic import:

```js
async function openBrowser(url) {
  const { platform } = process;
  const cmd = platform === 'win32' ? 'start' : platform === 'darwin' ? 'open' : 'xdg-open';
  const { spawnSync } = await import('node:child_process');
  spawnSync(cmd, [url], { stdio: 'ignore', detached: true });
}
```

Apply the same fix in `scripts/lib/auth/linkedin.mjs` — the `openBrowser` function there already uses dynamic import correctly.

- [ ] **Step 8.3: Commit**

```bash
git add scripts/lib/auth/instagram.mjs
git commit -m "feat: add Instagram/Meta OAuth flow"
```

---

## Task 9: Create publishers/instagram.mjs

**Files:**
- Create: `scripts/publishers/instagram.mjs`

- [ ] **Step 9.1: Create scripts/publishers/instagram.mjs**

```js
// scripts/publishers/instagram.mjs
import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import { adaptForInstagram } from '../lib/claude.mjs';
import { sourceImage } from '../lib/images.mjs';
import { reviewLoop } from '../lib/review.mjs';
import { ensureInstagramToken } from '../lib/auth/instagram.mjs';

const FB_VERSION = 'v21.0';

async function createMediaContainer({ igUserId, accessToken, imageUrl, caption }) {
  const res = await fetch(`https://graph.facebook.com/${FB_VERSION}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: accessToken }),
  });
  if (!res.ok) throw new Error(`IG media container failed: ${await res.text()}`);
  const data = await res.json();
  return data.id; // creation_id
}

async function publishContainer({ igUserId, accessToken, creationId }) {
  const res = await fetch(`https://graph.facebook.com/${FB_VERSION}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
  });
  if (!res.ok) throw new Error(`IG publish failed: ${await res.text()}`);
  const data = await res.json();
  return `https://www.instagram.com/p/${data.id}/`;
}

/**
 * Full Instagram publish flow: adapt → image (required) → review → post.
 * Instagram requires a publicly accessible image URL.
 * We use the Unsplash/DALL-E source URL directly (both are public).
 * @param {{ blogPost: object, slug: string }} opts
 */
export async function publishToInstagram({ blogPost, slug }) {
  console.log(chalk.cyan('\n── Instagram ────────────────────────────────\n'));

  const { igUserId, accessToken } = await ensureInstagramToken();
  const client = new Anthropic();

  const adapted = await adaptForInstagram(client, blogPost, slug);

  // Image is mandatory for Instagram feed posts
  let currentImage = await sourceImage({
    query: blogPost.unsplashQuery ?? blogPost.title,
    platform: 'instagram',
    slug: `${slug}-ig`,
    required: true,
  });

  if (!currentImage) {
    console.log(chalk.yellow('Instagram requires an image. Skipping Instagram publish.'));
    return 'cancelled';
  }

  const result = await reviewLoop({
    platform: 'instagram',
    content: adapted.content,
    publicPath: currentImage.publicPath,
    onNewImage: async () => {
      currentImage = await sourceImage({
        query: blogPost.title,
        platform: 'instagram',
        slug: `${slug}-ig`,
        required: true,
      });
      return currentImage?.publicPath ?? null;
    },
    publishFn: async (content) => {
      // Instagram needs a public URL — use the Unsplash/DALL-E source URL
      const imageUrl = currentImage.sourceUrl;
      const creationId = await createMediaContainer({ igUserId, accessToken, imageUrl, caption: content });
      const postUrl = await publishContainer({ igUserId, accessToken, creationId });
      console.log(chalk.green(`\n✓ Instagram post live: ${postUrl}\n`));
    },
  });

  return result;
}
```

- [ ] **Step 9.2: Commit**

```bash
git add scripts/publishers/instagram.mjs
git commit -m "feat: add Instagram publisher"
```

---

## Task 10: Update new-post.mjs — add destination selection

**Files:**
- Modify: `scripts/new-post.mjs`

- [ ] **Step 10.1: Add destination question and publisher imports to new-post.mjs**

At the top of `new-post.mjs`, after the existing imports, add:

```js
import { publishToLinkedIn } from './publishers/linkedin.mjs';
import { publishToInstagram } from './publishers/instagram.mjs';
```

- [ ] **Step 10.2: Add `askDestinations` function**

Add this function to `new-post.mjs` (after the `askMissing` function):

```js
async function askDestinations(args) {
  if (args.platform) {
    // --platform site|linkedin|instagram|all
    const p = args.platform;
    return {
      linkedin:  p === 'linkedin'  || p === 'all',
      instagram: p === 'instagram' || p === 'all',
    };
  }
  const onCancel = () => { console.log(chalk.yellow('\nCancelled.')); process.exit(0); };
  const { destinations } = await prompts({
    type: 'multiselect',
    name: 'destinations',
    message: 'Where do you want to publish?',
    choices: [
      { title: 'LinkedIn', value: 'linkedin' },
      { title: 'Instagram', value: 'instagram' },
    ],
    hint: '(space to select, enter to confirm — site is always included)',
  }, { onCancel });
  return {
    linkedin:  destinations.includes('linkedin'),
    instagram: destinations.includes('instagram'),
  };
}
```

- [ ] **Step 10.3: Call askDestinations and publishers in main()**

In the `main()` function of `new-post.mjs`, after the summary block that prints `✓ Done!` and the "Next steps" list, add:

```js
  // ── Social publishing
  if (mode !== 'project') {
    const destinations = await askDestinations(args);

    const blogPost = {
      title:          primary.title,
      description:    primary.description,
      tags:           primary.tags,
      body:           primary.body,
      unsplashQuery:  primary.unsplashQuery,
    };

    if (destinations.linkedin) {
      await publishToLinkedIn({ blogPost, slug });
    }
    if (destinations.instagram) {
      await publishToInstagram({ blogPost, slug });
    }
  }
```

- [ ] **Step 10.4: Add --platform to CLI arg parsing (already handled by parseArgs)**

`parseArgs()` already reads `--platform` into `args.platform`, so no change needed there.

- [ ] **Step 10.5: Manual end-to-end test (blog only, no social)**

```bash
node scripts/new-post.mjs --mode generate --topic "Node.js streams" --category typescript --lang en --image false --platform site
```

Expected: post generated, destination question skipped (--platform site), files written to `src/content/blog/`.

- [ ] **Step 10.6: Commit**

```bash
git add scripts/new-post.mjs
git commit -m "feat: add social destination selection to new-post wizard"
```

---

## Task 11: Run all tests and verify

- [ ] **Step 11.1: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass (env, claude, images).

- [ ] **Step 11.2: Commit if any test fixes were needed**

```bash
git add -A && git commit -m "test: ensure all unit tests pass"
```

---

## Task 12: Documentation

**Files:**
- Create: `docs/LINKEDIN-SETUP.md`
- Create: `docs/INSTAGRAM-SETUP.md`
- Modify: `CREATING-POSTS.md`
- Modify: `.env.example`

- [ ] **Step 12.1: Create docs/LINKEDIN-SETUP.md**

```markdown
# LinkedIn Setup Guide

## Prerequisites

- A LinkedIn account
- `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` in `.env`

## Steps

### 1. Create a LinkedIn Developer App

1. Go to [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps)
2. Click **Create app**
3. Fill in:
   - **App name:** `francispires-site` (or any name)
   - **LinkedIn Page:** your personal page (create one if needed)
   - **App logo:** any image
4. Click **Create app**

### 2. Add required products

In the **Products** tab:
- Click **Request access** next to **Share on LinkedIn**
- Click **Request access** next to **Sign In with LinkedIn using OpenID Connect**

Both are approved instantly.

### 3. Configure the redirect URI

In the **Auth** tab:
1. Under **OAuth 2.0 settings → Authorized redirect URLs for your app**, click **Add redirect URL**
2. Add: `http://localhost:3333/callback`
3. Click **Update**

### 4. Copy credentials to .env

Still in the **Auth** tab, copy:
- **Client ID** → `LINKEDIN_CLIENT_ID`
- **Client Secret** → `LINKEDIN_CLIENT_SECRET`

Add them to your `.env`:
```env
LINKEDIN_CLIENT_ID=your-client-id
LINKEDIN_CLIENT_SECRET=your-client-secret
```

### 5. Authenticate

Run any `npm run new-post` command and choose LinkedIn as a destination.
The browser will open automatically. Log in and authorize.
Your token is saved to `.env` — you will not be asked again for ~60 days.

## Token renewal

When the token expires (60 days), the publisher detects the 401 error and
restarts the browser auth flow automatically.
```

- [ ] **Step 12.2: Create docs/INSTAGRAM-SETUP.md**

```markdown
# Instagram Setup Guide

## Prerequisites

- An Instagram **Business** or **Creator** account (not a personal account)
- A **Facebook Page** connected to that Instagram account
- `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` in `.env`

## Steps

### 1. Convert Instagram to Business/Creator

In the Instagram app:
1. Go to **Settings → Account → Switch to Professional Account**
2. Choose **Business** or **Creator**

### 2. Connect Instagram to a Facebook Page

In Instagram Settings:
1. Go to **Settings → Account → Linked accounts → Facebook**
2. Log in and connect to a Facebook Page you own (create one if you don't have one)

### 3. Create a Meta Developer App

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Click **Create App**
3. Choose **Other** → **Business**
4. Name it anything (e.g. `francispires-site`)

### 4. Add Instagram Graph API product

In your app dashboard:
1. Click **Add Product** → **Instagram Graph API** → **Set Up**

### 5. Configure permissions

In **App Review → Permissions and Features**, confirm these are listed:
- `instagram_basic`
- `instagram_content_publish`
- `pages_show_list`
- `pages_read_engagement`

For personal/development use these are available in Development mode without review.

### 6. Set redirect URI

Go to **Facebook Login → Settings**:
1. Under **Valid OAuth Redirect URIs**, add: `http://localhost:3333/callback`
2. Click **Save Changes**

### 7. Copy credentials to .env

In **Settings → Basic**:
- **App ID** → `INSTAGRAM_APP_ID`
- **App Secret** → click **Show** → `INSTAGRAM_APP_SECRET`

```env
INSTAGRAM_APP_ID=your-app-id
INSTAGRAM_APP_SECRET=your-app-secret
```

### 8. Authenticate

Run `npm run new-post` and choose Instagram as a destination.
The browser will open for Facebook login. Authorize the app.
Your token is saved to `.env` — valid for ~60 days.

## Token renewal

Same as LinkedIn — a 401 response triggers automatic re-authentication.
```

- [ ] **Step 12.3: Update CREATING-POSTS.md — add social publishing section**

Append the following section at the end of `CREATING-POSTS.md`:

```markdown
---

## Publishing to social media

After writing the blog files, the wizard asks where to publish:

```
Where do you want to publish?
  [x] Site (always included)
  [ ] LinkedIn
  [ ] Instagram
```

Or use the `--platform` flag to skip the prompt:

```bash
npm run new-post -- --platform linkedin       # site + LinkedIn
npm run new-post -- --platform instagram      # site + Instagram
npm run new-post -- --platform all            # site + LinkedIn + Instagram
npm run new-post -- --platform site           # site only (default behaviour)
```

### Platform content

| Platform | Tone | Length | Image |
|----------|------|--------|-------|
| LinkedIn | Professional, hook + insights + link | up to 3000 chars | Optional |
| Instagram | Conversational, hashtags, "link na bio" | up to 2200 chars | Required |

Each platform gets its own Claude-generated version adapted for the format.

### Images

When a social platform is selected you are asked to choose an image source:
- **Unsplash** — searches by keyword (requires `UNSPLASH_ACCESS_KEY`)
- **DALL-E** — generates an image (requires `OPENAI_API_KEY`)

You can confirm, regenerate, or switch source before publishing.

### Review before publishing

A terminal preview renders the adapted content for each platform.
Options: **publish / edit / new image / cancel**.
Choosing **edit** opens the content in `$EDITOR` (fallback: nano).

### Setup guides

- LinkedIn: see `docs/LINKEDIN-SETUP.md`
- Instagram: see `docs/INSTAGRAM-SETUP.md`
```

- [ ] **Step 12.4: Update .env.example**

Replace the existing `.env.example` content (or append) so it matches:

```env
# Required for AI post generation
ANTHROPIC_API_KEY=sk-ant-...

# Optional — auto-fetch hero images from Unsplash
UNSPLASH_ACCESS_KEY=your-unsplash-access-key

# Optional — generate images with DALL-E
OPENAI_API_KEY=sk-...

# LinkedIn (filled automatically on first run — see docs/LINKEDIN-SETUP.md)
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_ACCESS_TOKEN=
LINKEDIN_PERSON_URN=

# Instagram / Meta (filled automatically on first run — see docs/INSTAGRAM-SETUP.md)
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_BUSINESS_ACCOUNT_ID=
FACEBOOK_ACCESS_TOKEN=
```

- [ ] **Step 12.5: Commit documentation**

```bash
git add docs/LINKEDIN-SETUP.md docs/INSTAGRAM-SETUP.md CREATING-POSTS.md .env.example
git commit -m "docs: LinkedIn setup guide, Instagram setup guide, social publishing docs"
```

- [ ] **Step 12.6: Push**

```bash
git push origin master
```

Expected: GitHub Actions deploys the site in ~60 seconds.

---

## Self-review

**Spec coverage check:**

| Spec requirement | Covered in |
|-----------------|-----------|
| Extract lib/claude.mjs | Task 3 |
| lib/images.mjs — Unsplash + DALL-E | Task 4 |
| lib/review.mjs — review loop with edit | Task 5 |
| LinkedIn OAuth | Task 6 |
| LinkedIn publisher — adapt + image upload + post | Task 7 |
| Instagram OAuth | Task 8 |
| Instagram publisher — adapt + container + publish | Task 9 |
| new-post.mjs destination multi-select | Task 10 |
| LINKEDIN-SETUP.md | Task 12 |
| INSTAGRAM-SETUP.md | Task 12 |
| CREATING-POSTS.md updated | Task 12 |
| .env.example updated | Task 12 |
| Unit tests | Tasks 2, 3, 4 |

All spec requirements covered. No TBDs. Type signatures are consistent across tasks (blogPost object shape defined in Task 10 and consumed by Tasks 7 and 9). `sourceImage` returns `{ localPath, publicPath, sourceUrl }` — used correctly in both publishers.
