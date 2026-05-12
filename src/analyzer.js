// Analyzes a WordPress export XML and returns structured findings.
// Used by `wetm init` to generate a starter config.

import fs from 'fs';
import * as data from './data.js';

const ALWAYS_HIDDEN = new Set([
	'attachment', 'revision', 'nav_menu_item', 'custom_css',
	'customize_changeset', 'oembed_cache', 'user_request', 'wp_block',
	'wp_global_styles', 'wp_navigation', 'wp_template', 'wp_template_part'
]);

const STANDARD_TAXONOMIES = new Set([
	'category', 'post_tag', 'post_format', 'nav_menu', 'link_category'
]);

// WooCommerce core product meta keys
const WC_META_KEYS = new Set([
	'_price', '_sku', '_product_type', '_stock_status', '_regular_price',
	'_sale_price', '_stock', '_downloadable', '_virtual', '_weight',
	'_length', '_width', '_height', '_manage_stock', '_backorders',
	'_sold_individually', '_upsell_ids', '_crosssell_ids',
	'_product_image_gallery', '_purchase_note'
]);

// Meta key pattern → plugin name
const PLUGIN_DETECTORS = [
	{ name: 'yoast',       test: (k)    => k.startsWith('_yoast_wpseo_') },
	{ name: 'rankmath',    test: (k)    => k.startsWith('rank_math_') },
	{ name: 'seopress',    test: (k)    => k.startsWith('_seopress_') && !k.startsWith('_seopress_analysis_') },
	{ name: 'aioseo',      test: (k)    => k.startsWith('_aioseop_') || k.startsWith('aioseo_') },
	{ name: 'woocommerce', test: (k)    => WC_META_KEYS.has(k) },
	{ name: 'acf',         test: (k, v) => k.startsWith('_') && typeof v === 'string' && v.startsWith('field_') },
	{ name: 'bricks',      test: (k)    => k.startsWith('_bricks_page_content_') },
];

// Page builder detectors (meta key OR content snippet)
const BUILDER_DETECTORS = [
	{ name: 'bricks',   metaKey: '_bricks_page_content_2' },
	{ name: 'elementor', metaKey: '_elementor_data' },
	{ name: 'divi',      contentSnippet: '[et_pb_' },
	{ name: 'wpbakery',  contentSnippet: '[vc_row' },
	{ name: 'beaver',    metaKey: '_fl_builder_data' },
];

const BUILTIN_SHORTCODES = new Set([
	'caption', 'wp_caption', 'embed', 'gallery', 'audio', 'video', 'playlist'
]);

// Matches Gutenberg block comment opening tags (same pattern as blocks.js)
const BLOCK_RE = /<!--\s*wp:([a-zA-Z0-9\/\-_]+)(?:\s+\{[^}]*\})?\s*(?:\/)?-->/g;

// Matches shortcode opening tags (self-closing or opening)
const SHORTCODE_RE = /\[([a-zA-Z][a-zA-Z0-9_-]*)(?:\s[^\]]*)?(?:\/\]|\])/g;

export async function analyze(inputPath) {
	const content = await fs.promises.readFile(inputPath, 'utf8');
	const rss = await data.load(content);
	const channel = rss.child('channel');

	let siteUrl = '';
	try { siteUrl = channel.optionalChildValue('link') || ''; } catch { /* no link */ }

	const items = channel.children('item');

	const postTypeCounts = new Map();           // type → count
	const metaKeyMap = new Map();               // key → { count, sampleValues[] }
	const blockCounts = new Map();              // blockName → count
	const shortcodeCounts = new Map();          // shortcodeName → count
	const detectedPlugins = new Set();
	const detectedBuilders = new Set();
	const itemTaxonomies = new Set();           // from <category domain="..."> on items

	for (const item of items) {
		let type;
		try { type = item.childValue('post_type'); } catch { continue; }
		if (ALWAYS_HIDDEN.has(type)) continue;
		postTypeCounts.set(type, (postTypeCounts.get(type) || 0) + 1);

		// Taxonomies from inline <category domain="..."> elements
		for (const cat of item.children('category')) {
			const domain = cat.optionalAttribute('domain');
			if (domain && !STANDARD_TAXONOMIES.has(domain)) itemTaxonomies.add(domain);
		}

		// Meta keys
		for (const { key, value } of item.postMetaPairs()) {
			if (!key) continue;

			if (!metaKeyMap.has(key)) metaKeyMap.set(key, { count: 0, sampleValues: [] });
			const entry = metaKeyMap.get(key);
			entry.count++;
			if (entry.sampleValues.length < 3 && value != null) {
				const sample = String(value).slice(0, 100);
				if (!entry.sampleValues.includes(sample)) entry.sampleValues.push(sample);
			}

			for (const d of PLUGIN_DETECTORS) {
				if (d.test(key, value)) detectedPlugins.add(d.name);
			}
			for (const b of BUILDER_DETECTORS) {
				if (b.metaKey && b.metaKey === key) detectedBuilders.add(b.name);
			}
		}

		// Content: detect Gutenberg blocks, shortcodes, page builders
		let rawContent = '';
		try { rawContent = item.optionalChildValue('encoded') || ''; } catch { /* empty */ }

		for (const m of rawContent.matchAll(BLOCK_RE)) {
			// Bare names like "paragraph" are core/paragraph in WP block format
			const name = m[1].includes('/') ? m[1] : `core/${m[1]}`;
			blockCounts.set(name, (blockCounts.get(name) || 0) + 1);
		}

		for (const m of rawContent.matchAll(SHORTCODE_RE)) {
			const name = m[1];
			if (!BUILTIN_SHORTCODES.has(name)) {
				shortcodeCounts.set(name, (shortcodeCounts.get(name) || 0) + 1);
			}
		}

		for (const b of BUILDER_DETECTORS) {
			if (b.contentSnippet && rawContent.includes(b.contentSnippet)) {
				detectedBuilders.add(b.name);
			}
		}
	}

	// Custom taxonomies from channel-level <wp:term> elements
	const channelTaxonomies = new Set();
	for (const term of channel.children('term')) {
		const tax = term.optionalChildValue('term_taxonomy');
		if (tax && !STANDARD_TAXONOMIES.has(tax)) channelTaxonomies.add(tax);
	}

	const allCustomTaxonomies = [...new Set([...channelTaxonomies, ...itemTaxonomies])];

	const postTypes = [...postTypeCounts.entries()]
		.map(([type, count]) => ({ type, count }))
		.sort((a, b) => {
			if (a.type === 'post') return -1;
			if (b.type === 'post') return 1;
			if (a.type === 'page') return -1;
			if (b.type === 'page') return 1;
			return a.type.localeCompare(b.type);
		});

	const metaKeys = [...metaKeyMap.entries()]
		.map(([key, info]) => ({ key, count: info.count, sampleValues: info.sampleValues }))
		.sort((a, b) => b.count - a.count);

	const blocks = [...blockCounts.entries()]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count);

	const shortcodes = [...shortcodeCounts.entries()]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count);

	return {
		siteUrl,
		postTypes,
		taxonomies: allCustomTaxonomies,
		metaKeys,
		blocks,
		shortcodes,
		detectedPlugins: [...detectedPlugins],
		detectedBuilders: [...detectedBuilders],
	};
}
