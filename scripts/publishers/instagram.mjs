import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import { adaptForInstagram } from '../lib/claude.mjs';
import { sourceImage } from '../lib/images.mjs';
import { reviewLoop } from '../lib/review.mjs';
import { ensureInstagramToken } from '../lib/auth/instagram.mjs';

const FB_VERSION = 'v21.0';

async function createMediaContainer({ igUserId, accessToken, imageUrl, caption }) {
  const res = await fetch(`https://graph.facebook.com/${FB_VERSION}/${igUserId}/media`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ image_url: imageUrl, caption, access_token: accessToken }),
  });
  if (!res.ok) throw new Error(`IG media container failed: ${await res.text()}`);
  const data = await res.json();
  return data.id;
}

async function publishContainer({ igUserId, accessToken, creationId }) {
  const res = await fetch(`https://graph.facebook.com/${FB_VERSION}/${igUserId}/media_publish`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ creation_id: creationId, access_token: accessToken }),
  });
  if (!res.ok) throw new Error(`IG publish failed: ${await res.text()}`);
  const data = await res.json();
  return `https://www.instagram.com/p/${data.id}/`;
}

/**
 * Full Instagram publish flow: adapt content → image (required) → review → post.
 * Uses the Unsplash/DALL-E source URL directly — both are publicly accessible.
 * @param {{ blogPost: object, slug: string }} opts
 * @returns {Promise<'published' | 'cancelled'>}
 */
export async function publishToInstagram({ blogPost, slug }) {
  console.log(chalk.cyan('\n── Instagram ────────────────────────────────\n'));

  const { igUserId, accessToken } = await ensureInstagramToken();
  const client = new Anthropic();

  const adapted = await adaptForInstagram(client, blogPost, slug);

  let currentImage = await sourceImage({
    query:    blogPost.unsplashQuery ?? blogPost.title,
    platform: 'instagram',
    slug:     `${slug}-ig`,
    required: true,
  });

  if (!currentImage) {
    console.log(chalk.yellow('Instagram requires an image. Skipping Instagram publish.'));
    return 'cancelled';
  }

  return reviewLoop({
    platform:   'instagram',
    content:    adapted.content,
    publicPath: currentImage.publicPath,
    onNewImage: async () => {
      currentImage = await sourceImage({
        query: blogPost.title, platform: 'instagram', slug: `${slug}-ig`, required: true,
      });
      return currentImage?.publicPath ?? null;
    },
    publishFn: async (caption) => {
      const imageUrl   = currentImage.sourceUrl;
      const creationId = await createMediaContainer({ igUserId, accessToken, imageUrl, caption });
      const postUrl    = await publishContainer({ igUserId, accessToken, creationId });
      console.log(chalk.green(`\n✓ Instagram post live: ${postUrl}\n`));
    },
  });
}
