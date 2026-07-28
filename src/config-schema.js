// Loads wetm.config.js (new format) and translates it into the flat
// shared.config object that the rest of the pipeline reads.
//
// Falls back to a no-op if no config file is found — the legacy CLI/wizard
// path then takes over in intake.js.

import * as shared from './shared.js';
import { loadConfigFile } from './config-file.js';

const SEO_PLUGIN_NAMES = new Set(['yoast', 'rankmath', 'seopress', 'aioseo']);

// Keys that signal this is a "new-format" config (has nested structure)
const NEW_FORMAT_KEYS = new Set([
	'site', 'posts', 'postTypes', 'frontmatter', 'contentFields',
	'seo', 'taxonomies', 'images', 'meta', 'shortcodes', 'blocks', 'hooks'
]);

function isNewFormat(cfg) {
	return Object.keys(cfg).some((k) => NEW_FORMAT_KEYS.has(k));
}

export async function applyConfigSchema() {
	// Respect --config CLI flag before Commander has parsed argv.
	// Handles both "--config path" and "--config=path" forms.
	let explicitPath;
	for (const arg of process.argv) {
		if (arg.startsWith('--config=')) {
			explicitPath = arg.slice('--config='.length);
			break;
		}
	}
	if (!explicitPath) {
		const configArgIdx = process.argv.indexOf('--config');
		if (configArgIdx >= 0) explicitPath = process.argv[configArgIdx + 1];
	}

	const configFile = await loadConfigFile(explicitPath).catch(() => null);
	if (!configFile) return;

	const cfg = configFile.value || {};
	if (!isNewFormat(cfg)) return; // legacy format — intake.js will handle it

	translate(cfg);

	// Store the raw config for pipeline features that need it directly
	shared.config._wetmConfig = cfg;
	shared.config._configFile = configFile;
}

function get(obj, ...path) {
	let cur = obj;
	for (const k of path) {
		if (cur == null || typeof cur !== 'object') return undefined;
		cur = cur[k];
	}
	return cur;
}

function def(value, fallback) {
	return value !== undefined ? value : fallback;
}

