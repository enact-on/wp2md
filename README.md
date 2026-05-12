# wordpress-export-to-markdown

Converts a WordPress export XML file (or many) into Markdown / MDX files, with **full custom post type, taxonomy, custom field, SEO, link, and media handling**. Built for migrating real, messy, multi-site WordPress estates onto Astro, Eleventy, Hugo, or Gatsby.

> Originally by Will Boyd. v4 is a near-rewrite focused on production-grade migrations across many client sites.

---

## Quick start

### Recommended: config-file-first

Scan your export and generate a pre-filled, annotated config in one command:

```
node app.js init export.xml
```

This produces a `wetm.config.js` next to your XML, with every post type, taxonomy, meta key, shortcode, Gutenberg block, and detected plugin already filled in and commented. Edit it, then run:

```
node app.js --config wetm.config.js
```

### Interactive wizard

```
npx wordpress-export-to-markdown
```

Asks for your XML, discovers post types and taxonomies, and walks you through the standard options.

### Fully scripted

```
node app.js --wizard=false \
  --input=exports/ \
  --output=output \
  --post-types=post,page,case_study,product \
  --taxonomies=industry \
  --output-format=auto \
  --site-url=https://oldsite.com
```

---

## What v4 adds

- **`wetm init`** — scans your XML, auto-detects plugins / post types / meta keys / blocks / shortcodes, and writes a ready-to-edit `wetm.config.js`
- **Config-file-first workflow** — `wetm.config.js` is the primary way to configure complex migrations; CLI flags still work and override config values
- **Per-post-type configuration** — folder name, file extension, frontmatter field list, meta rules, and `unknownFallback` all scoped per type
- **`contentFields`** — append or prepend any custom field's value into the post body, with an optional heading or template function
- **SEO auto-detection** — Yoast, RankMath, SEOPress, and All in One SEO are detected by `wetm init` and mapped to a configurable `seo:` frontmatter block
- **Meta `transform` functions** — apply per-key transforms (cast, reformat, compute) inline in config
- **`unknownFallback`** — control what happens to unconfigured meta keys: `'skip'`, `'frontmatter'`, `'complex'`, or `null` (auto-classify, the default)
- **Full plugin hook API** — `onMeta`, `onShortcode`, `onBlock`, `onContent`, `onFrontmatter`, `onPost`
- **`blockHandlers` / `shortcodeHandlers`** maps in config — no plugin boilerplate needed for simple cases
- **Transform hooks** — `transformContent`, `transformFrontmatter`, `transformPost`, `transformImageUrl` run after all plugins
- **Multi-format redirects** — netlify, next, vercel, apache, nginx
- **Astro content collections** — `emitAstroCollections: true` writes each taxonomy term as `src/content/[taxonomy]/[slug].json`
- **Interactive custom post type selection** — auto-detects every `post_type` in the XML
- **Auto-detected custom taxonomies** — beyond `category` / `post_tag`, surfaced into frontmatter and `data/taxonomies.json`
- **Custom field pipeline** — PHP-serialized blobs, JSON, scalars all decoded; classified as frontmatter or MDX `export const` blocks
- **MDX output** — `.mdx` / `auto` / `.md`; MDX-safe escaping applied to body content
- **Plugin packs** for ACF, Yoast, RankMath, SEOPress, WooCommerce — built in, enabled by default
- **Link rewriting** — internal links and images rewritten to new routes
- **Multi-file input** — `--input` accepts a file, directory, or glob; deduped by `post_id`
- **Authors registry** — `data/authors.json` from `<wp:author>` records
- **Migration report** — `migration-report.txt` / `.json` after every run

---

## `wetm init` — generate a config from your export

```
node app.js init export.xml
```

What it detects and generates:

| Thing detected | What appears in config |
|---|---|
| Post types + counts | `postTypes` array with folder + extension per type |
| Custom taxonomies | `taxonomies` array |
| Meta keys (frequency + sample) | `meta.rules` entries, commented out |
| Gutenberg blocks | `blockHandlers` stubs |
| Shortcodes | `shortcodeHandlers` stubs |
| Yoast / RankMath / SEOPress / WooCommerce / ACF | `plugins.enabled` + `plugins.seo.plugin` set |
| Page builders (Elementor, Divi, WPBakery, Beaver) | Wildcard block handler stub |

