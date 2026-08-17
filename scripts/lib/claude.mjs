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

export function buildInstagramPrompt(blogPost, _slug) {
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

const REVISE_POST_SYSTEM = `You are editing a blog post markdown file for Francis Pires.
Apply the requested changes and return the COMPLETE revised file — frontmatter YAML block and body.
Rules:
- Preserve every frontmatter key exactly (draft, lang, pubDate, heroImage, translationKey, etc.)
- Only update title/description/body/tags if the feedback requires it
- Return ONLY the raw markdown — no explanation, no code fences around the file`;

export async function revisePostContent(client, markdownContent, feedback) {
  const spinner = ora('Revising post with Claude...').start();
  try {
    const msg = await client.messages.create({
      model:      'claude-opus-4-5',
      max_tokens: 4096,
      system:     REVISE_POST_SYSTEM,
      messages:   [{ role: 'user', content: `Current file:\n\n${markdownContent}\n\nFeedback: ${feedback}` }],
    });
    spinner.succeed('Post revised');
    return msg.content[0].text.trim();
  } catch (err) {
    spinner.fail('Revision failed');
    throw err;
  }
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
