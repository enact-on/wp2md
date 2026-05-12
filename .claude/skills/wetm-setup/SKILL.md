---
name: wetm-setup
description: >-
  Guided WordPress-to-Markdown/MDX migration using wordpress-export-to-markdown (wetm).
  Phase 1: scans the WordPress XML export, asks plain-language questions, and produces
  a production-ready wetm.config.js. Phase 2: runs the conversion, reads the migration
  report, verifies content completeness, and auto-fixes gaps. Use for any WordPress →
  static site migration (Astro, Next.js, Hugo, Eleventy, Gatsby, etc.).
trigger: /wetm-setup
---

# /wetm-setup — WordPress Export to Markdown Migration

This skill guides you through a complete WordPress → Markdown/MDX migration using the
`wordpress-export-to-markdown` (wetm) tool in this project directory. It runs in two phases:

- **Phase 1** — Scan the WordPress XML, ask targeted questions, build a production-ready `wetm.config.js`
- **Phase 2** — Run the conversion, verify all content migrated, auto-fix any gaps

You are operating inside the `wordpress-export-to-markdown` project directory. Run all
`node app.js` commands from this directory.

---

## Before you start

If the user hasn't exported from WordPress yet, tell them:

> In WordPress admin go to **Tools → Export**, choose **All content**, click
> **Download Export File**. This gives you a `.xml` file. Drop it in the `input/`
> folder of this project, or note its full path.

---

## Phase 1: XML Analysis & Configuration

### Step 1 — Locate the XML file

Ask: "Where is your WordPress export XML? If you put it in `input/`, just tell me the
filename. Otherwise give me the full path."

If they're unsure, look for XML files:

```powershell
Get-ChildItem -Path "input","." -Filter "*.xml" -Recurse -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty FullName
```

Once you have the path, note it as `$XML_PATH` for all subsequent commands.

---

### Step 2 — Run `wetm init` to scan the XML

```bash
node app.js init "$XML_PATH"
```

This prints a discovery report and writes `input/wetm.config.<slug>.js`. Read both the
console output AND the generated config file. The config file is your working baseline
for all subsequent edits.

If the command refuses because a config already exists for this file, ask the user:
"A config for this XML already exists. Do you want to start fresh (delete and regenerate)
or keep working with the existing config?"

If starting fresh, delete the old config and re-run `init`.

---

### Step 3 — Read and parse the generated config

Read `input/wetm.config.<slug>.js`. Extract and note:

1. The **comment header** — total post count, detected plugins (e.g. "Plugins detected: acf, seopress")
2. `postTypes` — every type with its count; which ones `wetm init` already set `enabled: false`
3. `meta.rules` section — all detected meta keys (even those commented out)
4. `shortcodeHandlers` stubs — shortcodes found in content
5. `blockHandlers` stubs — Gutenberg blocks that need handlers
6. `seo.plugin` — which SEO plugin was auto-detected

You now have everything you need to ask smart, targeted questions.

---

### Step 4 — Ask the user questions (one group at a time)

Present each group, wait for answers, then move to the next. Do not dump all questions
at once. Use what the generated config already tells you — skip irrelevant questions.

---

#### Group A: Target framework & output format

Ask these two questions together:

1. **What framework are you migrating to?**
   - Astro
   - Next.js
   - Gatsby
   - Hugo
   - Eleventy / 11ty
   - SvelteKit / VitePress
   - Plain Markdown (no framework)
   - Other

2. **Output format?** Recommend based on their answer:
   - Astro / Next.js / SvelteKit → **MDX** (supports JSX components; complex ACF data
     becomes `export const` blocks that frameworks can import)
   - Hugo / Eleventy / Gatsby / plain → **Markdown** (simpler, universal)
   - Unsure / mixed → **auto** (wetm decides per file based on content complexity)

   Explain: "MDX lets you embed React/Astro components in posts and handles complex
   nested data structures from ACF as importable JavaScript. Plain Markdown works
   everywhere with no build-step dependency."

3. **Output directory?** Suggest `output/<site-slug>/` so multiple site migrations
   never collide.

