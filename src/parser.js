import chalk from 'chalk';
import fs from 'fs';
import * as luxon from 'luxon';
import * as data from './data.js';
import * as frontmatter from './frontmatter.js';
import * as shared from './shared.js';
import * as translator from './translator.js';
import * as taxonomies from './taxonomies.js';
import * as authorsLib from './authors.js';
import * as metaLib from './meta.js';
import { findBlocks } from './blocks.js';
import { listBlockNames } from './gutenberg.js';
import { resolveInputs, dedupePosts } from './input.js';

// Built-in WordPress types we never want to surface for selection.
const ALWAYS_HIDDEN = new Set([
	'attachment', 'revision', 'nav_menu_item', 'custom_css',
	'customize_changeset', 'oembed_cache', 'user_request', 'wp_block',
	'wp_global_styles', 'wp_navigation', 'wp_template', 'wp_template_part'
]);

export async function parseAllInputs() {
	shared.logHeading('Reading export file(s)');
	const inputs = await resolveInputs(shared.config.input);
	for (const f of inputs) console.log('  - ' + f);

	let allItems = [];
	const channels = [];
	let siteUrl;

	for (const file of inputs) {
		const content = await fs.promises.readFile(file, 'utf8');
		const rss = await data.load(content);
		const channel = rss.child('channel');
		channels.push(channel);
		try {
			siteUrl = siteUrl || channel.optionalChildValue('link');
		} catch { /* ignore */ }
		allItems.push(...channel.children('item'));
	}

	allItems = dedupePosts(allItems);

	// Merge authors and terms across every channel (later split files often
	// only contain items, but we still want to cover the case where each file
	// brings its own headers).
	const allAuthors = mergeUnique(
		channels.flatMap((c) => authorsLib.collectAuthors(c)),
		(a) => a.username || a.id
	);
	const allTerms = mergeUnique(
		channels.flatMap((c) => taxonomies.collectTermRegistry(c)),
		(t) => `${t.taxonomy}::${t.slug}`
	);
	const customTaxonomies = taxonomies.detectCustomTaxonomies(allItems);

	return {
		allItems,
		channel: channels[0],
		authors: allAuthors,
		terms: allTerms,
		customTaxonomies,
		siteUrl: siteUrl || shared.config.siteUrl || ''
	};
}

function mergeUnique(items, keyFn) {
	const seen = new Set();
	const out = [];
	for (const item of items) {
		const k = keyFn(item);
		if (k === undefined || k === null) continue;
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(item);
	}
	return out;
}

export function getAvailablePostTypes(allItems) {
	const counts = new Map();
	for (const item of allItems) {
		let type;
		try {
			type = item.childValue('post_type');
		} catch {
			continue;
		}
		if (ALWAYS_HIDDEN.has(type)) continue;
		counts.set(type, (counts.get(type) ?? 0) + 1);
	}
	const list = [...counts.entries()].map(([type, count]) => ({ type, count }));
	list.sort((a, b) => {
		if (a.type === 'post') return -1;
		if (b.type === 'post') return 1;
		if (a.type === 'page') return -1;
		if (b.type === 'page') return 1;
		return a.type.localeCompare(b.type);
	});
	return list;
}

export async function buildPosts(allItems, ctx) {
	const { selectedTypes, selectedTaxonomies, plugins, report } = ctx;

	const posts = [];
	const blockReport = {};

	for (const item of allItems) {
		let type;
		try {
			type = item.childValue('post_type');
		} catch {
			continue;
		}
		if (!selectedTypes.includes(type)) continue;
		if (item.optionalChildValue('status') === 'trash') continue;
		if (type === 'page' && item.optionalChildValue('post_name') === 'sample-page') continue;

		const post = buildPost(item, type, selectedTaxonomies, plugins, report);

		// Track Gutenberg blocks via the structured parser (covers nested) with
		// a regex fallback if the parser fails or finds nothing.
		const raw = item.optionalChildValue('encoded') ?? '';
		let blocks = await listBlockNames(raw);
		if (blocks.length === 0) blocks = findBlocks(raw);
		for (const b of blocks) {
			blockReport[b] = (blockReport[b] ?? 0) + 1;
		}

		posts.push(post);
		report.postTypes[type] = (report.postTypes[type] ?? 0) + 1;
	}

	for (const [name, count] of Object.entries(blockReport)) {
		report.blocks[name] = (report.blocks[name] ?? 0) + count;
	}

	return posts;
}

function buildPost(item, type, selectedTaxonomies, plugins, report) {
	const post = {
		data: item,
		type,
		id: item.childValue('post_id'),
		isDraft: item.optionalChildValue('status') === 'draft',
		slug: decodeSafe(item.optionalChildValue('post_name') ?? ''),
		date: getPostDate(item),
		coverImageId: getPostMetaValue(item, '_thumbnail_id'),
		coverImage: undefined,
		imageUrls: [],
		_taxonomyTerms: taxonomies.getPostTaxonomyTerms({ data: item }, selectedTaxonomies),
		extension: 'md',  // determined later in finalizePost
		exports: [],      // populated by meta pipeline
		content: '',
		frontmatter: {}
	};

	// Process custom fields through the meta pipeline (PHP unserialize, classify, plugins).
	const metaOptions = {
		metaRules: shared.config.metaRulesParsed ?? {},
		metaDeny: shared.config.metaDeny ?? [],
		includePrivateMeta: shared.config.includePrivateMeta ?? false,
		maxFrontmatterStringLength: shared.config.maxFrontmatterStringLength ?? 200
	};
	const metaResult = metaLib.processMeta(post, metaOptions, plugins);
	post._metaResult = metaResult;

	// Update report
	report.metaSummary.frontmatter += metaResult.report.frontmatter.length;
	report.metaSummary.complex += metaResult.report.complex.length;
	report.metaSummary.skipped += metaResult.report.skipped.length;

	return post;
}

