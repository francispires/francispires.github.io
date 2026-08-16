import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import { adaptForLinkedIn } from '../lib/claude.mjs';
import { sourceImage } from '../lib/images.mjs';
import { reviewLoop } from '../lib/review.mjs';
import { ensureLinkedInToken } from '../lib/auth/linkedin.mjs';

const LI_API = 'https://api.linkedin.com/v2';

async function uploadImageToLinkedIn(imagePath, accessToken, personUrn) {
  // Step 1: register upload slot
  const regRes = await fetch(`${LI_API}/assets?action=registerUpload`, {
    method: 'POST',
    headers: {
      Authorization:                `Bearer ${accessToken}`,
      'Content-Type':               'application/json',
      'X-Restli-Protocol-Version':  '2.0.0',
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner:   personUrn,
        serviceRelationships: [{
          relationshipType: 'OWNER',
          identifier:       'urn:li:userGeneratedContent',
        }],
      },
    }),
  });
  if (!regRes.ok) throw new Error(`LinkedIn register upload failed: ${await regRes.text()}`);
  const regData  = await regRes.json();
  const uploadUrl = regData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  const assetUrn  = regData.value.asset;

  // Step 2: upload image bytes
  const bytes  = readFileSync(imagePath);
  const upRes  = await fetch(uploadUrl, {
    method:  'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/octet-stream' },
    body:    bytes,
  });
  if (!upRes.ok && upRes.status !== 201) {
    throw new Error(`LinkedIn image upload failed: ${upRes.status}`);
  }

  return assetUrn;
}

async function createLinkedInPost({ content, assetUrn, accessToken, personUrn }) {
  const shareContent = {
    shareCommentary:    { text: content },
    shareMediaCategory: assetUrn ? 'IMAGE' : 'NONE',
  };
  if (assetUrn) {
    shareContent.media = [{ status: 'READY', media: assetUrn }];
  }

  const res = await fetch(`${LI_API}/ugcPosts`, {
    method:  'POST',
    headers: {
      Authorization:               `Bearer ${accessToken}`,
      'Content-Type':              'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author:          personUrn,
      lifecycleState:  'PUBLISHED',
      specificContent: { 'com.linkedin.ugc.ShareContent': shareContent },
      visibility:      { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  });
  if (!res.ok) throw new Error(`LinkedIn post failed: ${await res.text()}`);
  const data = await res.json();
  return `https://www.linkedin.com/feed/update/${data.id}/`;
}

/**
 * Full LinkedIn publish flow: adapt content → source image → review → post.
 * @param {{ blogPost: object, slug: string }} opts
 * @returns {Promise<'published' | 'cancelled'>}
 */
export async function publishToLinkedIn({ blogPost, slug }) {
  console.log(chalk.cyan('\n── LinkedIn ─────────────────────────────────\n'));

  const { accessToken, personUrn } = await ensureLinkedInToken();
  const client = new Anthropic();

  const adapted     = await adaptForLinkedIn(client, blogPost, slug);
  let currentImage  = await sourceImage({
    query:    blogPost.unsplashQuery ?? blogPost.title,
    platform: 'linkedin',
    slug:     `${slug}-li`,
  });

  let assetUrn = null;

  return reviewLoop({
    platform:   'linkedin',
    content:    adapted.content,
    publicPath: currentImage?.publicPath ?? null,
    onNewImage: async () => {
      assetUrn     = null; // reset so we re-upload on publish
      currentImage = await sourceImage({
        query: blogPost.title, platform: 'linkedin', slug: `${slug}-li`,
      });
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
}
