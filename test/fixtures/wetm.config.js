// Test fixture config — exercises config-driven pipeline features.
// Uses the same export.xml but demonstrates new config capabilities.

export default {
	site: {
		url: 'https://example.com',
		timezone: 'utc',
	},

	input: 'test/fixtures/export.xml',

	output: {
		dir: 'test/.tmp-config',
		format: 'mdx',
		dryRun: false,
	},

	posts: {
		statuses: ['publish'],
		postFolders: true,
		prefixDate: false,
		dateFolders: 'none',
		gutenbergParser: true,
	},

	postTypes: {
		post:       { enabled: true, folder: 'posts' },
		page:       { enabled: true, folder: 'pages' },
		case_study: { enabled: true, folder: 'case-studies' },
		product:    { enabled: true, folder: 'products' },
	},

	frontmatter: {
		fields: ['title', 'date', 'slug', 'categories', 'tags', 'author', 'excerpt'],
		aliases: {},
		custom: {
			// Custom computed field
			postLength: (post) => post.content ? post.content.length : 0,
		},
		authorFormat: 'name',
		termsFormat: 'slug',
		maxStringLength: 200,
	},

	// contentFields: append a custom meta field into the body
	contentFields: [
		{ key: 'client_name', heading: '## Client' },
	],

	seo: {
		plugin: 'yoast',
		frontmatterKey: 'seo',
		fields: {},
	},

	taxonomies: {
		enabled: ['category', 'post_tag', 'industry'],
		aliases: {},
		emit: {
			dataFile: true,
			astroCollections: false,
		},
	},

	authors: {
		emitDataFile: true,
	},

	images: {
		save: 'none',
		dir: 'images',
		requestDelay: 0,
		skipUrlPatterns: [],
	},

	meta: {
		includePrivate: false,
		deny: ['_edit_lock', '_edit_last', '_wp_trash_meta_time', '_wp_trash_meta_status'],
		rules: {
			// WooCommerce price as number
			_price: { mode: 'frontmatter', alias: 'price', transform: Number },
			_sku:   { mode: 'frontmatter', alias: 'sku' },
		},
		unknownFallback: 'skip',
	},

	shortcodes: {
		unknownFallback: 'skip',
		handlers: {},
	},

	blocks: {
		handlers: {},
	},

	hooks: {
		transformPost: null,
		transformContent: null,
		transformFrontmatter: null,
		transformImageUrl: null,
	},

	links: {
		rewrite: true,
		redirects: {
			emit: true,
			path: '_redirects',
			format: 'netlify',
		},
	},

	plugins: {
		enabled: ['acf', 'yoast', 'woocommerce'],
		woocommerce: { productKey: 'product' },
		yoast: { frontmatterKey: 'seo' },
		custom: [],
	},
};