WooCommerce, SEO, and ACF reference meta keys are excluded from `meta.rules` (they are handled by the built-in plugins). Internal WordPress keys (`_edit_lock`, `_oembed_*`, etc.) are excluded too.

---

## Output layout

```
output/
├── posts/
│   └── hello-world/
│       └── index.md
├── case-studies/               ← renamed via postTypeConfig.case_study.folder
│   └── acme/
│       └── index.mdx           ← .mdx because it has complex fields
├── pages/
├── products/
├── data/
│   ├── authors.json
│   └── taxonomies.json
├── src/content/industry/       ← emitAstroCollections: true
│   ├── healthcare.json
│   └── fintech.json
├── _redirects                  ← old → new permalinks
├── migration-report.txt
└── migration-report.json
```

---

## `wetm.config.js` — full reference

Below is a fully annotated example. Every key is optional.

```js
// wetm.config.js
export default {

  // ── Input / output ──────────────────────────────────────────────────────
  input:  'exports/',           // file, directory, or glob (overridden by --input)
  output: 'output',

  // ── Post types ──────────────────────────────────────────────────────────
  postTypes: ['post', 'page', 'case_study', 'product'],

  postTypeConfig: {
    case_study: {
      folder:    'case-studies',   // output folder name (default: post type slug)
      extension: 'mdx',            // 'md', 'mdx', or 'auto'
    },
    product: {
      folder: 'products',
    },
  },

  // ── Taxonomies ──────────────────────────────────────────────────────────
  taxonomies: ['industry'],

  // Write each term as src/content/[taxonomy]/[slug].json (for Astro)
  emitAstroCollections: true,

  // ── SEO plugins ─────────────────────────────────────────────────────────
  plugins: {
    enabled: ['acf', 'yoast', 'rankmath', 'seopress', 'woocommerce'],

    seo: {
      // Which plugin to read SEO meta from: 'yoast' | 'rankmath' | 'seopress' | 'aioseo'
      plugin: 'yoast',

      // Frontmatter key that receives the seo block (default: 'seo')
      frontmatterKey: 'seo',

      // Override individual field mappings (meta_key → seo sub-key)
      fieldOverrides: {
        '_yoast_wpseo_title':       'title',
        '_yoast_wpseo_metadesc':    'description',
        '_yoast_wpseo_canonical':   'canonical',
      },
    },
  },

  // ── Custom meta rules ────────────────────────────────────────────────────
  meta: {
    // What to do with meta keys that have no explicit rule:
    //   null (default) = auto-classify  |  'skip'  |  'frontmatter'  |  'complex'
    unknownFallback: null,

    // Keys to always drop (in addition to built-in deny list)
    deny: ['_some_internal_key'],

    // Include private (underscore-prefixed) meta that isn't handled by plugins
    includePrivate: false,

    // Max string length before auto-classifying as complex MDX block (default: 200)
    maxFrontmatterStringLength: 200,

    rules: {
      // Shorthand: just a mode
      reading_time: 'frontmatter',

      // Object form: mode + optional alias + optional transform
      _price: {
        mode:      'frontmatter',
        alias:     'price',
        transform: (v) => Number(v),
      },

      // Alias with dotted nesting → builds nested object in frontmatter
      custom_title: {
        mode:  'frontmatter',
        alias: 'seo.title',
      },

      // Skip a specific key
      _some_noise: 'skip',

      // Wildcard patterns — '*' matches any characters in the key name.
      // Exact key matches always win over wildcard patterns.
      // Example: pull all review_* fields into frontmatter at once,
      // but skip review_body (handled via contentFields instead):
      'review_body': 'skip',
      'review_*':    { mode: 'frontmatter' },
    },

    // Per-post-type overrides (merged with global rules; type wins on conflict)
    perType: {
      product: {
        _stock_status: { mode: 'frontmatter', alias: 'product.stockStatus' },
      },
    },
  },

  // ── contentFields — pull meta values into the post body ─────────────────
  //
  // Each entry appends (or prepends) a meta field's value into the post content.
  // Useful for ACF textarea fields, technical specs, etc.
  contentFields: [
    {
      key:      'client_name',
      heading:  '## Client',       // optional Markdown heading inserted before the value
      position: 'append',          // 'append' (default) or 'prepend'
    },
    {
      key:      'product_specs',
      // template replaces heading — receives the raw value, returns a string
      template: (value) => `\n\n**Specs:** ${value}\n`,
    },
  ],

  // ── Redirect format ──────────────────────────────────────────────────────
  // 'netlify' (default) | 'next' | 'vercel' | 'apache' | 'nginx'
  redirectsFormat: 'netlify',

  // ── Block handlers ───────────────────────────────────────────────────────
  // Return a Markdown / MDX string, or null to fall back to generic HTML→MD.
  blockHandlers: {
    'core/image': ({ attrs, inner }) =>
      `![${attrs?.alt ?? ''}](${attrs?.url ?? ''})`,

    'acf/hero': ({ attrs }) =>
      `<Hero title="${attrs?.data?.title ?? ''}" />`,

    // Wildcard for a page builder — return '' to silently drop
    'elementor/*': () => '',
  },

  // ── Shortcode handlers ───────────────────────────────────────────────────
  shortcodeHandlers: {
    'pricing-table': ({ attrs }) =>
      `<PricingTable plan="${attrs.plan}" />`,

    'contact-form': () => `<ContactForm />`,
  },

  // ── Transform hooks (run after all plugins) ───────────────────────────────
  hooks: {
    transformContent({ post, content }) {
      // Return modified content string
      return content.replace(/\[old-brand\]/g, 'New Brand');
    },

    transformFrontmatter({ post, frontmatter }) {
      // Mutate frontmatter in place or return a new object
      frontmatter.migrated = true;
    },

    transformImageUrl({ url, post }) {
      // Rewrite image URLs before download
      return url.replace('cdn-old.example.com', 'cdn.example.com');
    },

    transformPost({ post }) {
      // Called last — mutate the post object directly
    },
  },

  // ── Custom plugins ────────────────────────────────────────────────────────
  // File paths (relative to config) or inline plugin objects.
  customPlugins: [
    './plugins/my-acf-plugin.js',
    {
      name: 'inline-example',
      onMeta({ metas, frontmatter, consumed }) {
        const hero = metas.find((m) => m.key === '_hero_image_id');
        if (hero) {
          frontmatter['heroImageId'] = hero.value;
          consumed.add('_hero_image_id');
        }
      },
    },
  ],
};
```

