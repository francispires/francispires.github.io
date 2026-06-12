# CV Page with PDF Generation — Design Spec

Date: 2026-06-12
Status: Approved

---

## Overview

Add a `/cv` route to the Astro static site that renders a full curriculum vitae with:
- A **dark sidebar layout** (photo, contact, skills, education)
- A **main column** (summary, work experience, filtered projects)
- A **category filter** that controls which projects appear on screen and in the PDF
- A **client-side PDF export** via pdfmake — no server required
- **Bilingual support** (PT/EN) matching the site's existing language toggle

---

## Architecture

### New files

| File | Purpose |
|------|---------|
| `src/data/cv.ts` | Static CV data: summary, experience, education, contact, skills (already created) |
| `src/pages/cv.astro` | The `/cv` route — renders full CV layout + injects data for client JS |
| `src/scripts/cv-pdf.ts` | Client-side script: category filter logic + pdfmake PDF builder |

### Modified files

| File | Change |
|------|--------|
| `src/content/config.ts` | Add `startDate`, `endDate`, `position`, `company` optional fields to projects schema |
| `src/components/Nav.astro` | Add `/cv` link |
| `scripts/new-post.mjs` | Add `--mode project` interactive flow |
| `src/content/projects/*.md` | Add placeholder dates/position/company to existing project files |
| `package.json` | Add `pdfmake` dependency |

---

## Data model

### Projects schema additions (`src/content/config.ts`)

```ts
startDate: z.string().optional(),   // "YYYY-MM" format
endDate:   z.string().optional(),   // "YYYY-MM" or omit for "present"
position:  z.string().optional(),   // "Lead Developer"
company:   z.string().optional(),   // "FIA"
```

All fields are optional — existing project entries remain valid without them.

### `src/data/cv.ts` shape (already created)

```ts
{
  name, headline{en,pt}, photo, contact{email,github,linkedin,site,city{en,pt}},
  summary{en,pt},
  experience[{ company, position{en,pt}, startDate, endDate, location{en,pt}, description{en,pt} }],
  education[{ institution, degree{en,pt}, field{en,pt}, startYear, endYear, note{en,pt} }],
  skills[{ name, level, category }],
}
```

---

## CV Page (`src/pages/cv.astro`)

### Layout

```
┌─────────────────────────────────────────────────────┐
│ Nav                                                  │
├─────────────────────────────────────────────────────┤
│ Page header: "$ cat curriculum.pdf"                 │
│ Category filter chips  [python ✓][sql ✓][devops ✓]  │
│ [⬇ Download PDF] button                             │
├───────────────┬─────────────────────────────────────┤
│ SIDEBAR       │ MAIN COLUMN                         │
│               │                                     │
│ Photo         │ $ whoami                            │
│ Name          │ Summary                             │
│ Headline      │                                     │
│               │ $ cat experience.log                │
│ ── CONTACT ── │ Work experience (timeline)          │
│ email         │                                     │
│ github        │ $ ls projects/ | sort -r            │
│ site          │ Projects (filtered by categories,   │
│ city          │   ordered by startDate desc)         │
│               │                                     │
│ ── SKILLS ──  │                                     │
│ skill bars    │                                     │
│               │                                     │
│ ── EDUCATION ─│                                     │
│ degree/year   │                                     │
└───────────────┴─────────────────────────────────────┘
```

### Data injection

Projects are fetched at build time via `getCollection('projects')`. The full dataset is serialized into a `<script type="application/json" id="cv-data">` tag so the client script can re-filter without a page reload.

### Language support

- All bilingual strings use the existing `.lang-en` / `.lang-pt` CSS class pattern
- The language toggle already works site-wide — no new JS needed for language switching
- pdfmake reads `document.documentElement.dataset.lang` to pick the correct language strings at download time

---

## Category Filter & PDF (`src/scripts/cv-pdf.ts`)

### Filter behaviour

- On page load: all category chips are checked (active)
- Clicking a chip toggles it; the projects section updates immediately (show/hide project entries)
- The download button always reflects the current filter state

### PDF generation

pdfmake document definition structure:

```
columns: [
  // Left: sidebar (width: 200pt)
  { stack: [ photo, name, headline, contact, skills, education ] },
  // Right: main (width: *)
  { stack: [ summary, experience[], projects[] ] }
]
```

- Font: Roboto (pdfmake default, embedded)
- Colors match site palette: `#00ff87` green, `#00d4ff` cyan, `#161b22` sidebar bg
- Projects sorted by `startDate` descending
- Filename: `francis-pires-cv.pdf`

---

## `new-post` project mode (`scripts/new-post.mjs`)

New mode added alongside `generate` and `revise`.

### Wizard prompts

1. Mode selection → "Project — create a new CV project entry"
2. Title
3. Description (free text)
4. Position / role
5. Company
6. Start date (YYYY-MM)
7. End date (YYYY-MM or blank for "present")
8. Category (select from existing enum)
9. Tech tags (comma-separated)
10. GitHub URL (optional)
11. Project URL (optional)
12. Featured? (yes/no)

### Output

Creates `src/content/projects/YYYY-MM-DD-<slug>.md` with all frontmatter populated. No AI call — this is pure structured data entry.

---

## Existing projects — placeholder data

All 6 existing project entries will be updated with stub `startDate`, `endDate`, `position`, and `company` values. The user will update these with real dates later.

---

## Navigation

`src/components/Nav.astro` gets a new link: `cv` → `/cv`, inserted between `projects` and `about`.

---

## Out of scope

- Server-side PDF rendering
- CV editing UI (data is edited via `cv.ts` and content files)
- Multiple CV profiles / templates
- AI-generated CV content
