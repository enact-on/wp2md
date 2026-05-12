// Generates a starter wetm.config.js from analyzer findings.

const SEO_PLUGIN_NAMES = new Set(['yoast', 'rankmath', 'seopress', 'aioseo']);

// Meta key patterns that are handled by dedicated plugins — skip from user rules
const SEO_META_PREFIXES = [
	'_yoast_wpseo_', 'rank_math_', '_seopress_', '_aioseop_', 'aioseo_'
];
const INTERNAL_META_PREFIXES = [
	'_edit_', '_wp_', '_oembed_', '_yoast_indexable_', '_seopress_analysis_'
];
const WC_META_KEYS = new Set([
	'_price', '_sku', '_product_type', '_stock_status', '_regular_price',
	'_sale_price', '_stock', '_downloadable', '_virtual', '_weight',
	'_length', '_width', '_height', '_manage_stock', '_backorders',
	'_sold_individually', '_upsell_ids', '_crosssell_ids',
	'_product_image_gallery', '_purchase_note'
]);

const STANDARD_POST_FOLDERS = { post: 'posts', page: 'pages' };

function isSeoKey(key) {
	return SEO_META_PREFIXES.some((p) => key.startsWith(p));
}

function isInternalKey(key) {
	return INTERNAL_META_PREFIXES.some((p) => key.startsWith(p));
}

function isAcfRefKey(key, sampleValues) {
	return key.startsWith('_') && sampleValues.some((v) => v.startsWith('field_'));
}

// Strip leading underscore(s), convert hyphens/underscores to camelCase
function camelCase(str) {
	return str.replace(/^_+/, '').replace(/[-_](.)/g, (_, c) => c.toUpperCase());
}

function indent(str, spaces) {
	const pad = ' '.repeat(spaces);
	return str.split('\n').map((l) => (l.trim() ? pad + l : l)).join('\n');
}

function postTypeEntry(type, count) {
	const folder = STANDARD_POST_FOLDERS[type] || type.replace(/_/g, '-');
	const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(type) ? type : JSON.stringify(type);
	return `${key}: { enabled: true, folder: ${JSON.stringify(folder)} },  // ${count} post${count !== 1 ? 's' : ''}`;
}

