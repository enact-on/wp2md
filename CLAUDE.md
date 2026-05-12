# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run all tests (unit + both e2e suites)
npm run test:all

# Unit tests only (src/analyzer.js, src/config-generator.js, src/config-schema.js)
npm run test:unit

# E2e tests only (CLI mode + config-file mode)
npm run test:e2e

# Run a single unit test file
node --test test/unit/config-schema.test.js

# Run against the included synthetic fixture
node app.js --input=test/fixtures --output=test/.out --wizard=false --save-images=none

# Generate a starter config from an XML export
node app.js init export.xml
```

Node >= 20.5.0 required. ESM project (`"type": "module"`). No build step.

## Maintenance rules

- **Update `README.md`** whenever you add or change a user-facing feature: new config keys, new CLI flags, new built-in plugin behavior, new hook signatures, new redirect formats, new output layout. The README is the primary user reference.
- **Update `test/fixtures/wetm.config.js`** whenever you add, rename, or remove a config key. That file exercises the full config-file pipeline in the e2e tests and doubles as a comprehensive working example.
- **Update `src/config-schema.js`** AND `src/config-generator.js` in the same change when adding a new top-level config section. `config-schema.js` translates the new key into `shared.config`; `config-generator.js` emits it into generated `wetm.config.*.js` files.

## Architecture

### Entry point and command dispatch

`app.js` dispatches to either `src/commands/init.js` (the `wetm init` scanner) or `src/commands/convert.js` (the full conversion pipeline). Stripping `"init"` from `process.argv` before delegating is intentional — `init.js` only reads `process.argv[2]`.

### Conversion pipeline (`src/commands/convert.js`)

1. **`applyConfigSchema()`** — loads `wetm.config.js` if present; translates the rich nested config object into the flat `shared.config` store that every module reads from. If no config file exists, this is a no-op and the legacy wizard/CLI path runs.
2. **`intake.getConfig()`** — parses CLI flags via Commander; runs the interactive wizard if needed; merges CLI answers, wizard answers, and config-file values. Priority: CLI > wizard > config file > defaults. When a new-format config is present, Commander defaults are excluded from the merge so the config file wins.
3. **`loadPlugins()`** — loads built-in plugin packs (`acf`, `bricks`, `yoast`, `rankmath`, `seopress`, `woocommerce`) plus any user-supplied plugins. `blockHandlers` and `shortcodeHandlers` from config are wrapped into synthetic plugins here.
4. **`parser.parseAllInputs()`** — resolves glob/dir input paths, reads XML with `xml2js`, dedupes posts by `post_id` across files, collects authors and taxonomy terms from every channel.
5. **`parser.buildPosts()`** — filters to selected post types; runs `meta.processMeta()` per post (PHP-unserialize → JSON → classify as frontmatter/complex/skip), with plugin `onMeta` hooks running first.
6. **Link rewriting** — builds a `post_id → new path` map, rewrites internal links in raw HTML before content conversion.
7. **`parser.finalizePost()`** — runs Gutenberg/turndown translation, merges frontmatter, applies `contentFields`, fires all `onFrontmatter`, `onContent`, `onPost`, and `hooks.*` callbacks.
8. **`writer.writeFilesPromise()`** — writes Markdown/MDX files, taxonomy/author JSON, redirect files, and optionally downloads images.

### `wetm init` pipeline (`src/commands/init.js`)

Calls `analyze()` → `generate()` and writes `input/wetm.config.<slug>.js`. The config filename is derived from the XML filename (e.g. `parkingmd.WordPress.2026-05-12.xml` → `wetm.config.parkingmd.js`). Refuses to overwrite an existing config. Auto-discovers a single XML in `input/` when no path argument is given.

### Global state (`src/shared.js`)

Single mutable `config` object and `postTypeConfig` object. All pipeline stages read from and write to `config` directly. Private/computed keys are prefixed with `_`:
- `_wetmConfig` — raw new-format config object (set by `config-schema.js`)
- `_configFile` — `{ path, value }` of the loaded config file
- `_perTypeMetaRules` — per-post-type meta rule overrides keyed by type
- `_perTypeFrontmatterFields` — per-post-type frontmatter field lists
- `_customPlugins` — inline/path custom plugins from config
- `_authorRegistry` — array of author objects used by frontmatter getters

### Config formats

Two config formats coexist:

- **New format** — nested keys (`postTypes`, `meta`, `hooks`, etc.) in `wetm.config.js`. Detected by `isNewFormat()` in `src/config-schema.js`, which translates it into the flat `shared.config` before CLI/wizard runs. When this is active `shared.config._wetmConfig` is set and the wizard is suppressed.
- **Legacy format** — flat keys matching CLI option names, loaded by `src/intake.js` and merged beneath CLI answers.

CLI flags always win over config-file values. Config-file values win over wizard defaults.

### Meta pipeline (`src/meta.js`)

Raw `wp:postmeta` entries decoded (PHP unserialize → JSON → scalar coercion), then classified as `frontmatter`, `complex` (MDX `export const`), or `skip`. Classification order:

1. Plugin `onMeta` hooks pre-process; keys added to `consumed` set are skipped in the classifier.
2. Explicit per-key rules from `meta.rules` — exact match beats wildcard glob (`'review_*'`).
3. `unknownFallback` controls remaining keys: `null` = auto-classify by value shape, `'skip'` drops unconfigured keys, `'frontmatter'` / `'complex'` force-classify all.

Scalar / flat arrays of scalars → `frontmatter`. Nested objects/arrays → `complex` MDX `export const` block. Strings longer than `maxFrontmatterStringLength` (default 200) also go to `complex`.

### Plugin system (`src/plugins/index.js`)

Plugins are plain objects: `{ name, onMeta?, onShortcode?, onBlock?, onContent?, onFrontmatter?, onPost? }`. Built-in plugins are in `src/plugins/`. User plugins can be file paths or inline objects. Loading order: built-ins → config `blockHandlers` synthetic plugin → config `shortcodeHandlers` synthetic plugin → custom plugins.

**Adding a new built-in plugin:** create `src/plugins/<name>.js` exporting `plugin`, add it to `BUILTIN` in `src/plugins/index.js`, add the name to the default `plugins` list in `src/config-schema.js`.

### Content translation (`src/translator.js`, `src/gutenberg.js`)

`getPostContent()` applies shortcodes first (before turndown, so brackets aren't escaped), then:

- If content contains `<!-- wp:` → `renderBlocks()` walks the Gutenberg AST via `@wordpress/block-serialization-default-parser`. Each block goes: plugin `onBlock` handlers → built-in renderers → turndown fallback over `innerHTML`.
- Otherwise → strip block comments → `htmlToMarkdown()` via turndown.

MDX output: `escapeForMdx()` escapes `{` and `}` outside fenced/inline code regions. A block handler returning `{ text, isJsx: true }` promotes the post's extension to `.mdx`.

### Data layer (`src/data.js`)

`Data` class wraps the `xml2js` node tree. All XML access goes through it. Key methods:
- `childValue(prop)` — throws if missing
- `optionalChildValue(prop)` — returns `undefined` if missing (safe for any optional element)
- `postMeta(key)` — looks up a single `<wp:postmeta>` value by key
- `postMetaPairs()` — all postmeta as `{ key, value }` pairs
- `terms(domain)` — all `<category domain="...">` terms for a taxonomy

Never access `xml2js` node objects directly — always use `Data` methods.

### Frontmatter getters (`src/frontmatter.js`)

Each exported function receives a `post` object and returns the value (or `undefined` to omit). The `frontmatterFields` config array lists which getters to call per post. Dotted aliases (e.g. `'title:seo.title'`) create nested objects via `setDotted()` in `meta.js`. Custom computed fields can be added via `frontmatter.custom` in config.

### Test suites

| File | What it covers |
|---|---|
| `test/unit/analyzer.test.js` | `src/analyzer.js` — plugin/builder detection, meta key extraction |
| `test/unit/config-generator.test.js` | `src/config-generator.js` — generated config content |
| `test/unit/config-schema.test.js` | `src/config-schema.js` — new→flat translation, `normalizeMetaRules` |
| `test/run.js` | CLI/wizard mode against `test/fixtures/export.xml`, golden files in `test/output/` |
| `test/run-config.js` | Config-file mode using `test/fixtures/wetm.config.js`, golden files in `test/output-config/` |

The fixture XML (`test/fixtures/export.xml`) exercises: custom post types, custom taxonomies, Yoast SEO meta, WooCommerce meta, ACF reference keys, PHP-serialized arrays, JSON arrays, Gutenberg blocks, shortcodes, and internal link rewriting. When adding new pipeline features, extend the fixture XML and update golden output files.

## File map — what to edit for each concern

| Task | File(s) to edit |
|---|---|
| Add/change a new-format config key | `src/config-schema.js` (translate), `src/config-generator.js` (emit in generated config), `test/fixtures/wetm.config.js` (cover in tests), `README.md` |
| Add/change a CLI flag | `src/questions.js` (question definition), `src/normalizers.js` if new type, `README.md` |
| Add a new frontmatter field (built-in) | `src/frontmatter.js` (getter), add to `defaultFrontmatterFields()` in `src/config-schema.js` if it should be on by default |
| Add/change meta classification logic | `src/meta.js` |
| Add/change Gutenberg block rendering | `src/gutenberg.js` |
| Add/change shortcode handling | `src/shortcodes.js` |
| Add a new built-in plugin | `src/plugins/<name>.js`, register in `src/plugins/index.js` `BUILTIN` map and default list in `src/config-schema.js` |
| Change XML parsing / data access | `src/data.js` |
| Change how files/redirects/taxonomies are written | `src/writer.js` |
| Change internal link rewriting or redirect format | `src/links.js` |
| Change migration report fields or output | `src/report.js` |
| Change `wetm init` output logic | `src/commands/init.js`, `src/analyzer.js`, `src/config-generator.js` |
| Change MDX escaping or `export const` serialization | `src/mdx.js` |
| Change YAML frontmatter serialization | `src/yaml.js` |

## Code quality rules

- **No mutation outside the pipeline.** `shared.config` is a write-once-per-run store. Modules read from it; only `config-schema.js` and `intake.js` should write to it (except `_`-prefixed computed keys set during parsing).
- **`optionalChildValue` over `childValue` for any optional XML field.** `childValue` throws; only use it when absence is truly a bug.
- **Plugin hooks must never throw to the caller.** All `plugin.on*` calls in `parser.js` are wrapped in `try/catch` with a `console.warn`. Keep this pattern.
- **Exact meta key rules beat glob patterns.** When adding a new `findRule` caller, always preserve this precedence — users depend on it.
- **`decodeValue` handles all meta decoding.** Don't call `php-unserialize` directly from outside `src/meta.js`. The decode chain (PHP unserialize → JSON → scalar coercion) is centralized there.
- **ESM only.** No `require()`. Every new file must use `import`/`export`.
- **New config keys default defensively.** Any new key read from `shared.config` should use `?? fallback` at the read site so old config files without the key don't crash.
- **Report every unknown block/shortcode.** When adding a new handler path, make sure unhandled cases still flow through `report.unknownShortcodes` / `report.blocksViaFallback`.
