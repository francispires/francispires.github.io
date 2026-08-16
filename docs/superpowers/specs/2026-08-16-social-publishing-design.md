# Social Publishing Pipeline — Design Spec
**Date:** 2026-08-16
**Status:** Approved

## Overview

Extend `npm run new-post` to publish blog content to LinkedIn and Instagram in addition
to the Astro site. Each platform receives Claude-generated content adapted to its format,
an image (Unsplash search or DALL-E generation), and goes through an interactive terminal
review loop before publishing.

---

## Architecture

### File structure

```
scripts/
  new-post.mjs              <- orchestrator (public API unchanged)
  lib/
    claude.mjs              <- all Claude API calls (extracted from new-post.mjs)
    images.mjs              <- Unsplash + DALL-E, platform-aware sizing, preview loop
    review.mjs              <- interactive terminal review loop (shared by publishers)
    auth/
      linkedin.mjs          <- OAuth 2.0 flow + token persistence
      instagram.mjs         <- Meta OAuth flow + token persistence
  publishers/
    linkedin.mjs            <- content adaptation + image upload + UGC post
    instagram.mjs           <- content adaptation + image container + publish
docs/
  CREATING-POSTS.md         <- existing doc (updated with social publishing section)
  LINKEDIN-SETUP.md         <- new: LinkedIn Developer App + OAuth guide
  INSTAGRAM-SETUP.md        <- new: Meta Developer App + OAuth guide
```

### Orchestrator change (new-post.mjs)

One new multi-select question added at the end of every non-project flow:

```
Where do you want to publish?
  [x] Site (Astro -- always selected)
  [ ] LinkedIn
  [ ] Instagram
```

The orchestrator calls each selected publisher sequentially after writing the blog files.

---

## Content per platform

### LinkedIn (publishers/linkedin.mjs)

- **Tone:** professional, executive-friendly
- **Length:** up to 3000 chars
- **Structure:** hook (1-2 lines) -> key takeaways -> closing CTA -> link to blog post
- **Image:** optional, landscape 1200x628 px
- **API:** LinkedIn UGC Posts API with `w_member_social` scope

### Instagram (publishers/instagram.mjs)

- **Tone:** conversational, visual-first
- **Length:** up to 2200 chars
- **Structure:** hook -> narrative -> 5-10 relevant hashtags -> "link na bio"
- **Image:** mandatory (Instagram Feed Post requires media), square 1080x1080 px
- **API:** Instagram Graph API — `instagram_content_publish` + `instagram_basic` permissions

---

## Image module (lib/images.mjs)

Two sourcing strategies, selectable interactively:

| Strategy | How | Requirement |
|----------|-----|-------------|
| Unsplash | Keyword search, download full-res | UNSPLASH_ACCESS_KEY (already in use) |
| DALL-E   | OpenAI images.generate, download URL | OPENAI_API_KEY |

The module receives `{ platform, slug }` and saves images at the correct dimensions.
The same image can be reused across platforms when the user confirms it.

Image review loop (repeats until confirm or skip):

```
Image: /img/posts/my-post.jpg
Source: DALL-E -- "abstract data pipeline, blue tones"

[c] confirm   [u] try Unsplash   [d] regenerate DALL-E   [s] skip
```

---

## Review loop (lib/review.mjs)

Shared by all publishers. Renders a framed preview then waits for user input:

```
== Preview: LinkedIn ==================
Hook line that grabs attention here.

Key takeaway 1...
Key takeaway 2...

Read the full post:
https://francispires.com.br/blog/slug

Image: /img/posts/slug.jpg
=======================================
[p] publish  [e] edit  [i] new image  [c] cancel
```

Edit flow: content is written to a temp file and opened in $EDITOR (fallback: nano).
On save+exit the file is re-read and the preview renders again.

---

## OAuth and token management (lib/auth/)

### First run

When a publisher detects missing tokens in .env it starts OAuth automatically:

1. Builds the authorization URL with required scopes
2. Starts a temporary HTTP server on localhost:3333
3. Opens the browser (xdg-open on Linux, start on Windows)
4. Captures the OAuth callback, exchanges code for access token
5. Writes ACCESS_TOKEN and PERSON_URN (or equivalent) back to .env
6. Shuts down the temporary server and resumes the publish flow

### Token expiry

LinkedIn and Meta both issue tokens valid for ~60 days. On any 401 API response
the publisher logs a clear message and re-initiates the OAuth flow before retrying.

---

## Environment variables

```
# Existing
ANTHROPIC_API_KEY=sk-ant-...
UNSPLASH_ACCESS_KEY=...

# LinkedIn (written automatically after first OAuth)
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_ACCESS_TOKEN=
LINKEDIN_PERSON_URN=

# Instagram / Meta (written automatically after first OAuth)
INSTAGRAM_BUSINESS_ACCOUNT_ID=
FACEBOOK_ACCESS_TOKEN=

# Image generation via DALL-E (optional)
OPENAI_API_KEY=
```

---

## Documentation deliverables

| File | Content |
|------|---------|
| docs/LINKEDIN-SETUP.md   | Create Developer App, add Share on LinkedIn product, set redirect URI, copy keys to .env |
| docs/INSTAGRAM-SETUP.md  | Convert to Business/Creator account, create Meta app, configure permissions, copy keys to .env |
| CREATING-POSTS.md        | New section: social publishing, platform flags, prerequisites table, examples |

---

## Out of scope

- Scheduling posts for a future time
- Instagram Stories or Reels
- LinkedIn Company Pages (personal profile only)
- Editing or deleting published posts via the CLI
- Analytics or engagement tracking