---

## Custom field handling

Given this in the XML:

```xml
<wp:postmeta>
  <wp:meta_key>client_name</wp:meta_key>
  <wp:meta_value><![CDATA[Acme Healthcare]]></wp:meta_value>
</wp:postmeta>
<wp:postmeta>
  <wp:meta_key>specifications</wp:meta_key>
  <wp:meta_value><![CDATA[a:3:{s:10:"dimensions";a:2:{s:5:"width";i:12;...}}]]></wp:meta_value>
</wp:postmeta>
```

You get:

```mdx
---
client_name: "Acme Healthcare"
title: "Acme Healthcare Case Study"
industry:
  - "healthcare"
---

export const specifications = {
  dimensions: { width: 12, height: 8 },
  features: ["a", "b", "c"],
  in_stock: true
};

This is a case study.

## Client

Acme Healthcare
```

The PHP-serialized blob is decoded automatically. `client_name` is classified as frontmatter. `specifications` (nested object) goes to an MDX `export const` block. The `contentFields` entry appends `client_name` into the body with a `## Client` heading.

---

## Plugin hook API

Custom plugins (inline objects or `.js` files) can implement any of these hooks:

| Hook | When it runs | What you can do |
|---|---|---|
| `onMeta({ metas, frontmatter, exports, consumed, post, options })` | After meta is decoded, before classification | Push to `frontmatter`, push to `exports`, add keys to `consumed` to suppress them |
| `onShortcode({ name, attrs, inner })` | When a shortcode is encountered | Return a replacement string |
| `onBlock({ name, attrs, inner, rawHtml })` | When a Gutenberg block is processed | Return a replacement string |
| `onContent({ post, content })` | After content is converted | Return modified content |
| `onFrontmatter({ post, frontmatter })` | After frontmatter is built | Mutate frontmatter in place |
| `onPost({ post })` | After everything | Final mutations to the post object |

Built-in plugins — `acf`, `yoast`, `rankmath`, `seopress`, `woocommerce` — all use these same hooks.

---

## SEO plugins

`wetm init` detects which SEO plugin your site uses and sets `plugins.seo.plugin` automatically. The built-in handlers map the plugin's raw meta keys to a tidy `seo:` frontmatter block:

```yaml
seo:
  title: "Custom SEO Title"
  description: "Meta description."
  canonical: "https://example.com/page/"
  noindex: false
```

Supported plugins: **Yoast SEO**, **RankMath**, **SEOPress**, **All in One SEO**. Change `plugins.seo.frontmatterKey` to rename the block (e.g. to `meta` or `og`). Use `plugins.seo.fieldOverrides` to remap individual keys.

---

## Redirect formats

`redirectsFormat` in config (or `--redirects-format` on the CLI):

| Value | Output file | Format |
|---|---|---|
| `netlify` (default) | `_redirects` | `/old /new 301` |
| `next` | `redirects.js` | `module.exports = [{ source, destination, permanent }]` |
| `vercel` | `vercel.json` | `{ "redirects": [...] }` |
| `apache` | `.htaccess` | `Redirect 301 /old /new` |
| `nginx` | `nginx-redirects.conf` | `rewrite ^/old$ /new permanent;` |

---

## All CLI options

Run `node app.js --help` for the full list.

| Option | Default | Purpose |
|---|---|---|
| `--input` | `export.xml` | File, directory, or glob |
| `--output` | `output` | Output directory |
| `--config` | _auto_ | Explicit path to `wetm.config.js` |
| `--output-format` | `mdx` | `mdx`, `md`, or `auto` |
| `--post-types` | _ask_ | Comma-separated post types to include |
| `--taxonomies` | _all_ | Custom taxonomies to include in frontmatter |
| `--meta-rules` | _empty_ | Quick per-key rules: `key:mode[:alias]` |
| `--meta-deny` | _empty_ | Meta keys to drop outright |
| `--include-private-meta` | `false` | Include `_`-prefixed meta not handled by plugins |
| `--max-frontmatter-string-length` | `200` | Strings longer than this go to MDX export blocks |
| `--plugins` | `acf,yoast,rankmath,seopress,woocommerce` | Built-in plugin packs to load |
| `--site-url` | _from XML_ | Used for internal link rewriting |
| `--rewrite-links` | `true` | Rewrite internal post-to-post links |
| `--emit-redirects` | `true` | Write redirect file |
| `--redirects-format` | `netlify` | Redirect format (netlify/next/vercel/apache/nginx) |
| `--emit-taxonomies` | `true` | Write `data/taxonomies.json` |
| `--emit-authors` | `true` | Write `data/authors.json` |
| `--save-images` | `none` | `none`, `referenced`, or `attached` |
| `--attachment-types` | `gif,jpg,jpeg,png,webp,svg,avif,pdf,mp3,mp4,webm,…` | Extensions to download |
| `--post-folders` | `true` | Each post in its own folder (`slug/index.md`) |
| `--dry-run` | `false` | Skip writes; produce report only |
| `--write-delay` | `0` | Milliseconds between file writes |
| `--wizard` | `true` | Run interactive wizard (skipped when using `--config`) |

---

## Migration report

Every run writes `migration-report.txt` and `migration-report.json`:

- post counts per type
- taxonomy / author counts
- write / skip / fail counts for posts and images
- meta-field summary (frontmatter vs complex vs skipped)
- every Gutenberg block encountered (with counts)
- blocks converted via generic HTML→MD (flagged so you can add handlers)
- every unknown shortcode encountered

---

## Local development

```
git clone <fork>
npm install

# Run against the included synthetic fixture
node app.js --input=test/fixtures --output=test/.out --wizard=false --save-images=none

# Run all tests (unit + both e2e suites)
npm run test:all

# Unit tests only
npm run test:unit

# E2e tests only
npm run test:e2e
```

### Test suites

| Command | What it tests |
|---|---|
| `npm run test:unit` | `src/analyzer.js`, `src/config-generator.js`, `src/config-schema.js` |
| `node test/run.js` | Legacy CLI mode against `test/fixtures/`, compared to `test/output/` golden files |
| `node test/run-config.js` | Config-file mode using `test/fixtures/wetm.config.js`, compared to `test/output-config/` |

The fixture XML (`test/fixtures/export.xml`) exercises: custom post types, custom taxonomies, Yoast SEO meta, WooCommerce meta, ACF reference keys, PHP-serialized arrays, JSON arrays, Gutenberg blocks, shortcodes, and internal link rewriting.
