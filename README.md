# wordpress-export-to-markdown

Converts a WordPress export XML file (or many) into Markdown / MDX files, with **full custom post type, custom taxonomy, custom field, link, and media handling**. Built for migrating real, messy, multi-site WordPress estates onto Astro, Eleventy, Hugo, or Gatsby.

> Originally by Will Boyd. v4 is a near-rewrite focused on production-grade migrations across many client sites.

## What v4 adds

- **Interactive custom post type selection** — auto-detects every `post_type` in the XML, asks which ones to export, supports per-type folder renames.
- **Auto-detected custom taxonomies** — every taxonomy beyond `category`/`post_tag` is surfaced and emitted into frontmatter; the term registry (with hierarchy + descriptions) is written to `data/taxonomies.json` for Astro landing pages.
- **Custom field pipeline** — every `wp:postmeta` is decoded (PHP-serialized blobs, JSON, scalars), classified, and emitted as either:
	- a frontmatter scalar / array (simple values), or
	- an MDX `export const fieldName = {...};` block at the top of the file (nested objects, arrays, repeaters, long strings).
- **MDX output** — defaults to `.mdx` (or `auto` to pick `.mdx` only when complex fields are present); MDX-safe escaping is applied to body content.
- **Plugin packs** for **ACF**, **Yoast**, **RankMath**, **WooCommerce** — drop SEO meta into a tidy `seo: {}` object, product meta into `product: {}`, ACF reference noise is dropped, and you can add your own with `wetm.config.js`.
- **Link rewriting** — internal `<a>` and `<img>` URLs that point at any post in scope get rewritten to their new relative routes (`/posts/<slug>/`, `/case-studies/<slug>/`, …). A `_redirects` file (Netlify / Cloudflare format) is emitted with `301`s for every old permalink.
- **Multi-file / multi-GB-friendly input** — `--input` accepts a single file, a directory, or a glob; items are deduped by `post_id`.
- **Real YAML emitter** — uses `yaml`, supports nested objects, multiline strings, unicode, the lot. No more hand-rolled escaping bugs.
- **Expanded media** — picks up `srcset`, `<picture>`/`<source>`, lazy-load attributes, CSS `background-image`, and any attachment file extension you list (PDF, MP4, SVG, ZIP, …).
- **Authors registry** — `data/authors.json` written from `<wp:author>` records.
- **Gutenberg block + shortcode tracking** — every block name and unknown shortcode encountered is listed in `migration-report.txt`/`.json` so you know what to map next.
- **Config file API** — drop a `wetm.config.{js,mjs,json}` next to your CLI invocation to pin per-site rules and register custom plugins.
- **Dry run** — `--dry-run=true` produces only the migration report; great for client estimates.
- **Resilient image downloads** — automatic retries with exponential backoff.

## Quick start

```
npx wordpress-export-to-markdown
```

The wizard will:

1. Ask for your XML file / directory / glob.
2. Discover post types and ask which to export.
3. Discover custom taxonomies and ask which to include.
4. Ask the standard image / folder / format questions.

Or skip the wizard entirely:

```
node app.js --wizard=false \
	--input=exports/ \
	--output=output \
	--post-types=post,page,case_study,product \
	--taxonomies=industry \
	--output-format=auto \
	--site-url=https://oldsite.com
```

## Output layout

```
output/
├── posts/
│   └── hello-world/
│       └── index.md
├── case-studies/                 ← renamed via wetm.config.js
│   └── acme/
│       └── index.mdx             ← .mdx because it has complex fields
├── pages/
├── data/
│   ├── authors.json
│   └── taxonomies.json
├── _redirects                    ← old → new permalinks (301)
├── migration-report.txt
└── migration-report.json
```

## Custom field handling, in detail

Given this in the export:

