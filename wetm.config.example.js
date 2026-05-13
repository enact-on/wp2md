// wetm.config.example.js
// Full reference config showing every option the new schema supports.
// Copy to wetm.config.<site>.js and edit; or run: node app.js init export.xml

export default {

  // ── Site ──────────────────────────────────────────────────────────────────
  site: {
    url: "https://your-site.com",
    timezone: "utc",           // IANA timezone, e.g. "America/New_York"
  },

  input: "export.xml",         // file, directory, or glob

  // ── Output ────────────────────────────────────────────────────────────────
  output: {
    dir: "output/site",        // named per-site so multiple exports don't collide
    format: "mdx",             // "md" | "mdx" | "auto"
    dryRun: false,
  },

  // ── Posts (global defaults) ───────────────────────────────────────────────
  posts: {
    statuses: ["publish"],
    postFolders: true,
    prefixDate: false,
    dateFolders: "none",       // "none" | "year" | "year-month"
    dateFormat: null,          // Luxon format string; null = ISO 8601
    includeTime: false,
    gutenbergParser: true,
    htmlHandling: "convert",   // "convert" (HTML→markdown) | "passthrough" (keep raw HTML)
    filter: null,              // (post) => boolean — return false to exclude
  },

  // ── Post types ────────────────────────────────────────────────────────────
  // enabled: false skips the type entirely.
  // Disable WordPress/plugin internal types — they aren't real content.
  postTypes: {
    post:              { enabled: true,  folder: "posts" },
    page:              { enabled: true,  folder: "pages" },
    "custom-type":     { enabled: true,  folder: "custom" },

    // WordPress / plugin-internal — disable these
    "acf-field":       { enabled: false },
    "acf-field-group": { enabled: false },
    "acf-post-type":   { enabled: false },
    "acf-taxonomy":    { enabled: false },
    "acf-ui-options-page": { enabled: false },
    bricks_template:   { enabled: false },  // Bricks builder layout templates
    "seopress_404":    { enabled: false },  // SEOPress 404 redirect log
    seopress_schemas:  { enabled: false },  // SEOPress schema objects
  },

  // ── Frontmatter ───────────────────────────────────────────────────────────
  frontmatter: {
    fields: [
      "title", "date", "modified", "slug", "draft",
      "categories", "tags", "coverImage", "author", "excerpt",
    ],
    aliases: {
      // coverImage: "featuredImage",
      // modified: "updatedAt",
    },
    custom: {
      // readingTime: (post) => Math.ceil(post.wordCount / 200),
    },
    authorFormat: "name",      // "name" | "slug" | "object"
    termsFormat: "slug",       // "slug" | "name" | "object"
    maxStringLength: 200,
  },

  // ── Content fields ────────────────────────────────────────────────────────
  // Append custom field values into the post body (e.g. FAQs, ingredients).
  contentFields: [
    // Simple: key + optional heading (value appended as-is)
    // { key: "faq",      heading: "## FAQ" },
    // { key: "_summary", heading: "## Summary", position: "prepend" },

    // Template function: convert the raw value before inserting
    // { key: "_faq", template: (value) => value.map(q => `**${q.q}**\n${q.a}`).join("\n\n") },

    // HTML meta field → strip to markdown (second arg is the post object)
    // { key: "review_content", template: (html) => html.replace(/<br\s*\/?>/gi, '\n').replace(/<p[^>]*>/gi, '').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim() },

    // HTML <ul> list → markdown bullet list with heading
    // { key: "key_takeaways", position: "prepend", template: (html) => { const items = []; html.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => items.push('- ' + t.replace(/<[^>]+>/g,'').trim())); return items.length ? '## Key Takeaways\n\n' + items.join('\n') : ''; } },
  ],

  // ── SEO ───────────────────────────────────────────────────────────────────
  // Detected plugins: yoast | rankmath | seopress | aioseo | auto
  seo: {
    plugin: "seopress",
    frontmatterKey: "seo",
    fields: {},                // override field mappings only if site uses non-standard keys
  },

  // ── Taxonomies ────────────────────────────────────────────────────────────
  taxonomies: {
    enabled: ["category", "post_tag"],  // add custom ones here
    aliases: {
      // "reviewer-state": "reviewerState",
    },
    emit: {
      dataFile: true,
      astroCollections: false,  // writes src/content/[taxonomy]/[slug].json for Astro
    },
  },

  // ── Authors ───────────────────────────────────────────────────────────────
  authors: {
    emitDataFile: true,
  },

  // ── Images ────────────────────────────────────────────────────────────────
  images: {
    save: "all",               // "none" | "attached" | "scraped" | "all"
    dir: "images",
    requestDelay: 500,
    skipUrlPatterns: [],
    // transformUrl: (url, post) => url,
    emitImageMap: false,       // true → writes data/image-map.json: { "id": "url", ... }
  },

  // ── Meta (custom fields) ──────────────────────────────────────────────────
  meta: {
    includePrivate: false,
    deny: [
      "_edit_lock", "_edit_last", "_wp_trash_meta_time",
      "_wp_trash_meta_status", "_pingme", "_encloseme",
      // Bricks builder internals — skip unless you need them
      "_bricks_page_content_2", "_bricks_page_header_2",
      "_bricks_template_type", "_bricks_editor_mode",
      "_bricks_template_settings",
    ],
    rules: {
      // mode: "frontmatter" | "complex" (MDX export const) | "skip"
      //
      // Exact key:
      // "review_rating":   { mode: "frontmatter", alias: "rating" },
      // "review_content":  "skip",  // raw HTML — use contentFields instead
      //
      // Wildcard patterns — '*' matches any characters; exact keys win over wildcards:
      // "review_*":  { mode: "frontmatter" },  // pulls review_rating, review_platform_image, etc.
      // "reviewer_*": { mode: "frontmatter" }, // reviewer_image, reviewer_name, etc.
      //
      // Transform:
      // "_price": { mode: "frontmatter", alias: "price", transform: (v) => Number(v) },
    },
    unknownFallback: "skip",
  },

  // ── Shortcodes ────────────────────────────────────────────────────────────
  shortcodes: {
    unknownFallback: "skip",
    handlers: {
      // "my-shortcode": (attrs, inner) => `...`,
      // "data-field": "skip",
    },
  },

  // ── Blocks ────────────────────────────────────────────────────────────────
  blocks: {
    handlers: {
      // Wildcards: "namespace/*" matches any block in that namespace
      // "bricks/*": "skip",       // Bricks builder blocks (rare in content areas)
      // "themeisle-blocks/advanced-heading": "html",
      // "my-theme/hero": (block) => `# ${block.attrs.title ?? ""}`,
    },
  },

  // ── Hooks ─────────────────────────────────────────────────────────────────
  hooks: {
    transformPost:        null,  // (post) => post
    transformContent:     null,  // (content, post) => string
    transformFrontmatter: null,  // (frontmatter, post) => object
    transformImageUrl:    null,  // (url, post) => url | null
  },

  // ── Links ─────────────────────────────────────────────────────────────────
  links: {
    rewrite: true,
    redirects: {
      emit: true,
      path: "_redirects",
      format: "netlify",   // "netlify" | "next" | "vercel" | "apache" | "nginx"
    },
  },

  // ── Plugins ───────────────────────────────────────────────────────────────
  plugins: {
    enabled: ["acf", "seopress"],
    seopress: { frontmatterKey: "seo" },
    // woocommerce: { productKey: "product" },
    custom: [
      // Path to a custom plugin file:
      // "./plugins/my-plugin.js",
      //
      // Or inline:
      // {
      //   name: "my-plugin",
      //   onMeta({ metas, frontmatter, consumed }) {},
      //   onShortcode({ name, attrs, inner }) {},
      //   onBlock({ block, depth }) {},
      //   onContent({ content, post }) { return content; },
      //   onFrontmatter({ frontmatter, post }) { return frontmatter; },
      //   onPost({ post }) { return post; },
      // },
    ],
  },
};
