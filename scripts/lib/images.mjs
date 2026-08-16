import { createWriteStream, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import prompts from 'prompts';
import chalk from 'chalk';
import ora from 'ora';
import OpenAI from 'openai';

const ROOT    = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
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

  const { w, h } = PLATFORM_DIMENSIONS[platform] ?? PLATFORM_DIMENSIONS.blog;
  const apiUrl = buildUnsplashUrl(query, platform);
  const res = await fetch(apiUrl, { headers: { Authorization: `Client-ID ${key}` } });
  const data = await res.json();

  if (!data.results?.length) throw new Error('No Unsplash results');

  const sourceUrl  = `${data.results[0].urls.regular}&w=${w}&h=${h}&fit=crop&q=80`;
  const filename   = `${slug}.jpg`;
  const localPath  = join(IMG_DIR, filename);

  await downloadImage(sourceUrl, localPath);
  return { localPath, publicPath: `/img/posts/${filename}`, sourceUrl };
}

async function generateWithDalle(query, platform, slug) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');

  const client  = new OpenAI({ apiKey: key });
  const spinner = ora(`Generating image with DALL-E: "${query}"...`).start();

  try {
    const size     = buildDalleSize(platform);
    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt: `High-quality professional illustration for a tech blog post about: ${query}. Clean, modern, minimal style.`,
      n: 1,
      size,
    });

    const sourceUrl = response.data[0].url;
    const filename  = `${slug}.jpg`;
    const localPath = join(IMG_DIR, filename);

    await downloadImage(sourceUrl, localPath);
    spinner.succeed('DALL-E image generated');
    return { localPath, publicPath: `/img/posts/${filename}`, sourceUrl };
  } catch (err) {
    spinner.fail('DALL-E generation failed');
    throw err;
  }
}

/**
 * Interactive image sourcing loop.
 * @param {{ query: string, platform: string, slug: string, required?: boolean }} opts
 * @returns {Promise<{ localPath: string, publicPath: string, sourceUrl: string } | null>}
 */
export async function sourceImage({ query, platform, slug, required = false }) {
  const onCancel = () => { console.log(chalk.yellow('\nCancelled.')); process.exit(0); };
  const hasUnsplash = !!process.env.UNSPLASH_ACCESS_KEY;
  const hasDalle    = !!process.env.OPENAI_API_KEY;

  if (!hasUnsplash && !hasDalle) {
    console.log(chalk.yellow('No image API keys set (UNSPLASH_ACCESS_KEY or OPENAI_API_KEY). Skipping image.'));
    return null;
  }

  let source = null;

  // Initial source selection
  {
    const choices = [
      hasUnsplash && { title: 'Unsplash — search for a photo', value: 'unsplash' },
      hasDalle    && { title: 'DALL-E — generate an image',    value: 'dalle'   },
      !required   && { title: 'Skip image',                    value: 'skip'    },
    ].filter(Boolean);

    const answer = await prompts({
      type: 'select', name: 'source',
      message: `Image source for ${platform}:`,
      choices,
    }, { onCancel });
    source = answer.source;
  }

  if (source === 'skip') return null;

  while (true) {
    const spinner = ora('Fetching image...').start();
    try {
      const result = source === 'unsplash'
        ? await fetchFromUnsplash(query, platform, slug)
        : await generateWithDalle(query, platform, slug);

      spinner.succeed(`Image ready: ${result.publicPath}`);

      const nextChoices = [
        { title: 'Confirm this image', value: 'confirm' },
        hasUnsplash && source !== 'unsplash' && { title: 'Try Unsplash instead', value: 'unsplash' },
        hasDalle    && source !== 'dalle'    && { title: 'Regenerate with DALL-E', value: 'dalle'   },
        !required   && { title: 'Skip image', value: 'skip' },
      ].filter(Boolean);

      const { action } = await prompts({
        type: 'select', name: 'action',
        message: `Image: ${result.publicPath}`,
        choices: nextChoices,
      }, { onCancel });

      if (action === 'confirm') return result;
      if (action === 'skip') return null;
      source = action;
    } catch (err) {
      spinner.fail(`Image failed: ${err.message}`);
      if (required) {
        console.log(chalk.yellow('Image is required for this platform. Try again.'));
        continue;
      }
      const { retry } = await prompts({
        type: 'confirm', name: 'retry', message: 'Try again?', initial: true,
      }, { onCancel });
      if (!retry) return null;
    }
  }
}