function translate(cfg) {
	// ── site ──────────────────────────────────────────────────────────────
	if (cfg.site) {
		setIfAbsent('siteUrl',   cfg.site.url);
		setIfAbsent('timezone',  cfg.site.timezone ?? 'utc');
	}

	// ── input / output ────────────────────────────────────────────────────
	if (cfg.input !== undefined) setIfAbsent('input', cfg.input);

	if (cfg.output) {
		setIfAbsent('output',       cfg.output.dir ?? 'output');
		setIfAbsent('outputFormat', cfg.output.format ?? 'mdx');
		setIfAbsent('dryRun',       cfg.output.dryRun ?? false);
	}

	// ── posts (global defaults) ───────────────────────────────────────────
	if (cfg.posts) {
		const p = cfg.posts;
		setIfAbsent('postStatuses',    p.statuses ?? ['publish']);
		setIfAbsent('postFolders',     def(p.postFolders, true));
		setIfAbsent('prefixDate',      def(p.prefixDate, false));
		setIfAbsent('dateFolders',     p.dateFolders ?? 'none');
		setIfAbsent('dateFormat',      p.dateFormat ?? null);
		setIfAbsent('includeTime',     def(p.includeTime, false));
		setIfAbsent('gutenbergParser', def(p.gutenbergParser, true));
		setIfAbsent('htmlHandling',    p.htmlHandling ?? 'convert');
		setIfAbsent('postFilter',      p.filter ?? null);
	}

	// ── postTypes → postTypeConfig + selectedTypes ────────────────────────
	if (cfg.postTypes && typeof cfg.postTypes === 'object') {
		const selectedTypes = [];
		for (const [type, typeConf] of Object.entries(cfg.postTypes)) {
			if (typeConf.enabled === false) continue;
			selectedTypes.push(type);

			// folder name
			if (typeConf.folder) {
				shared.postTypeConfig[type] = {
					...(shared.postTypeConfig[type] || {}),
					folder: typeConf.folder
				};
			}

			// Per-type meta rules are stored for use by processMeta
			if (typeConf.meta?.rules) {
				if (!shared.config._perTypeMetaRules) shared.config._perTypeMetaRules = {};
				shared.config._perTypeMetaRules[type] = normalizeMetaRules(typeConf.meta.rules);
			}

			// Per-type frontmatter fields
			if (typeConf.frontmatter?.fields) {
				if (!shared.config._perTypeFrontmatterFields) shared.config._perTypeFrontmatterFields = {};
				shared.config._perTypeFrontmatterFields[type] = typeConf.frontmatter.fields;
			}
		}
		setIfAbsent('postTypes', selectedTypes);
	}

	// ── frontmatter ───────────────────────────────────────────────────────
	if (cfg.frontmatter) {
		const f = cfg.frontmatter;
		setIfAbsent('frontmatterFields',       f.fields ?? defaultFrontmatterFields());
		setIfAbsent('frontmatterAliases',      f.aliases ?? {});
		setIfAbsent('frontmatterCustom',       f.custom ?? {});
		setIfAbsent('authorAsObject',          f.authorFormat === 'object');
		setIfAbsent('termsAsObjects',          f.termsFormat === 'object');
		setIfAbsent('maxFrontmatterStringLength', f.maxStringLength ?? 200);
	}

	// ── contentFields ─────────────────────────────────────────────────────
	if (Array.isArray(cfg.contentFields)) {
		setIfAbsent('contentFields', cfg.contentFields);
	}

	// ── SEO ───────────────────────────────────────────────────────────────
	if (cfg.seo) {
		const s = cfg.seo;
		setIfAbsent('seoPlugin',         s.plugin ?? 'auto');
		setIfAbsent('seoFrontmatterKey', s.frontmatterKey ?? 'seo');
		setIfAbsent('seoFieldOverrides', s.fields ?? {});
	}

	// ── taxonomies ────────────────────────────────────────────────────────
	if (cfg.taxonomies) {
		const t = cfg.taxonomies;
		// Strip the standard category/post_tag from enabled list — they're
		// always included via the built-in frontmatter getters; only custom
		// ones need to be in selectedTaxonomies for the pipeline.
		// Use `undefined` (not `[]`) when user didn't set `enabled`, so convert.js
		// can distinguish "not configured" (fall back to detected) from "configured
		// as empty" (don't emit any custom taxonomies).
		const allEnabled = t.enabled ?? null;
		const customOnly = allEnabled !== null
			? allEnabled.filter((x) => x !== 'category' && x !== 'post_tag')
			: undefined;
		setIfAbsent('taxonomies', customOnly);
		setIfAbsent('taxonomyAliases', t.aliases ?? {});
		setIfAbsent('emitTaxonomies',     def(get(t, 'emit', 'dataFile'), true));
		setIfAbsent('emitAstroCollections', def(get(t, 'emit', 'astroCollections'), false));
	}

	// ── authors ───────────────────────────────────────────────────────────
	if (cfg.authors) {
		setIfAbsent('emitAuthors', def(cfg.authors.emitDataFile, true));
	}

	// ── images ───────────────────────────────────────────────────────────
	if (cfg.images) {
		const img = cfg.images;
		setIfAbsent('saveImages',          img.save ?? 'all');
		setIfAbsent('imagesDir',           img.dir ?? 'images');
		setIfAbsent('requestDelay',        img.requestDelay ?? 500);
		setIfAbsent('imageSkipPatterns',   img.skipUrlPatterns ?? []);
		setIfAbsent('transformImageUrl',   img.transformUrl ?? null);
		setIfAbsent('attachmentTypes',     img.attachmentTypes ?? [
			'gif', 'jpg', 'jpeg', 'png', 'webp', 'svg', 'avif',
			'pdf', 'mp3', 'mp4', 'webm', 'doc', 'docx', 'xls', 'xlsx', 'zip'
		]);
		setIfAbsent('emitImageMap',                  img.emitImageMap ?? false);
		setIfAbsent('writeDelay',                    img.writeDelay ?? 0);
		setIfAbsent('fallbackToFirstContentImage',   img.fallbackToFirstContentImage ?? false);
	}

	// ── meta ──────────────────────────────────────────────────────────────
	if (cfg.meta) {
		const m = cfg.meta;
		setIfAbsent('includePrivateMeta',        def(m.includePrivate, false));
		setIfAbsent('metaDeny',                  m.deny ?? []);
		setIfAbsent('metaRulesParsed',           normalizeMetaRules(m.rules ?? {}));
		setIfAbsent('metaUnknownFallback',       m.unknownFallback ?? 'skip');
	}

	// ── shortcodes ────────────────────────────────────────────────────────
	if (cfg.shortcodes) {
		setIfAbsent('shortcodeUnknownFallback', cfg.shortcodes.unknownFallback ?? 'skip');
		setIfAbsent('shortcodeHandlers',        cfg.shortcodes.handlers ?? {});
	}

	// ── blocks ────────────────────────────────────────────────────────────
	if (cfg.blocks?.handlers) {
		// Stored for use by the plugin system
		setIfAbsent('blockHandlers', cfg.blocks.handlers);
	}

	// ── hooks ─────────────────────────────────────────────────────────────
	if (cfg.hooks) {
		setIfAbsent('hooks', {
			transformPost:        cfg.hooks.transformPost        ?? null,
			transformContent:     cfg.hooks.transformContent     ?? null,
			transformFrontmatter: cfg.hooks.transformFrontmatter ?? null,
			transformImageUrl:    cfg.hooks.transformImageUrl    ?? null,
		});
	}

	// ── links ─────────────────────────────────────────────────────────────
	if (cfg.links) {
		setIfAbsent('rewriteLinks',    def(cfg.links.rewrite, true));
		setIfAbsent('emitRedirects',   def(get(cfg, 'links', 'redirects', 'emit'), true));
		setIfAbsent('redirectsPath',   get(cfg, 'links', 'redirects', 'path') ?? '_redirects');
		setIfAbsent('redirectsFormat', get(cfg, 'links', 'redirects', 'format') ?? 'netlify');
	}

	// ── plugins ───────────────────────────────────────────────────────────
	if (cfg.plugins) {
		// Resolve which SEO plugins to include
		const enabled = cfg.plugins.enabled ? [...cfg.plugins.enabled] : ['acf'];

		// If seo.plugin is set, ensure the right SEO plugin is enabled
		const seoPlugin = shared.config.seoPlugin ?? 'auto';
		if (seoPlugin === 'auto') {
			// auto = include all SEO plugins, they self-select by key pattern
		} else if (SEO_PLUGIN_NAMES.has(seoPlugin) && !enabled.includes(seoPlugin)) {
			enabled.push(seoPlugin);
		}

		setIfAbsent('plugins', enabled);

		// Inline custom plugins — stored for loadPlugins to pick up
		if (Array.isArray(cfg.plugins.custom) && cfg.plugins.custom.length > 0) {
			shared.config._customPlugins = cfg.plugins.custom;
		}

		// Store per-plugin options
		if (cfg.plugins.yoast)       setIfAbsent('seoFrontmatterKey', cfg.plugins.yoast.frontmatterKey ?? 'seo');
		if (cfg.plugins.rankmath)    setIfAbsent('seoFrontmatterKey', cfg.plugins.rankmath.frontmatterKey ?? 'seo');
		if (cfg.plugins.seopress)    setIfAbsent('seoFrontmatterKey', cfg.plugins.seopress.frontmatterKey ?? 'seo');
		if (cfg.plugins.woocommerce) setIfAbsent('wooProductKey',     cfg.plugins.woocommerce.productKey ?? 'product');
	}

	// ── sensible defaults for things not set above ─────────────────────────
	setIfAbsent('output',          'output');
	setIfAbsent('outputFormat',    'mdx');
	setIfAbsent('saveImages',      'all');
	setIfAbsent('postFolders',     true);
	setIfAbsent('rewriteLinks',    true);
	setIfAbsent('emitRedirects',   true);
	setIfAbsent('emitTaxonomies',  true);
	setIfAbsent('emitAuthors',     true);
	setIfAbsent('plugins',         ['acf', 'bricks', 'yoast', 'rankmath', 'seopress', 'woocommerce']);
	setIfAbsent('frontmatterFields', defaultFrontmatterFields());
	setIfAbsent('maxFrontmatterStringLength', 200);
	setIfAbsent('metaRulesParsed', {});
	setIfAbsent('metaDeny',        []);
	setIfAbsent('wizard',          false); // config file = no wizard needed
}

