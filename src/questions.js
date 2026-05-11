import * as inquirer from '@inquirer/prompts';

export function load() {
	// questions with a description are displayed in command line help
	// questions with a prompt are included in the wizard (if not set on the command line)
	return [
		{
			name: 'input',
			type: 'string',
			description: 'Path to WordPress export file, directory, or glob',
			default: 'export.xml',
			prompt: inquirer.input
		},
		{
			name: 'post-folders',
			type: 'boolean',
			description: 'Put each post into its own folder',
			default: true,
			choices: [
				{ name: 'Yes', value: true },
				{ name: 'No', value: false }
			],
			isPathQuestion: true,
			prompt: inquirer.select
		},
		{
			name: 'prefix-date',
			type: 'boolean',
			description: 'Add date prefix to posts',
			default: false,
			choices: [
				{ name: 'Yes', value: true },
				{ name: 'No', value: false }
			],
			isPathQuestion: true,
			prompt: inquirer.select
		},
		{
			name: 'date-folders',
			type: 'choice',
			description: 'Organize posts into date folders',
			default: 'none',
			choices: [
				{ name: 'Year folders', value: 'year' },
				{ name: 'Year and month folders', value: 'year-month' },
				{ name: 'No', value: 'none' }
			],
			isPathQuestion: true,
			prompt: inquirer.select
		},
		{
			name: 'save-images',
			type: 'choice',
			description: 'Save images',
			default: 'all',
			choices: [
				{ name: 'Images attached to posts', value: 'attached' },
				{ name: 'Images scraped from post body content', value: 'scraped' },
				{ name: 'All Images', value: 'all' },
				{ name: 'No', value: 'none' }
			],
			prompt: inquirer.select
		},
		{
			name: 'output-format',
			type: 'choice',
			description: 'Output file format',
			default: 'mdx',
			choices: [
				{ name: 'MDX (recommended for Astro)', value: 'mdx' },
				{ name: 'Markdown', value: 'md' },
				{ name: 'Auto (mdx when post has complex custom fields, md otherwise)', value: 'auto' }
			],
			prompt: inquirer.select
		},
		{
			name: 'wizard',
			type: 'boolean',
			description: 'Use wizard',
			default: true
		},
		{
			name: 'output',
			type: 'string',
			description: 'Path to output folder',
			default: 'output'
		},
		{
			name: 'config',
			type: 'string',
			description: 'Path to a wetm.config.{js,mjs,json} file',
			default: ''
		},
		{
			name: 'frontmatter-fields',
			type: 'list',
			description: 'Built-in frontmatter fields. Available: author, authorSlug, categories, commentStatus, coverImage, date, draft, excerpt, id, menuOrder, modified, parent, password, permalink, pingStatus, postFormat, slug, status, sticky, tags, taxonomies, title, type. Append :alias to rename.',
			default: 'title,date,modified,categories,tags,coverImage,draft,author,slug,type,excerpt'
		},
		{
			name: 'author-as-object',
			type: 'boolean',
			description: 'Emit the author field as a {username, displayName, email, ...} object instead of the display name string',
			default: false
		},
		{
			name: 'terms-as-objects',
			type: 'boolean',
			description: 'Emit category/tag/taxonomy terms as {slug, name} objects instead of slugs',
			default: false
		},
		{
			name: 'post-types',
			type: 'list',
			description: 'Comma-separated list of post types to include (empty = ask in wizard / include all)',
			default: ''
		},
		{
			name: 'taxonomies',
			type: 'list',
			description: 'Comma-separated list of custom taxonomies to include (empty = auto-detect all)',
			default: ''
		},
		{
			name: 'meta-rules',
			type: 'list',
			description: 'Per-key meta rules: key:mode[:alias]. mode=frontmatter|complex|skip',
			default: ''
		},
		{
			name: 'meta-deny',
			type: 'list',
			description: 'Comma-separated list of postmeta keys to skip outright',
			default: ''
		},
		{
			name: 'include-private-meta',
			type: 'boolean',
			description: 'Include postmeta keys that start with underscore',
			default: false
		},
		{
			name: 'max-frontmatter-string-length',
			type: 'integer',
			description: 'Strings longer than this are emitted as MDX export blocks instead of frontmatter',
			default: 200
		},
		{
			name: 'plugins',
			type: 'list',
			description: 'Comma-separated list of plugins to enable',
			default: 'acf,yoast,rankmath,seopress,woocommerce'
		},
		{
			name: 'site-url',
			type: 'string',
			description: 'Original site URL (used for internal link rewriting)',
			default: ''
		},
		{
			name: 'rewrite-links',
			type: 'boolean',
			description: 'Rewrite internal post-to-post links to new relative routes',
			default: true
		},
		{
			name: 'emit-redirects',
			type: 'boolean',
			description: 'Emit a _redirects file mapping old permalinks to new routes',
			default: true
		},
		{
			name: 'emit-taxonomies',
			type: 'boolean',
			description: 'Emit taxonomies/<tax>.json data files',
			default: true
		},
		{
			name: 'emit-authors',
			type: 'boolean',
			description: 'Emit authors.json data file',
			default: true
		},
		{
			name: 'gutenberg-parser',
			type: 'boolean',
			description: 'Use the official WordPress block parser for richer Gutenberg block handling',
			default: true
		},
		{
			name: 'attachment-types',
			type: 'list',
			description: 'File extensions to download as attachments',
			default: 'gif,jpg,jpeg,png,webp,svg,avif,pdf,mp3,mp4,webm,doc,docx,xls,xlsx,zip'
		},
		{
			name: 'request-delay',
			type: 'integer',
			description: 'Delay between image file requests',
			default: 500
		},
		{
			name: 'write-delay',
			type: 'integer',
			description: 'Delay between writing markdown files',
			default: 25
		},
		{
			name: 'timezone',
			type: 'string',
			description: 'Timezone to apply to date',
			default: 'utc'
		},
		{
			name: 'include-time',
			type: 'boolean',
			description: 'Include time with frontmatter date',
			default: false
		},
		{
			name: 'date-format',
			type: 'string',
			description: 'Frontmatter date format string',
			default: ''
		},
		{
			name: 'quote-date',
			type: 'boolean',
			description: 'Wrap frontmatter date in quotes',
			default: false
		},
		{
			name: 'strict-ssl',
			type: 'boolean',
			description: 'Use strict SSL',
			default: true
		},
		{
			name: 'dry-run',
			type: 'boolean',
			description: 'Skip writing files; produce a migration report only',
			default: false
		}
	];
}