// Called after meta processing & link rewriting so we know if we need MDX.
export async function finalizePost(post, ctx) {
	const { plugins, report } = ctx;

	// determine initial extension (may be promoted to mdx later if a block
	// handler returns JSX)
	const requested = shared.config.outputFormat || 'md';
	const hasComplex = (post._metaResult?.exports?.length ?? 0) > 0;
	if (requested === 'mdx') {
		post.extension = 'mdx';
	} else if (requested === 'md') {
		post.extension = 'md';
	} else {
		post.extension = hasComplex ? 'mdx' : 'md';
	}
	let isMdx = post.extension === 'mdx';

	// merge meta-derived frontmatter
	post.frontmatter = { ...(post._metaResult?.frontmatter ?? {}) };
	post.exports = post._metaResult?.exports ?? [];

	// add custom-taxonomy terms to frontmatter
	for (const [tax, terms] of Object.entries(post._taxonomyTerms ?? {})) {
		post.frontmatter[tax] = terms;
	}

	// translate content (uses post._rewrittenContent if links were rewritten)
	const rawContent = post._rewrittenContent ?? (post.data.optionalChildValue('encoded') ?? '');
	const translated = await translator.getPostContent(rawContent, {
		plugins,
		shortcodeReport: report,
		report,
		isMdx
	});
	post.content = translated.content;

	// promote to mdx if any block handler emitted JSX (and user didn't force md)
	if (translated.forcedMdx && requested !== 'md' && post.extension !== 'mdx') {
		post.extension = 'mdx';
		isMdx = true;
	}

	// apply built-in frontmatter fields (after meta merging so meta is not clobbered)
	for (const field of shared.config.frontmatterFields ?? []) {
		const [key, alias] = field.split(':');
		const getter = frontmatter[key] ?? frontmatter.getCustom(key);
		if (!getter) {
			console.warn(`Skipping unknown built-in frontmatter field "${key}"`);
			continue;
		}
		const value = getter(post);
		if (value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0)) {
			post.frontmatter[alias ?? key] = value;
		}
	}
}

function getPostDate(item) {
	let pub;
	try {
		pub = item.optionalChildValue('pubDate');
	} catch {
		return undefined;
	}
	if (!pub) return undefined;
	const date = luxon.DateTime.fromRFC2822(pub, { zone: shared.config.timezone });
	return date.isValid ? date : undefined;
}

function getPostMetaValue(item, key) {
	const metas = item.children('postmeta');
	const meta = metas.find((m) => {
		try {
			return m.childValue('meta_key') === key;
		} catch { return false; }
	});
	if (!meta) return undefined;
	try {
		return meta.childValue('meta_value');
	} catch { return undefined; }
}

function decodeSafe(s) {
	try {
		return decodeURIComponent(s);
	} catch {
		return s;
	}
}

// Image collection - expanded to include srcset, picture, lazy-load attributes
export function collectAttachedImages(allItems, attachmentTypes) {
	const extPattern = new RegExp('\\.(' + attachmentTypes.join('|') + ')(\\?|$)', 'i');
	const out = [];
	for (const item of allItems) {
		let type;
		try { type = item.childValue('post_type'); } catch { continue; }
		if (type !== 'attachment') continue;
		const url = item.optionalChildValue('attachment_url');
		if (!url || !extPattern.test(url)) continue;
		out.push({
			id: item.optionalChildValue('post_id'),
			postId: item.optionalChildValue('post_parent') ?? 'nope',
			url
		});
	}
	console.log(out.length + ' attached files found.');
	return out;
}

export function collectScrapedImages(allItems, selectedTypes) {
	const out = [];
	for (const item of allItems) {
		let type;
		try { type = item.childValue('post_type'); } catch { continue; }
		if (!selectedTypes.includes(type)) continue;

		const postId = item.childValue('post_id');
		const content = item.optionalChildValue('encoded') ?? '';
		const link = item.optionalChildValue('link') ?? '';

		const urls = new Set();

		// <img src="...">
		for (const m of content.matchAll(/<img[^>]+?(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi)) {
			urls.add(m[1]);
		}
		// srcset="url 1x, url 2x"
		for (const m of content.matchAll(/srcset=["']([^"']+)["']/gi)) {
			const parts = m[1].split(',');
			for (const p of parts) {
				const url = p.trim().split(/\s+/)[0];
				if (url) urls.add(url);
			}
		}
		// <source src=...>
		for (const m of content.matchAll(/<source[^>]+?src=["']([^"']+)["']/gi)) {
			urls.add(m[1]);
		}
		// background-image: url(...)
		for (const m of content.matchAll(/background-image\s*:\s*url\(([^)]+)\)/gi)) {
			urls.add(m[1].replace(/^["']|["']$/g, ''));
		}

		for (const u of urls) {
			let absolute;
			if (/^https?:\/\//i.test(u)) {
				absolute = u;
			} else if (/^https?:\/\//i.test(link)) {
				try {
					absolute = new URL(u, link).href;
				} catch {
					continue;
				}
			} else {
				continue;
			}
			out.push({ id: 'nope', postId, url: absolute });
		}
	}
	console.log(out.length + ' images scraped from content.');
	return out;
}

export function mergeImagesIntoPosts(images, posts) {
	for (const image of images) {
		for (const post of posts) {
			let attach = false;
			if (image.postId === post.id) attach = true;
			if (image.id === post.coverImageId) {
				attach = true;
				post.coverImage = shared.getFilenameFromUrl(image.url);
			}
			if (attach && !post.imageUrls.includes(image.url)) {
				post.imageUrls.push(image.url);
			}
		}
	}
}