// Only write to shared.config if the key is not already set by CLI/wizard
function setIfAbsent(key, value) {
	if (shared.config[key] === undefined || shared.config[key] === null ||
		(Array.isArray(shared.config[key]) && shared.config[key].length === 0)) {
		shared.config[key] = value;
	}
}

// Convert new config meta rules format to the internal format
// New: { "_key": { mode, alias, transform } }
// Internal: { "_key": { mode, alias, transform } }  — same shape, just ensure mode is valid
export function normalizeMetaRules(rules) {
	const out = {};
	for (const [key, rule] of Object.entries(rules || {})) {
		if (typeof rule === 'string') {
			// shorthand: "_key": "skip"
			if (['frontmatter', 'complex', 'skip'].includes(rule)) {
				out[key] = { mode: rule };
			}
			continue;
		}
		if (!rule || typeof rule !== 'object') continue;
		const mode = rule.mode;
		if (!['frontmatter', 'complex', 'skip'].includes(mode)) continue;
		out[key] = {
			mode,
			alias: rule.alias,
			transform: typeof rule.transform === 'function' ? rule.transform : undefined,
		};
	}
	return out;
}

function defaultFrontmatterFields() {
	return ['title', 'date', 'modified', 'slug', 'draft', 'categories', 'tags', 'coverImage', 'author', 'excerpt'];
}
