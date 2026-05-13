---
name: ai-page-builder
description: AI-driven, interactive page creation for ANY Astro content-collection project. Turns a source URL into a `src/content/pages/<slug>.md` page by extracting content, capturing screenshots, intelligently analysing layout against the project's REAL component library AND its shared-section collection, presenting a plan to the user for confirmation, then writing the final file and verifying it builds. Use when the user asks to "create a page from a URL", "import this page", "build an Astro page from <url>", "ai page builder", "page from URL", or anything similar. Portable — uses only globally-installed CLIs (`into-md`, `capture-website`); never relies on project-local scripts.
license: MIT
metadata:
  version: "1.2.0"
  scope: "Astro projects with content collections"
  validated_against: "qwilr.com (v1.1) and pandadoc.com end-to-end on pbz-marketing repo (v1.2)"
---

# AI Page Builder Skill

You (the agent) are the orchestrator. This skill is your playbook. There is **no monolithic shell script** — you drive each phase intelligently using only globally-available tools and the project's real source of truth.

> **Prime directive:** Be portable. Never assume any file under `scripts/`. Discover the project's structure at runtime and adapt.

---

## When to Activate

Activate this skill when the user asks anything like:

- "Create a page from `<url>` with slug `<slug>`"
- "Import this page into the site"
- "Build an Astro page from this competitor"
- "Use the ai page builder for ..."
- "Page from URL ..."

If the user supplies a URL but no slug, ask for one before starting.

---

## Required Tools

| Tool | Status | Purpose | How to invoke |
|------|--------|---------|---------------|
| `into-md` | **must be global** | URL → clean markdown | `into-md "<url>" --output <path> --timeout 45000` |
| `capture-website` | **must be global** | URL → PNG screenshot | `capture-website "<url>" --output=<path> ...` |
| `look_at` (Amp tool) | always available | Visual analysis of screenshots | use the tool directly |

> ⚠️ The npm package is `capture-website-cli` but its installed binary is **`capture-website`** (no `-cli` suffix). Always invoke as `capture-website`, not `capture-website-cli`.

**Verification at start of run:**

```powershell
# Windows
where.exe into-md
where.exe capture-website
```
```bash
# POSIX
command -v into-md
command -v capture-website
```

If either is missing, instruct the user and stop:

```bash
npm i -g into-md capture-website-cli
```

> **Do NOT** rely on global `playwright` / `puppeteer` for screenshots — their CLIs do not expose a screenshot subcommand. The `capture-website` CLI is the portable primitive.

> **Note on `into-md` stderr:** It prints progress like `Strategy: auto > static` to stderr. PowerShell may surface this as a red error. **Ignore it** unless the exit code is non-zero or the output file is empty (< 500 bytes).

---

## Workflow Overview

```diagram
╭───────────────────────╮   ╭──────────────────╮   ╭─────────────────────╮
│ 0. Discover project   │──▶│ 1. Stage temp    │──▶│ 2. Extract content  │
│    structure          │   │    .tmp/<slug>/  │   │    (into-md)        │
╰───────────────────────╯   ╰──────────────────╯   ╰──────────┬──────────╯
                                                              │
╭───────────────────────╮   ╭──────────────────╮   ╭──────────▼──────────╮
│ 5. Component mapping  │◀──│ 4. Layout plan   │◀──│ 3. Capture          │
│    (real components)  │   │    (intelligent) │   │    screenshots +    │
╰───────────┬───────────╯   ╰──────────────────╯   │    look_at analysis │
            │                                       ╰─────────────────────╯
            ▼
╭───────────────────────╮   ╭──────────────────╮   ╭─────────────────────╮
│ 6. Present plan +     │──▶│ 7. Write final   │──▶│ 8. Cleanup temp     │
│    GET CONFIRMATION   │   │    .md page      │   │    + verify build   │
╰───────────────────────╯   ╰──────────────────╯   ╰─────────────────────╯
```

You **must not skip the confirmation gate** in Phase 6.

---

## Phase 0 — Discover Project Structure

Do not hardcode paths. Detect them per project. Build an in-memory **project profile**.

### 0.1 Confirm Astro + content-collections

Read `astro.config.*` and `src/content.config.ts` (or `src/content/config.ts`).

### 0.2 Find collections of interest

Parse `defineCollection({ loader: glob({ base: "..." }) })` calls to locate:

- **`pagesDir`** — usually `src/content/pages/`
- **`sectionsDir`** — usually `src/content/sections/` (may not exist; that's fine)

### 0.3 Find the section renderer

The page that switches on `section.type`. Conventionally:
- `src/pages/[...slug].astro`
- `src/pages/[slug].astro`

Read it and extract the **canonical vocabulary** of `section.type === "..."` strings — this is the only allowed set of types.

### 0.4 Build the section profile

For every type in the vocabulary, classify it as **inline** vs **shared/MD**:

- Scan 3–5 representative pages in `pagesDir`.
- If all uses of a type appear with **only `enable: true`** (no `title`, `items`, etc.), it is **shared/MD** — the renderer pulls its data from `<sectionsDir>/<name>.md`. Examples in this project: `partners`, `business_needs`, `comparison_row`, `faq`, `cta`, `testimonials_section`, `logos_section`.
- Otherwise it is **inline** — data lives in this page's frontmatter.

### 0.5 Build a schema cheatsheet

For each **inline** type, copy a real example block from existing pages so YAML you generate later is guaranteed schema-valid. Store as `sectionExamples[type] → YAML snippet`.

### 0.6 Output of Phase 0 (kept in working memory)

```
projectProfile:
  pagesDir:        "src/content/pages"
  sectionsDir:     "src/content/sections"   (or null)
  rendererPath:    "src/pages/[...slug].astro"
  sectionTypes:    ["banner", "value_props", "faq", ...]
  sectionMode:     { banner: "inline", faq: "shared", ... }
  sharedSectionFiles: { faq: "src/content/sections/faq.md", ... }
  sectionExamples: { banner: "<yaml block>", value_props: "...", ... }
```

---

## Phase 1 — Stage a Temp Workspace

Create a per-slug temp folder so all intermediate artefacts are isolated and easy to inspect or delete.

```
.tmp/page-builder/<slug>/
├── raw.md          ← output of into-md
├── preview.png     ← 1200×630 social preview
├── full.png        ← full-page screenshot
├── plan.md         ← the proposed plan you present in Phase 6
└── meta.json       ← {url, slug, createdAt, projectProfile snapshot}
```

Create the directory:
- POSIX: `mkdir -p .tmp/page-builder/<slug>`
- Windows: `New-Item -ItemType Directory -Force -Path ".tmp\page-builder\<slug>" | Out-Null`

**Ensure `.tmp/` is git-ignored.** Read `.gitignore`; if it doesn't contain `.tmp` (or `.tmp/`), append it as the first action of Phase 1.

---

## Phase 2 — Extract Content

```bash
into-md "<url>" --output ".tmp/page-builder/<slug>/raw.md" --timeout 45000
```

If `raw.md` is empty or < 500 bytes, retry with the JS-rendering strategy:

```bash
into-md "<url>" --output ".tmp/page-builder/<slug>/raw.md" --js --timeout 60000
```

Read `raw.md` yourself end-to-end and form a mental model of the page sections.

---

## Phase 3 — Capture Screenshots + Visual Analysis

```bash
capture-website "<url>" \
  --output=".tmp/page-builder/<slug>/preview.png" \
  --width=1200 --height=630 --overwrite

capture-website "<url>" \
  --output=".tmp/page-builder/<slug>/full.png" \
  --full-page --overwrite
```

Then **call the `look_at` tool** on `full.png` with this objective template:

> "Identify each visible section of this marketing landing page from top to bottom. For each section list: (1) semantic role (hero, social proof, feature grid, testimonial, stats, pricing, faq, footer cta, etc.), (2) layout (centered, split, grid columns, carousel), (3) approximate count of items, (4) any prominent CTA buttons."

Pass the project's `sectionTypes[]` in the `context` parameter so the AI can map directly.

The visual analysis routinely catches what markdown misses: visual section ordering, grid column counts, hero variants (split vs centred, with/without video), logo strips, carousels, and sections that have **no heading at all** in the extracted markdown.

If screenshots fail (timeout / 403 / cloudflare), **continue with markdown-only analysis** and note the limitation in the plan.

---

## Phase 4 — Layout Plan (Intelligent, NOT Static)

This is where the old scripted approach failed: it produced a generic ASCII wireframe disconnected from the project's actual components. You will do better.

**Inputs:** `raw.md` + `look_at` output + `projectProfile` from Phase 0.

**Process — think carefully, do not template-match:**

1. Walk the source page top-to-bottom (use the **visual** order from `look_at`, not just markdown order).
2. For each visual block, identify its **semantic role**.
3. Map each role to the **best fitting `section.type`** from `sectionTypes[]`. Do not invent types.
4. Tag each row with its **content source** (`inline` or `shared/MD`) using `sectionMode`.
5. If a block has no matching component, surface it explicitly as `❓ NEEDS COMPONENT` with a closest-fallback suggestion.
6. Pick **variants** (e.g. `columns: 3`) by matching against `sectionExamples[type]` — never imagine fields.

### Copy-source rules (critical for hero quality)

When extracting headline / subhead / button labels from the source page, follow this priority order. The agent has gotten this wrong before.

| Field | Use | NOT |
|-------|-----|-----|
| Hero **headline** | The visible H1 from the `look_at` analysis of `preview.png` (above-the-fold) | The `<title>` tag in the markdown frontmatter (that's SEO copy, not hero copy) |
| Hero **subhead** | The first short paragraph immediately below the H1 in the screenshot | The page's `<meta name="description">` |
| Page `meta_title` / `description` (frontmatter) | The `<title>` and `<meta description>` (these ARE SEO copy) | — |
| Button labels | Exact button text seen on the screenshot | Inferred or paraphrased |
| Stats values | Numbers exactly as displayed (`46x`, `25%`, `$2,000`) | Reformatted or rounded |
| Testimonial quotes | Exact quote text; trim trailing source attributions | Paraphrased |

### Required plan format

Write this to `.tmp/page-builder/<slug>/plan.md` AND display it inline:

````markdown
# Page Plan: <slug>
**Source:** <url>
**Target:** <pagesDir>/<slug>.md

## Visual Outline (top → bottom)

╭──────────────────────────────────────────────────────────────────────╮
│ 1. HERO                              →  banner                       │
│    "Headline" + subhead + 2 CTAs + 3 product previews                │
╰──────────────────────────────────────────────────────────────────────╯
╭──────────────────────────────────────────────────────────────────────╮
│ 2. SOCIAL PROOF                      →  partners (shared section)    │
│    6 customer logos                                                  │
╰──────────────────────────────────────────────────────────────────────╯
... etc

## Section ↔ Component Map

| #  | Source block         | section.type           | Source     | Confidence | Notes |
|----|----------------------|------------------------|------------|------------|-------|
| 1  | Hero                 | banner                 | inline     | high       | 2 CTAs, show_video optional |
| 2  | Logo strip           | partners               | shared/MD  | high       | Pulls from <sectionsDir>/brands.md |
| 3  | ...                  | ...                    | ...        | ...        | ... |

## Content-Source Legend
- **inline** — section data is written directly in this page's frontmatter
- **shared/MD** — section is rendered with `enable: true` only; renderer pulls content from `<sectionsDir>/<name>.md`

## Open Questions
1. Section X: ambiguity that needs user input
2. Hero image/video preference
3. Whether to override shared/MD content for this page
````

**Quality bar for the plan:**
- Every row in the map cites a real `section.type` (or `❓ NEEDS COMPONENT`).
- Every "Source" column is `inline` / `shared/MD` / `❓`.
- Every "Notes" mentions a real schema field copied from `sectionExamples`.
- Open questions force the user to make decisions you cannot make alone.

---

## Phase 5 — Component Mapping (Sanity Check)

Before showing the plan to the user, verify each chosen `section.type`:

1. The renderer has a `section.type === "X"` branch.
2. For **inline** types, every field you plan to write appears in `sectionExamples[X]` or in the Zod schema in `content.config.ts`.
3. For **shared/MD** types, the corresponding `<sectionsDir>/<name>.md` file exists. If it doesn't, downgrade to `❓ NEEDS COMPONENT` and surface as an open question.

If a chosen component does not exist, mark it `❓ NEEDS COMPONENT` — **do not auto-generate components in this skill**. Component generation is a separate concern; surface the gap and let the user decide.

---

## Phase 6 — CONFIRMATION GATE (Mandatory)

Display the plan to the user (the contents of `plan.md`) and ask explicitly:

> Here is the proposed page plan. Reply with:
> - **`approve`** — write the page exactly as planned
> - **`<change description>`** — e.g. "merge sections 4 and 5", "drop the comparison_row", "use main_features for section 3"
> - **`abort`** — stop and clean up

**Do not proceed to Phase 7 until the user says `approve`.** If they request changes, revise the plan and re-present until approved.

### Low-confidence escalation

If **any** row in the Section ↔ Component Map has **Confidence: low** or is `❓ NEEDS COMPONENT`, do NOT silently fall back. Instead, list each one in a dedicated **"Decisions Needed"** block at the top of the plan. Example:

```
## Decisions Needed (please answer before approving)
- Section 6 (ROI calculator): no calculator component exists.
  Options: (a) drop it  (b) replace with `lead_generation` "Calculate ROI" card  (c) leave a TODO and add a custom component later.
  → Your choice?
```

The agent must wait for explicit answers to all "Decisions Needed" items before treating an `approve` as final.

---

## Phase 7 — Write the Final Page

Only after explicit approval:

1. Build YAML frontmatter using the **real** schema fields detected in Phase 0.
2. For each section:
   - **inline** types: copy the field shape from `sectionExamples[type]` so YAML is guaranteed valid.
   - **shared/MD** types: emit only `- type: <name>\n  enable: true`.
3. **Source attribution comment** — emit this as a YAML comment block immediately after the frontmatter fields, before `sections:`:
   ```yaml
   # ─────────────────────────────────────────────────────────────
   # Generated by ai-page-builder skill
   # Source URL : <url>
   # Generated  : <ISO timestamp>
   # ─────────────────────────────────────────────────────────────
   ```
4. **Image strategy:** source pages use external CDN images. Default behaviour: emit `image: "/images/placeholder.png"` (or a slug-derived placeholder path) and list every external URL in a `# TODO Images:` comment block right after the source-attribution comment. Do not embed remote URLs unless the user explicitly asks.
5. **YAML escaping:** wrap any value containing `:`, `#`, `'`, leading `-`, leading numbers like `"1. ..."`, or HTML tags (`<strong>`) in double quotes. Strip control chars and zero-width spaces from extracted text.
6. **File encoding** — write the file as **UTF-8 without BOM**. On Windows PowerShell `Set-Content` defaults to ANSI/UTF-16; either use `Out-File -Encoding utf8NoBOM` or invoke the `create_file` tool which handles encoding correctly. PowerShell terminal display showing `â€"` instead of `—` is a console codepage quirk, not a file problem — verify the actual file with `Get-Content -Encoding UTF8` or by reading the rendered HTML in a browser.
7. Write to `<pagesDir>/<slug>.md`.
8. If a file with that slug already exists, **ask** before overwriting.
9. Run `npx astro check` and report any schema errors **scoped to the new file** (filter the output by the slug — pre-existing errors elsewhere are not your concern). Fix and re-write if errors are caused by the generated YAML. Re-check until clean (max 3 iterations, then ask the user).
10. Run `npx astro sync` to confirm content collection accepts the new file with no errors.

---

## Phase 7.5 — Rendered Visual QA (recommended)

After `astro check` is clean, build the page and visually compare it against the source:

```bash
npx astro build
# This produces dist/client/<slug>/index.html (or dist/<slug>/index.html depending on adapter)
```

Then either:

- **Quick check:** Verify the file exists and grep its rendered HTML for the hero headline, key stat values, and CTA labels you generated. They should appear verbatim in the HTML.
- **Visual check (when serving is feasible):** Run `npx serve dist` (or the project's `astro preview`) on a free port, take a screenshot of `http://localhost:<port>/<slug>` with `capture-website`, and compare it against `.tmp/page-builder/<slug>/full.png` using `look_at` with both files.

If the rendered page is missing sections, has empty containers, or shows raw template strings, the YAML schema is technically valid but **semantically wrong** — return to Phase 4, identify the broken section type, and regenerate with the correct field shape from `sectionExamples`.

---

## Phase 8 — Cleanup

- By default delete `.tmp/page-builder/<slug>/` after a successful write.
- If the user passed `--keep-temp` (or asked to keep), leave it.
- Print a final summary:
  - Page file path
  - Components used (with inline/shared markers)
  - Any `❓ NEEDS COMPONENT` left as TODOs
  - List of external image URLs the user must replace with local assets
  - Suggested next step: `yarn dev` and visit `/{slug}`

---

## Failure Modes & Recovery

| Symptom | Action |
|---------|--------|
| `into-md` stderr looks scary in PowerShell | Ignore — that's progress logging. Check exit code + file size instead. |
| `into-md` returns < 500 bytes | Retry with `--js` flag (Phase 2). |
| Screenshot CLI fails first time | First-run npx install can take 30–60s; let it complete. If it fails again, continue without screenshots. |
| `npx capture-website-cli` blocked by corporate proxy | Skip Phase 3, work from markdown only, note in plan. |
| Source page is 403 / Cloudflare-protected | Try `into-md --js`; if still blocked, ask the user for a cached HTML or different URL. |
| No matching `section.type` for a block | Mark `❓ NEEDS COMPONENT`, ask in confirmation gate. |
| `astro check` fails on generated YAML | Read the error, locate the offending section, regenerate that block from `sectionExamples`, re-check. |
| Shared/MD section file doesn't exist | Downgrade type to `❓` and ask user whether to seed the shared file. |
| User says "abort" at confirmation | Delete temp folder, exit cleanly. |

---

## What You Must NOT Do

- ❌ Do not call any project-local script under `scripts/` — they are reference-only.
- ❌ Do not invent `section.type` values not present in the renderer.
- ❌ Do not skip the confirmation gate.
- ❌ Do not write to `<pagesDir>` before approval.
- ❌ Do not auto-generate Astro components from this skill — out of scope.
- ❌ Do not hardcode paths from any project — discover them per project so the skill is portable.
- ❌ Do not embed remote CDN image URLs in the page; use placeholders + TODO list.
- ❌ Do not assume `playwright`/`puppeteer` global CLIs can take screenshots — they cannot. Use `npx --yes capture-website-cli`.

---

## Quick Reference (copy-pasteable)

```bash
# 0. Discover (read these files)
src/content.config.ts
src/pages/[...slug].astro              # or [slug].astro
src/layouts/components/  OR  src/components/
src/content/pages/*.md                 # 2-3 examples
src/content/sections/*.md              # if exists, sourcing for shared types

# 1. Stage
mkdir -p .tmp/page-builder/<slug>      # POSIX
# Windows: New-Item -ItemType Directory -Force -Path ".tmp\page-builder\<slug>"
# Append `.tmp/` to .gitignore if missing

# 2. Extract
into-md "<url>" --output ".tmp/page-builder/<slug>/raw.md" --timeout 45000

# 3. Screenshot + visual analysis
capture-website "<url>" --output=".tmp/page-builder/<slug>/preview.png" --width=1200 --height=630 --overwrite
capture-website "<url>" --output=".tmp/page-builder/<slug>/full.png" --full-page --overwrite
# then: look_at full.png with sectionTypes[] passed as context

# 4-5. Plan → write .tmp/page-builder/<slug>/plan.md  (inline + shared sources marked)

# 6. Show plan, await "approve" + answers to "Decisions Needed"

# 7. Write <pagesDir>/<slug>.md (UTF-8, source comment + TODO images), then:
npx astro check
npx astro sync

# 7.5 (recommended) Build + visual QA
npx astro build
# inspect dist/client/<slug>/index.html

# 8. Cleanup .tmp/page-builder/<slug>/ unless --keep-temp
```

---

## Validated Run Notes

### v1.1.0 — qwilr.com dogfood
- **Shared-section pattern**: ~7 of 32 section types in this project are `enable: true` only, sourced from `src/content/sections/*.md`. Phase 0.4 + 0.5 detects them.
- **`into-md` stderr**: harmless progress logging — ignore.
- **Global Playwright**: not viable for screenshots; needed a different CLI.
- **`look_at` is essential**: visual pass catches grid column counts, persona blocks, and tabbed sections that markdown alone misses.
- **External images**: every source page uses CDN URLs; placeholder + TODO-list strategy keeps YAML clean and human in control.

### v1.2.0 — pandadoc.com end-to-end (extract → screenshot → plan → write → astro check → astro build → rendered HTML inspected)
- **Binary name**: globally-installed `capture-website-cli` package exposes `capture-website` — invoke without the `-cli` suffix.
- **Hero copy bug**: agent used SEO `<title>` tag for hero H1 instead of the visible above-the-fold H1. Phase 4 now has explicit **Copy-source rules** table.
- **Silent fallback bug**: agent quietly mapped a missing component to a similar one. Phase 6 now has **Low-confidence escalation** — every `❓` / low-confidence row must be answered before `approve` counts.
- **Source attribution**: generated files now include a `# Generated by ai-page-builder...` comment block + URL + ISO timestamp so future readers know provenance.
- **Encoding**: explicit UTF-8 (no BOM) mandate; PowerShell display mojibake is a console-codepage issue, not a real file issue.
- **`astro check` noise**: filter errors by the new file's path — pre-existing repo errors (unrelated `src/types/index.ts` etc.) are not blockers.
- **Phase 7.5 added**: build + grep rendered HTML for hero/stats/CTA strings, optionally re-screenshot the live page and `look_at` both source and rendered to compare.
- **Build evidence** — pandadoc-test produced a valid 58KB `dist/client/pandadoc-test/index.html`; all 13 sections rendered.