---

#### Group B: Post types

Show the user a plain-English table of every detected post type:

```
Post types in your WordPress export:

  ENABLED BY DEFAULT:
  ├── post           (N posts) — standard blog posts
  ├── page           (N posts) — standard pages
  └── [other custom types that wetm init left enabled]

  DISABLED BY DEFAULT (plugin internals — no real content):
  ├── acf-field, acf-field-group, etc.  — ACF schema definitions
  ├── bricks_template                   — Bricks builder layouts
  └── seopress_404, seopress_schemas    — SEOPress internal records

  UNDECIDED (custom types you need to classify):
  └── [any type wetm init didn't auto-disable]
```

For each **undecided** custom type, ask:
"Is `[type-name]` (N posts) real content you want to migrate? If yes, what folder name
should it go in? (e.g. `reviews`, `guides`, `products`)"

Types you should always disable (plugin-internal, never content):
- `acf-field`, `acf-field-group`, `acf-post-type`, `acf-taxonomy`, `acf-ui-options-page`
- `bricks_template`
- `seopress_404`, `seopress_schemas`
- `wpcode_snippet`, `yst_prominent_word`
- `shop_order`, `shop_coupon`, `shop_order_refund` (unless migrating WooCommerce orders)
- `custom_css`, `nf_sub`, `wpcf7_contact_form`

Tell the user: "Plugin-internal types store configuration records and layout data, not
content. They produce useless output files and inflate counts."

---

#### Group C: SEO data

Skip this group if no SEO plugin was detected (no `seo.plugin` in config).

If SEO plugin was detected (Yoast, RankMath, SEOPress, or All in One SEO), ask:

"Your site uses [PLUGIN]. Should I migrate SEO titles, descriptions, canonical URLs,
and `noindex` flags into a `seo:` block in each post's frontmatter?"

If **yes**: keep the `seo` section. Ask: "What should the frontmatter key be called?"
(default is `seo`; some prefer `meta`, `og`, or `head`)

If **no**: remove the `seo` section; remove the SEO plugin from `plugins.enabled`.

---

#### Group D: Custom fields (meta) — the critical section

This section has the highest impact on migration quality. Do it carefully.

Look at the `meta.rules` section of the generated config. It lists all detected meta
keys with usage counts and sample values (commented out).

**Step D1 — Auto-classify obvious noise** (no need to ask the user):

Always skip these — add them to `meta.deny` if not already there:
- `_edit_lock`, `_edit_last`, `_wp_trash_meta_time`, `_wp_trash_meta_status`
- `_pingme`, `_encloseme`, `_oembed_*`
- `_wp_page_template` (layout config, not content)
- `_thumbnail_id` (covered automatically as `coverImage`)
- `_bricks_page_content_2`, `_bricks_page_header_2`, `_bricks_template_type`,
  `_bricks_editor_mode`, `_bricks_template_settings`

ACF reference keys (underscore-prefixed keys that store the ACF field key, not the value):
- If `my_field` exists, the corresponding `_my_field` is its ACF reference — skip it.
  The `acf` plugin pack handles this automatically. No explicit rule needed.

SEO keys are handled by SEO plugin packs — no explicit rules needed for `_yoast_wpseo_*`,
`rank_math_*`, `_seopress_*`, `_aioseop_*`.

WooCommerce keys are handled by the woocommerce plugin pack — no explicit rules needed
for `_price`, `_stock_status`, `_sku`, `_product_*`, etc.

**Step D2 — Identify content-bearing fields** (ask the user):

Look at the sample values in the commented meta.rules. If a key's sample value contains
HTML tags (`<p>`, `<br>`, `<ul>`, `<strong>`, etc.) or appears to be a long block of text,
it likely stores the post's real body content in a meta field instead of `post_content`.

This is extremely common with:
- Review post types: `review_content`, `review_body`, `review_text`
- Guide post types: `guide_content`, `content_body`
- Any ACF "textarea" or "wysiwyg" field

