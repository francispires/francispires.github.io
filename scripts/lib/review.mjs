import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import prompts from 'prompts';
import chalk from 'chalk';
import ora from 'ora';

function renderPreview(platform, content, publicPath) {
  const label   = platform.charAt(0).toUpperCase() + platform.slice(1);
  const divider = '='.repeat(50);
  const wrapped = content
    .split('\n')
    .flatMap(line => {
      if (line.length <= 64) return [line];
      const words = line.split(' ');
      const lines = [];
      let cur = '';
      for (const word of words) {
        if ((cur + ' ' + word).trim().length > 64) { lines.push(cur); cur = word; }
        else cur = (cur + ' ' + word).trim();
      }
      if (cur) lines.push(cur);
      return lines;
    })
    .join('\n');

  console.log('\n' + chalk.cyan(`== Preview: ${label} ${'='.repeat(Math.max(0, 37 - label.length))}`));
  console.log(wrapped);
  if (publicPath) console.log(chalk.dim(`\nImage: ${publicPath}`));
  console.log(chalk.cyan(divider) + '\n');
}

/**
 * Show a terminal preview of adapted content and let the user publish, edit,
 * request a new image, or cancel.
 *
 * @param {{
 *   platform: string,
 *   content: string,
 *   publicPath: string | null,
 *   onNewImage?: () => Promise<string | null>,
 *   publishFn: (content: string) => Promise<void>
 * }} opts
 * @returns {Promise<'published' | 'cancelled'>}
 */
export async function reviewLoop({ platform, content, publicPath, onNewImage, publishFn }) {
  const onCancel = () => { console.log(chalk.yellow('\nCancelled.')); process.exit(0); };
  let currentContent = content;
  let currentImage   = publicPath;

  while (true) {
    renderPreview(platform, currentContent, currentImage);

    const choices = [
      { title: 'Publish',    value: 'publish' },
      { title: 'Edit',       value: 'edit'    },
      onNewImage && { title: 'New image', value: 'image' },
      { title: 'Cancel',     value: 'cancel'  },
    ].filter(Boolean);

    const { action } = await prompts({
      type: 'select', name: 'action', message: 'What next?', choices,
    }, { onCancel });

    if (action === 'cancel') return 'cancelled';

    if (action === 'publish') {
      const spinner = ora('Publishing...').start();
      try {
        await publishFn(currentContent);
        spinner.succeed(`Published to ${platform}!`);
        return 'published';
      } catch (err) {
        spinner.fail(`Publish failed: ${err.message}`);
        console.error(chalk.red(err.message));
      }
    }

    if (action === 'edit') {
      const tmp    = join(tmpdir(), `new-post-${platform}-${Date.now()}.md`);
      const editor = process.env.EDITOR || 'nano';
      writeFileSync(tmp, currentContent);
      console.log(chalk.dim(`Opening ${editor}... save and close to continue.`));
      spawnSync(editor, [tmp], { stdio: 'inherit' });
      currentContent = readFileSync(tmp, 'utf8');
      try { unlinkSync(tmp); } catch {}
    }

    if (action === 'image' && onNewImage) {
      const newPath = await onNewImage();
      if (newPath) currentImage = newPath;
    }
  }
}
