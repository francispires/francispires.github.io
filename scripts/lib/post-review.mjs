import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import prompts from 'prompts';
import chalk from 'chalk';
import { ensureDevServer } from './dev-server.mjs';
import { revisePostContent, translatePost } from './claude.mjs';
import matter from 'gray-matter';

function onCancel() {
  console.log(chalk.yellow('\nCancelled.'));
  process.exit(0);
}

function setDraftFalse(filepath) {
  const content = readFileSync(filepath, 'utf8');
  writeFileSync(filepath, content.replace(/^draft: true$/m, 'draft: false'));
}

async function applyRevision({ client, feedback, enFilePath, ptFilePath, isBilingual, primaryResult }) {
  // Revise the EN file (or PT-only if no EN)
  const targetPath  = enFilePath ?? ptFilePath;
  const current     = readFileSync(targetPath, 'utf8');
  const revisedText = await revisePostContent(client, current, feedback);
  writeFileSync(targetPath, revisedText);

  // If bilingual, re-translate EN → PT
  if (isBilingual && enFilePath && ptFilePath && existsSync(ptFilePath)) {
    const { data: fm, content: body } = matter(revisedText);
    const ptResult = await translatePost(client, {
      title:          fm.title          ?? primaryResult.title,
      description:    fm.description    ?? primaryResult.description,
      tags:           fm.tags           ?? primaryResult.tags ?? [],
      body:           body.trim(),
      unsplashQuery:  primaryResult.unsplashQuery ?? '',
    }, 'pt-BR');

    // Rebuild PT file: keep existing frontmatter metadata, update content fields
    const { data: ptFm } = matter(readFileSync(ptFilePath, 'utf8'));
    ptFm.title       = ptResult.title;
    ptFm.description = ptResult.description;
    ptFm.tags        = ptResult.tags;
    writeFileSync(ptFilePath, matter.stringify(ptResult.body, ptFm));
  }
}

/**
 * Interactive post review loop. Shows dev URL, accepts text feedback, applies
 * AI revisions, and returns true when the user confirms "publish".
 *
 * @param {{ client, slug, date, enFilePath, ptFilePath, isBilingual, primaryResult }} opts
 * @returns {Promise<boolean>} true = publish, false = cancelled
 */
export async function postReviewLoop({ client, slug, date, enFilePath, ptFilePath, isBilingual, primaryResult }) {
  const baseUrl = await ensureDevServer();

  const urls = [];
  if (enFilePath) urls.push(`${baseUrl}/blog/${date}-${slug}`);
  if (ptFilePath) urls.push(`${baseUrl}/blog/${date}-${slug}-pt`);

  console.log(chalk.cyan('\n✓ Post ready — open in browser:'));
  urls.forEach(u => console.log('  ' + chalk.bold.underline(u)));
  console.log(chalk.dim('\n  Type your feedback to revise, "publish" to publish, or "cancel" to exit.\n'));

  while (true) {
    const { action } = await prompts({
      type:    'text',
      name:    'action',
      message: 'Feedback / publish / cancel:',
    }, { onCancel });

    const trimmed = (action ?? '').trim().toLowerCase();
    if (!trimmed || trimmed === 'cancel') return false;

    if (trimmed === 'publish') {
      if (enFilePath && existsSync(enFilePath)) setDraftFalse(enFilePath);
      if (ptFilePath && existsSync(ptFilePath)) setDraftFalse(ptFilePath);
      return true;
    }

    try {
      await applyRevision({ client, feedback: action, enFilePath, ptFilePath, isBilingual, primaryResult });
      console.log(chalk.green('  Revised — refresh the browser to see changes.'));
      urls.forEach(u => console.log(chalk.dim(`  ${u}`)));
      console.log('');
    } catch (err) {
      console.log(chalk.red(`  Revision failed: ${err.message}\n`));
    }
  }
}