export function generate(findings, inputPath = 'export.xml', { outputDir = 'output' } = {}) {
	const {
		siteUrl, postTypes, taxonomies, metaKeys,
		blocks, shortcodes, detectedPlugins, detectedBuilders
	} = findings;

	const detectedSeoPlugin = detectedPlugins.find((p) => SEO_PLUGIN_NAMES.has(p)) || null;
	const hasWoo = detectedPlugins.includes('woocommerce');

	// Build plugins list: dedupe, keep only what was detected
	const pluginList = ['acf', 'bricks', 'yoast', 'rankmath', 'seopress', 'woocommerce']
		.filter((p) => detectedPlugins.includes(p));
	if (pluginList.length === 0) pluginList.push('acf'); // acf is safe default

	// User-visible meta keys: exclude SEO, internal, WC, and ACF reference keys
	const userMetaKeys = metaKeys
		.filter(({ key, sampleValues }) =>
			!isSeoKey(key) &&
			!isInternalKey(key) &&
			!WC_META_KEYS.has(key) &&
			!isAcfRefKey(key, sampleValues)
		)
		.slice(0, 20);

	// Non-core blocks not already from a detected builder
	const customBlocks = blocks.filter((b) => !b.name.startsWith('core/'));
	const builderNamespaces = new Set(detectedBuilders.map((d) => d + '/'));
	const builderBlocks = customBlocks.filter((b) =>
		[...builderNamespaces].some((ns) => b.name.startsWith(ns))
	);
	const otherCustomBlocks = customBlocks.filter((b) => !builderBlocks.includes(b));

	// ── section builders ───────────────────────────────────────────────────

	const postTypeLines = postTypes.map(({ type, count }) => postTypeEntry(type, count));

	const taxEnabled = ['category', 'post_tag', ...taxonomies];
	const taxList = taxEnabled.map((t) => JSON.stringify(t)).join(', ');

	const taxAliasLines = taxonomies.map((t) =>
		`// ${JSON.stringify(t)}: ${JSON.stringify(camelCase(t))},`
	);

	const metaRuleLines = userMetaKeys.map(({ key, count, sampleValues }) => {
		const raw = sampleValues[0] ?? '';
		const sanitized = raw.replace(/[\r\n]+/g, ' ').replace(/"/g, '\\"');
		const sample = raw ? ` // sample: "${sanitized.slice(0, 50)}"` : '';
		return `// ${JSON.stringify(key)}: { mode: "frontmatter", alias: ${JSON.stringify(camelCase(key))} },  // ${count} use${count !== 1 ? 's' : ''}${sample}`;
	});

	const blockLines = [];
	// Emit wildcard entries for every detected builder (even shortcode-only builders)
	for (const builder of detectedBuilders) {
		const ns = builder;
		const total = blocks.filter((b) => b.name.startsWith(ns + '/')).reduce((s, b) => s + b.count, 0);
		const note = total > 0 ? `${total} use${total !== 1 ? 's' : ''}` : 'detected via content';
		blockLines.push(`// "${ns}/*": "skip",  // ${note} — ${ns} page builder`);
	}
	for (const b of otherCustomBlocks.slice(0, 10)) {
		blockLines.push(`// "${b.name}": "fallback",  // ${b.count} use${b.count !== 1 ? 's' : ''}`);
	}

	const shortcodeLines = shortcodes.slice(0, 10).map(({ name, count }) =>
		`// "${name}": "skip",  // ${count} use${count !== 1 ? 's' : ''}`
	);

	// Per-plugin option lines
	const pluginOptionLines = [];
	if (hasWoo) pluginOptionLines.push('    woocommerce: { productKey: "product" },');
	if (detectedSeoPlugin) {
		pluginOptionLines.push(`    ${detectedSeoPlugin}: { frontmatterKey: "seo" },`);
	}

	const totalPosts = postTypes.reduce((s, t) => s + t.count, 0);
	const postTypeSummary = postTypes.map((t) => `${t.type} (${t.count})`).join(', ');
	const pluginSummary = detectedPlugins.length > 0 ? detectedPlugins.join(', ') : 'none detected';

	return `// wetm.config.js — generated by: wetm init ${inputPath}
// Detected: ${totalPosts} post${totalPosts !== 1 ? 's' : ''} across [${postTypeSummary}]
// Plugins detected: ${pluginSummary}
// Review the commented sections and uncomment what you need.

export default {

  site: {
    url: ${JSON.stringify(siteUrl || 'https://your-site.com')},
    timezone: "utc",  // IANA timezone, e.g. "America/New_York"
  },

  input: ${JSON.stringify(inputPath)},

  output: {
    dir: ${JSON.stringify(outputDir)},
    format: "mdx",       // "md" | "mdx" | "auto"
    dryRun: false,
  },

  posts: {
    statuses: ["publish"],
    postFolders: true,
    prefixDate: false,
    dateFolders: "none", // "none" | "year" | "year-month"
    dateFormat: null,    // Luxon format string; null = ISO 8601
    includeTime: false,
    gutenbergParser: true,
    htmlHandling: "convert", // "convert" (HTML→markdown) | "passthrough" (keep raw HTML)
    filter: null,        // (post) => boolean — return false to exclude a post
  },

  postTypes: {
${indent(postTypeLines.join('\n'), 4)}
  },

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
    authorFormat: "name",  // "name" | "slug" | "object"
    termsFormat: "slug",   // "slug" | "name" | "object"
    maxStringLength: 200,
  },

  // Append custom field values into the post body in sequence.
  // Useful for recipes, FAQs, specs stored as meta instead of blocks.
  contentFields: [
    // { key: "_ingredients", heading: "## Ingredients" },
    // { key: "_faq",         template: (value) => value.map(q => \`**\${q.q}**\\n\${q.a}\`).join("\\n\\n") },
    // { key: "_summary",     heading: "## Summary", position: "prepend" },
  ],

  seo: {
    plugin: ${JSON.stringify(detectedSeoPlugin || 'auto')},
    frontmatterKey: "seo",
    // Override field mappings only if your site uses non-standard meta keys:
    fields: {},
  },

  taxonomies: {
    enabled: [${taxList}],
    aliases: {
${indent(taxAliasLines.join('\n') || '// no custom taxonomies detected', 6)}
    },
    emit: {
      dataFile: true,
      astroCollections: false, // write src/content/[taxonomy]/[slug].json for Astro
    },
  },

  authors: {
    emitDataFile: true,
  },

  images: {
    save: "all",       // "none" | "attached" | "scraped" | "all"
    dir: "images",
    requestDelay: 500,
    skipUrlPatterns: [],
  },

  meta: {
    includePrivate: false,
    deny: [
      "_edit_lock", "_edit_last", "_wp_trash_meta_time",
      "_wp_trash_meta_status", "_pingme", "_encloseme",
    ],
    rules: {
      // mode: "frontmatter" | "complex" (MDX export const) | "skip"
${indent(metaRuleLines.join('\n') || '// no user-defined meta rules detected', 6)}
    },
    unknownFallback: "skip",
  },

  shortcodes: {
    unknownFallback: "skip",
    handlers: {
${indent(shortcodeLines.join('\n') || '// no custom shortcodes detected', 6)}
    },
  },

  blocks: {
    handlers: {
      // Wildcards: "elementor/*": "skip"
${indent(blockLines.join('\n') || '// no custom blocks detected', 6)}
    },
  },

  hooks: {
    transformPost:        null,  // (post) => post
    transformContent:     null,  // (content, post) => string
    transformFrontmatter: null,  // (frontmatter, post) => object
    transformImageUrl:    null,  // (url, post) => url | null
  },

  links: {
    rewrite: true,
    redirects: {
      emit: true,
      path: "_redirects",
      format: "netlify",  // "netlify" | "next" | "vercel" | "apache" | "nginx"
    },
  },

  plugins: {
    enabled: ${JSON.stringify(pluginList)},
${pluginOptionLines.join('\n')}
    custom: [
      // "./plugins/my-plugin.js",
      // {
      //   name: "my-plugin",
      //   onMeta({ key, value, post }) {},
      //   onShortcode({ name, attrs, inner }) {},
      //   onBlock({ block, depth }) {},
      //   onContent({ content, post }) { return content; },
      //   onFrontmatter({ frontmatter, post }) { return frontmatter; },
      //   onPost({ post }) { return post; },
      // }
    ],
  },
};
`;
}