Ask the user: "I found these fields that appear to contain HTML content:
[list the fields]. Should this content appear in the post body (body text), in frontmatter
(as raw HTML), or be skipped?"

If the user wants it in the body, add to `contentFields` with an HTML→Markdown template:

```js
{
  key: "field_name",
  template: (html) => {
    if (!html || typeof html !== 'string') return '';
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      .replace(/<p[^>]*>/gi, '').replace(/<\/p>/gi, '')
      .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<em>(.*?)<\/em>/gi, '*$1*')
      .replace(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  },
},
```

For list fields (HTML `<ul>/<ol>` bullet lists), use this template instead:

```js
{
  key: "key_takeaways",
  position: "prepend",     // put before the main body
  template: (html) => {
    if (!html || typeof html !== 'string') return '';
    const items = [];
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = liRe.exec(html)) !== null) {
      const text = m[1]
        .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ').trim();
      if (text) items.push(`- ${text}`);
    }
    if (!items.length) return '';
    return `## Section Heading\n\n${items.join('\n')}`;
  },
},
```

**Important:** Any field added to `contentFields` must also be set to `"skip"` in
`meta.rules` so it doesn't double-appear in frontmatter.

**Step D3 — Identify frontmatter fields** (ask the user):

For remaining custom fields with scalar values (ratings, URLs, names, booleans,
dates, short strings), ask: "Should these fields appear in the post's frontmatter YAML?

[list: field_name (sample value: "..."), ...]"

Group fields by prefix and offer wildcard rules. For example, if you see `review_rating`,
`review_platform`, `review_source`, offer:
```js
"review_*": { mode: "frontmatter" },
```

Ask the user to confirm the wildcard or ask for individual rules if some fields in the
group should be skipped.

**Step D4 — unknownFallback**

Ask: "For any custom fields not explicitly configured, what should happen by default?"
- **Skip them** (recommended) — clean output; you can always add explicit rules later
- **Auto-classify** — short strings → frontmatter; long strings / nested objects → MDX
  export const blocks
- **All to frontmatter** — everything lands in frontmatter (noisy but complete)

---

#### Group E: Images

Ask: "How should images be handled?"

Options:
- **Download all** (`"all"`) — downloads every image URL referenced anywhere in posts
  (featured images + inline images in content). Saves to `images/` in the output dir.
  Takes significant time for large sites. Requires the old site to still be online.
- **Download attached only** (`"attached"`) — only featured/attached images, not inline
- **Keep original URLs** (`"none"`) — no downloading; image URLs stay as-is in markdown.
  Use if the old CDN will stay online, or if you'll handle images separately.
- **Skip entirely** (`"none"`) — strip image references from output

If downloading, ask: "Should I generate an `image-map.json` mapping old URLs to new local
paths?" (Useful for updating references in other systems like a database or CMS.)

Note: If the old site requires authentication or blocks hotlinking, downloading will fail
with 403 errors. Mention this risk for large sites.

---

#### Group F: Redirects

Ask: "Do you need redirect rules so old WordPress URLs automatically forward to new ones?"

If yes, ask deployment platform:
- **Netlify** → `_redirects` file
- **Vercel** → `vercel.json`
- **Next.js** → `redirects.js`
- **Apache** → `.htaccess`
- **Nginx** → `nginx-redirects.conf`
- **None / skip** → disable redirects

---

#### Group G: Shortcodes and blocks (only if detected)

Skip this group if the generated config has no `shortcodeHandlers` or `blockHandlers` stubs.

**Shortcodes:** Show the user every detected shortcode. For each, determine:
- Is it a real WordPress shortcode (a plugin feature) or a false positive?
- False positives are HTML attributes or bracket-text that look like shortcodes:
  `data-field`, `type`, `field`, `checkbox`, `contenteditable`, `your`, `placeholder`,
  form numbers like `[MV2548]` or `[SP-41 (Permanent)]`, bracket text like `[your county]`.
  All false positives → `"skip"`.
- Real shortcodes: offer options — `"skip"`, `"html"` (output raw HTML), or write a
  custom handler function.

**Gutenberg blocks:** Show the user every detected block with counts. For each:
- Page builder blocks (`elementor/*`, `divi/*`, `wpbakery/*`, `beaver-builder/*`,
  `bricks/*`) — almost always contain visual layout data with no textual meaning.
  Recommend: wildcard skip `"elementor/*": "skip"`.
- Third-party plugin blocks with HTML content → `"html"` (output raw HTML via turndown)
- Third-party plugin blocks you want to convert custom → write a handler function.

Also set `shortcodes.unknownFallback: "skip"` if the site has many unknown shortcodes;
otherwise the output will be cluttered with raw shortcode strings.

---

### Step 5 — Apply all answers to the config

After all groups are answered, edit `input/wetm.config.<slug>.js` to apply every change.
Work through each section systematically:

1. `output.format` — `"mdx"`, `"md"`, or `"auto"`
2. `output.dir` — the user's chosen output path
3. `postTypes` — enabled/disabled with folder names per user's answers
4. `seo` section — keep or remove based on Group C
5. `plugins.enabled` — include/exclude based on detected plugins and user choices
6. `taxonomies.enabled` — include all real taxonomies; remove plugin-internal ones
   (e.g. `wpcode_location`, `wpcode_type` unless the user wants them)
7. `taxonomies.emit.astroCollections: true` if using Astro with custom taxonomies
8. `contentFields` — add entries for HTML meta fields (from Step D2)
9. `meta.rules` — uncomment and configure based on Step D3; add wildcards
10. `meta.unknownFallback` — set per Step D4
11. `meta.deny` — ensure noise keys are listed
12. `shortcodes.unknownFallback: "skip"` + `shortcodes.handlers` — apply Group G answers
13. `blocks.handlers` — apply Group G block answers
14. `images.save` — apply Group E choice
15. `images.emitImageMap` — set per user choice in Group E
16. `links.redirects.format` — apply Group F choice
17. `links.redirects.emit` — set to `false` if user skipped redirects

**Also check:** if the user's site has frontmatter fields that need renaming, add to
`frontmatter.aliases`. If they need computed fields (e.g. extracting reviewer name from
title), add to `frontmatter.custom`.

**Show the user the final config** before converting. Point out the key decisions.
Ask: "Anything else you'd like to adjust before we run the conversion?"

---

## Phase 2: Conversion & Verification

### Step 1 — Run the conversion

```bash
node app.js --config input/wetm.config.<slug>.js
```

Watch for errors in the output:
- `Cannot find module` — a plugin file path is wrong
- `TypeError: ... is not a function` — a hook or template function has a syntax error
- `post_id collision` — duplicate posts (harmless, deduplicated automatically)
- `EACCES` / `EPERM` — output directory permission issue

If a syntax error occurs in the config, read and fix the specific line. Common issues:
- Missing comma after a function in `contentFields`
- Unterminated template literal in a handler function
- Arrow function missing the closing brace

Re-run after each fix.

---

### Step 2 — Read the migration report

Read these files:
```
output/<slug>/migration-report.txt   ← human-readable summary
output/<slug>/migration-report.json  ← machine-readable for counting
```

Extract from the report:
- **Input count** vs **written count** per post type
- **Skipped** post count and reason (draft status, etc.)
- **Unknown blocks** — blocks that fell through to generic HTML→MD (list with counts)
- **Unknown shortcodes** — shortcodes with no handler
- **Meta field distribution** — frontmatter / complex / skipped counts
- **Image stats** — downloaded / failed counts (if applicable)

---

### Step 3 — Verify completeness

**3A — Post count check:**

For each enabled post type:
- Input count (from report or from the `// N posts` comment in config)
- Written count (from report)
- Acceptable gap: only published posts migrate when `statuses: ["publish"]`. Draft/private
  posts are expected to be absent unless you added them to `statuses`.

If written count is far below input count (not explained by draft/private posts):
1. Check if the post type was accidentally left `enabled: false`
2. Check if the `posts.filter` function is too restrictive
3. Check if posts use an unexpected status (e.g. `future`, `pending`)

**3B — Content quality check:**

Read 3–5 sample output files from each custom post type. Check:

- Frontmatter has expected fields: title, date, slug, and custom fields
- Body content exists and isn't empty (empty body + custom post type = contentFields needed)
- No raw HTML tags in body (e.g. `<p>text</p>` → indicates missing HTML→MD conversion)
- No bracketed shortcodes remaining: `[shortcode attr="value"]` → add handler
- No `{expression}` in MDX that shouldn't be there (wetm escapes these, but custom
  template functions may bypass this)
- Images have correct markdown syntax: `![alt](url)` or local path `![alt](../images/...)`
- Internal links point to new routes, not old WordPress URLs like `/year/month/slug/`

**3C — Meta coverage check:**

If the migration report shows many meta keys going to "skipped" and the user expected
them in frontmatter, add explicit rules or change `unknownFallback`.

If keys are going to "complex" (MDX export const blocks) but the user expected them as
simple frontmatter values, check if the raw values are longer than `maxStringLength`
(default 200). Set `frontmatter.maxStringLength` higher, or add an explicit rule:
```js
"long_key": { mode: "frontmatter" },
```

**3D — Block and shortcode coverage:**

If many blocks fell through to "generic HTML fallback", show the user the block names
and offer to add skip handlers or custom converters.

If unknown shortcodes are listed, add them to `shortcodes.handlers` as `"skip"` or
write custom handlers.

---

### Step 4 — Auto-fix detected issues and re-run

For each issue, fix the config and re-run. The most common fixes:

| Issue | Config fix |
|---|---|
| Post body is empty (content in meta) | Add `contentFields` entry with HTML template |
| Field missing from frontmatter | `meta.rules: { "key": { mode: "frontmatter" } }` |
| Field in frontmatter as raw HTML | Move to `contentFields`, add `"skip"` rule |
| Shortcodes cluttering body | `shortcodes.handlers: { "name": "skip" }` |
| Page builder blocks producing garbage | `blocks.handlers: { "elementor/*": "skip" }` |
| Post type count too low | Add `"draft"` or `"private"` to `posts.statuses` |
| Taxonomy terms missing | Add taxonomy to `taxonomies.enabled` |
| Images failing (403/timeout) | Set `images.save: "none"`, handle manually |
| MDX build errors from `{}` in content | Add `escapeForMdx` call in contentFields template |
| Internal links still pointing to old site | Verify `site.url` matches old WordPress URL exactly |

After each round of fixes, re-run conversion and re-verify until counts match and
sample files look correct.

---

### Step 5 — Final report to the user

Once verification passes, report:

```
Migration complete!

Posts migrated:
  post:           X written  (Y skipped as drafts)
  page:           X written
  [custom-type]:  X written
  ...

Output:  output/<slug>/
Config:  input/wetm.config.<slug>.js

Things to review manually:
  - N blocks used generic HTML fallback: [block-name (count), ...]
    → consider adding skip or custom handlers if output looks wrong
  - N shortcodes were skipped: [names]
  - Images: N downloaded, M failed
    → failed images listed in migration-report.json under imageFails

Next steps:
  1. Spot-check output/<slug>/ — open a few posts and verify content looks right
  2. Copy output/<slug>/ into your [framework] project's content directory
  3. [If Astro] Define content collections in src/content/config.ts for each post type
  4. [If MDX] Run your framework's build — MDX compilation catches any syntax issues
  5. [If redirects enabled] Deploy the [format] redirect file so old WordPress URLs forward
  6. Test internal links — verify they resolve in the new site's routing
```

---

## Internal knowledge: WordPress content patterns

### When post body is empty but meta fields contain content

Very common with custom post types built on ACF. The developer stored all content in
custom fields rather than the standard WordPress editor. Signs:
- `post_content` is empty or has a placeholder
- Meta keys like `review_content`, `guide_body`, `description_html` have HTML values

Fix: Add each content-bearing field to `contentFields` with an HTML→Markdown template.
Also set those keys to `"skip"` in `meta.rules`.

### ACF "wysiwyg" field content

ACF's WYSIWYG (rich text) fields produce HTML identical to standard WordPress content.
Use the HTML→Markdown template from Step D2.

### ACF "repeater" field content

ACF repeater fields are stored as PHP-serialized arrays in meta. When decoded, they
become nested objects. wetm auto-classifies them as MDX `export const` blocks. If you
need them as frontmatter (e.g. an array of tags), add an explicit rule:
```js
"my_repeater": { mode: "complex" },  // export const block (default for nested objects)
```

### Shortcodes that aren't real shortcodes

Sites with complex HTML or form builders often produce values in brackets that the
parser picks up as shortcodes. Common false positives:
- Form numbers: `[MV2548]`, `[SP-41 (Permanent)]`, `[DMV-100]`
- Placeholder text: `[your name]`, `[your county]`, `[field name]`
- HTML attributes accidentally included: `[data-field]`, `[type]`, `[checkbox]`

All → `"skip"` in `shortcodes.handlers`.

### SEO plugin meta keys

Each SEO plugin produces dozens of meta keys handled by the built-in plugin packs.
Do NOT add explicit rules for these — the plugin packs consume them first.
- Yoast: `_yoast_wpseo_*`, `yoast_wpseo_*`
- RankMath: `rank_math_*`
- SEOPress: `_seopress_*`
- AIOSEO: `_aioseop_*`

### Bricks builder pages

Bricks stores visual layout as JSON in `_bricks_page_content_2`. This is template/layout
data, not text content. Pages built entirely in Bricks will have empty or minimal
`post_content`. If content is missing, check if it lives in ACF fields or other meta.

### PHP-serialized multi-value fields

Some plugins (gallery managers, repeaters, complex ACF fields) store data as:
```
a:3:{i:0;s:4:"val1";i:1;s:4:"val2";i:2;s:4:"val3";}
```
wetm decodes these automatically. Simple arrays of scalars → frontmatter as YAML arrays.
Nested objects → MDX `export const` blocks.

### WooCommerce product data

Products have many meta keys managed by the WooCommerce plugin pack. Key decisions:
- Enable `woocommerce` in `plugins.enabled`
- Disable transactional types: `shop_order`, `shop_coupon`, `shop_order_refund`
- Keep `product` enabled with `folder: "products"`
- `product_variation` type: disable unless you want individual variation pages

### Internal WordPress meta keys to always deny

Add these to `meta.deny` (or rely on the default deny list):
```js
deny: [
  "_edit_lock", "_edit_last",
  "_wp_trash_meta_time", "_wp_trash_meta_status",
  "_pingme", "_encloseme",
  "_oembed_*",           // cached oEmbed data
  "_wp_page_template",   // layout setting
  "_thumbnail_id",       // handled as coverImage automatically
],
```

---

## Internal knowledge: Per-post-type meta rules

When different post types use the same meta key names differently, use per-type rules:

```js
meta: {
  rules: {
    "content_body": "skip",       // global: skip for everyone
  },
  perType: {
    "guide": {
      "content_body": { mode: "frontmatter" },  // but keep it for guides
    },
  },
}
```

---

## Internal knowledge: Framework-specific advice

### Astro
- Use `format: "mdx"` and `taxonomies.emit.astroCollections: true`
- Output goes into `src/content/<post-type>/` in your Astro project
- Define a schema in `src/content/config.ts` for each collection
- `export const` blocks in MDX are importable from Astro pages directly

### Next.js (App Router)
- Use `format: "mdx"` with `links.redirects.format: "next"`
- Add `next-mdx-remote` or `@next/mdx` to process MDX content
- `redirects.js` from wetm can be merged into `next.config.js`

### Hugo
- Use `format: "md"` (Hugo uses its own template system, not MDX)
- Use `posts.dateFolders: "year"` if your Hugo theme expects date-based URLs
- Use `links.redirects.format: "apache"` or `"netlify"` depending on hosting

### Eleventy / 11ty
- Use `format: "md"` or `"auto"`
- Frontmatter YAML is read natively by Eleventy
- Use `links.redirects.format: "netlify"` for Netlify deployment

---

## Internal knowledge: Common mistakes to avoid

1. **Leaving `meta.unknownFallback` as `null` (auto) on a messy export**
   Every plugin's internal key gets auto-classified and bleeds into frontmatter.
   Recommendation: always set to `"skip"` and add explicit rules for fields you want.

2. **Not using `contentFields` for HTML meta fields**
   Raw HTML string ends up in frontmatter. Post body is empty. Users see a blank page.
   Always check: does this post type have content in meta fields?

3. **Keeping `seopress_404` enabled**
   Results in 1000+ files full of redirect tracking records — not real content.
   Always: `seopress_404: { enabled: false }`.

4. **Wildcard meta rule too broad**
   `"_*": { mode: "frontmatter" }` catches every private key including plugin internals.
   Always be specific: `"review_*"`, not `"*"`.

5. **Not checking for typos in meta key names**
   Some sites have typos in their ACF field names (the field was created with a typo and
   never fixed). Check the detected meta keys for near-duplicates like `reviewer_*` and
   `reveiw_*`. Add rules for both.

6. **Image download failures without warning**
   The old site might block hotlinking, be offline, or require auth cookies.
   Check migration-report.json for `imageFails`. If count is high, switch to `"none"`.

7. **MDX syntax errors from content with curly braces**
   Body content containing `{value}` or `${expr}` breaks MDX compilation.
   wetm's `escapeForMdx()` handles the standard body, but custom `contentFields` templates
   that produce `{}` characters bypass this. Escape them explicitly in your template:
   ```js
   text.replace(/\{/g, '\\{').replace(/\}/g, '\\}')
   ```

8. **Internal links still resolving to old WordPress URLs**
   Ensure `site.url` in the config exactly matches the WordPress site URL (no trailing slash,
   same protocol). This is used to identify which links are internal before rewriting.

9. **Taxonomy slugs with hyphens causing JS property access issues**
   In the config, use string keys with quotes: `"reviewer-state"`, not `reviewer-state`.

---

## Quick reference: Config modification patterns

| Goal | Config change |
|---|---|
| Enable a content post type | `postTypes: { "type": { enabled: true, folder: "folder" } }` |
| Disable a plugin-internal type | `postTypes: { "acf-field": { enabled: false } }` |
| Field → frontmatter | `meta.rules: { "field": { mode: "frontmatter" } }` |
| Field group wildcard → frontmatter | `meta.rules: { "review_*": { mode: "frontmatter" } }` |
| HTML field → post body | Add to `contentFields` with HTML template; set rule to `"skip"` |
| Rename a frontmatter key | `meta.rules: { "old_key": { mode: "frontmatter", alias: "newKey" } }` |
| Computed frontmatter field | `frontmatter.custom: { key: (post) => computedValue }` |
| Skip a noisy meta key | `meta.rules: { "key": "skip" }` |
| Skip a shortcode | `shortcodes.handlers: { "name": "skip" }` |
| Skip a block type | `blocks.handlers: { "namespace/*": "skip" }` |
| Rename taxonomy in frontmatter | `taxonomies.aliases: { "old-name": "newName" }` |
| Include draft posts | `posts.statuses: ["publish", "draft"]` |
| Date-organized folders | `posts.dateFolders: "year"` or `"year-month"` |
| Astro content collections | `taxonomies.emit.astroCollections: true` |
| Redirect format | `links.redirects.format: "netlify"` (or vercel/next/apache/nginx) |
| Per-type frontmatter | `frontmatter.perType: { "type": { fields: [...], custom: {...} } }` |
| Per-type meta rules | `meta.perType: { "type": { "key": { mode: "frontmatter" } } }` |
| Transform a field value | `meta.rules: { "price": { mode: "frontmatter", transform: (v) => Number(v) } }` |
| Nested frontmatter key | `meta.rules: { "seo_title": { mode: "frontmatter", alias: "seo.title" } }` |