```xml
<wp:postmeta>
	<wp:meta_key>client_name</wp:meta_key>
	<wp:meta_value><![CDATA[Acme Healthcare]]></wp:meta_value>
</wp:postmeta>
<wp:postmeta>
	<wp:meta_key>specifications</wp:meta_key>
	<wp:meta_value><![CDATA[a:3:{s:10:"dimensions";a:2:{s:5:"width";i:12;s:6:"height";i:8;}s:8:"features";a:3:{i:0;s:1:"a";i:1;s:1:"b";i:2;s:1:"c";}s:8:"in_stock";b:1;}]]></wp:meta_value>
</wp:postmeta>
```

You get this `.mdx` out:

```mdx
---
client_name: "Acme Healthcare"
title: "Acme Healthcare Case Study"
industry:
  - "healthcare"
---

export const specifications = {
  dimensions: {
    width: 12,
    height: 8
  },
  features: ["a", "b", "c"],
  in_stock: true
};

The customer has **specifications** below.
```

Override the classification per-key:

```
--meta-rules=price:frontmatter,gallery:complex,_internal:skip,seo_title:frontmatter:seo.title
```

Format: `key:mode[:alias]`. `mode` is one of `frontmatter`, `complex`, or `skip`. The optional alias supports dotted nesting in frontmatter.

## Plugin API

Drop a `wetm.config.js` in your project root:

```js
export default {
	postTypeConfig: {
		case_study: { folder: 'case-studies' }   // rename output folder
	},
	plugins: [
		{
			name: 'acme-extras',
			onMeta({ metas, frontmatter, exports, consumed }) {
				// custom logic. mutate frontmatter / push to exports / mark consumed.
			},
			onShortcode({ name, attrs, inner }) {
				if (name === 'pricing-table') {
					return `<PricingTable plan="${attrs.plan}" />`;
				}
			}
		}
	]
};
```

Built-in plugins: `acf`, `yoast`, `rankmath`, `woocommerce` (enabled by default; disable via `--plugins=...`).

## All CLI options

Run `node app.js --help` for the full list. The most useful additions over v3:

| Option | Default | Purpose |
|---|---|---|
| `--input` | `export.xml` | File, directory, or glob |
| `--output-format` | `mdx` | `mdx`, `md`, or `auto` |
| `--post-types` | _ask_ | Which post types to include |
| `--taxonomies` | _all_ | Which custom taxonomies to include |
| `--meta-rules` | _empty_ | Per-key meta classification |
| `--meta-deny` | _empty_ | Postmeta keys to drop outright |
| `--include-private-meta` | `false` | Include underscore-prefixed meta |
| `--max-frontmatter-string-length` | `200` | Long strings move to MDX export blocks |
| `--plugins` | `acf,yoast,rankmath,woocommerce` | Built-in plugin packs |
| `--site-url` | _from XML_ | Used for link rewriting |
| `--rewrite-links` | `true` | Rewrite internal post-to-post links |
| `--emit-redirects` | `true` | Write `_redirects` |
| `--emit-taxonomies` | `true` | Write `data/taxonomies.json` |
| `--emit-authors` | `true` | Write `data/authors.json` |
| `--attachment-types` | `gif,jpg,jpeg,png,webp,svg,avif,pdf,mp3,mp4,webm,doc,docx,xls,xlsx,zip` | Attachment file types to download |
| `--config` | _auto_ | Explicit config file path |
| `--dry-run` | `false` | Skip writes; report only |

## Migration report

Every run writes `migration-report.txt` and `migration-report.json` containing:

- post counts per type
- taxonomy / author counts
- write / skip / fail counts for posts and images
- meta-field summary (frontmatter vs complex vs skipped)
- every Gutenberg block encountered (so you can map the unknown ones to JSX)
- every unknown shortcode encountered (so you can add a handler)

## Local development

```
git clone <fork>
npm install
node app.js --input=test/fixtures/export.xml --output=test/output --wizard=false --save-images=none
```

The included `test/fixtures/export.xml` exercises custom post types, custom taxonomies, ACF references, Yoast meta, WooCommerce meta, PHP-serialized arrays, JSON arrays, internal links, and Gutenberg blocks.
