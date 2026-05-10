// Block-aware translator. Uses @wordpress/block-serialization-default-parser
// (the official WordPress parser) to turn raw post content into a tree of
// blocks, then renders each block via:
//   1. A user plugin handler (`onBlock({ block })`)
//   2. A built-in renderer (covers common core blocks)
//   3. The fallback: turndown over the block's innerHTML
//
// Plugin handlers may return:
//   - a string of markdown (kept as-is)
//   - { text: string, isJsx?: boolean } — isJsx flips the post to .mdx
//
// The official parser returns a flat-ish tree where each node has:
//   { blockName, attrs, innerBlocks, innerHTML, innerContent }
// Unlike the Zamaneh wrapper it does NOT extract image src/alt etc., so we
// do that ourselves with small regex helpers below.

import { parse as parseBlocks } from '@wordpress/block-serialization-default-parser';

export function isBlockContent(content) {
	return typeof content === 'string' && content.includes('<!-- wp:');
}

// Flat list of every block name (incl. nested), used for the migration report.
export function listBlockNames(content) {
	if (!isBlockContent(content)) return [];
	let blocks;
	try {
		blocks = parseBlocks(content);
	} catch {
		return [];
	}
	const out = [];
	walk(blocks, (b) => {
		if (b.blockName) out.push(b.blockName);
	});
	return out;
}

// Render content. `turndownFn` is called for any HTML chunk (block fallback).
export async function renderBlocks(content, ctx) {
	const { plugins = [], turndownFn, report } = ctx;
	if (!isBlockContent(content)) {
		return { rendered: undefined, hasJsx: false, handled: 0, total: 0 };
	}

	let blocks;
	try {
		blocks = parseBlocks(content);
	} catch (ex) {
		report?.warnings?.push(`Gutenberg parser failed for one post: ${ex.message}`);
		return { rendered: undefined, hasJsx: false, handled: 0, total: 0 };
	}

	let hasJsx = false;
	let handled = 0;
	let total = 0;
	const parts = [];

	for (const block of blocks) {
		// Skip null/whitespace blocks the parser emits between siblings
		if (!block.blockName && !(block.innerHTML ?? '').trim()) continue;
		total++;
		const result = await renderOne(block, { plugins, turndownFn, report, depth: 0 });
		if (result.handled) handled++;
		if (result.isJsx) hasJsx = true;
		if (result.text && result.text.trim().length > 0) {
			parts.push(result.text.trim());
		}
		walk(block.innerBlocks ?? [], () => total++);
	}

	return { rendered: parts.join('\n\n'), hasJsx, handled, total };
}

async function renderOne(block, ctx) {
	const { plugins, turndownFn, report, depth } = ctx;
	const name = block.blockName ?? null;

	// 1) Plugin handlers
	for (const p of plugins) {
		if (typeof p.onBlock === 'function') {
			let r;
			try {
				r = await p.onBlock({ block, depth });
			} catch (ex) {
				report?.warnings?.push(`Plugin ${p.name} onBlock failed for ${name}: ${ex.message}`);
			}
			if (r !== undefined && r !== null) {
				return normalizeHandlerResult(r, true);
			}
		}
	}

	// 2) Built-ins
	if (name && BUILTIN[name]) {
		const r = await BUILTIN[name](block, ctx);
		if (r !== undefined && r !== null) {
			return normalizeHandlerResult(r, true);
		}
	}

	// 3) Container blocks (no own innerHTML)
	const innerHtml = block.innerHTML ?? '';
	if ((block.innerBlocks?.length ?? 0) > 0 && innerHtml.trim() === '') {
		const childParts = [];
		let childJsx = false;
		for (const child of block.innerBlocks) {
			const r = await renderOne(child, { ...ctx, depth: depth + 1 });
			if (r.text?.trim()) childParts.push(r.text.trim());
			if (r.isJsx) childJsx = true;
		}
		return { text: childParts.join('\n\n'), isJsx: childJsx, handled: false };
	}

	// 4) Plain HTML chunk -> turndown
	if (!innerHtml.trim()) return { text: '', isJsx: false, handled: false };
	try {
		return { text: turndownFn(innerHtml).trim(), isJsx: false, handled: false };
	} catch {
		return { text: innerHtml, isJsx: false, handled: false };
	}
}

function normalizeHandlerResult(r, handled) {
	if (typeof r === 'string') {
		return { text: r, isJsx: looksLikeJsx(r), handled };
	}
	return {
		text: r.text ?? '',
		isJsx: r.isJsx ?? looksLikeJsx(r.text ?? ''),
		handled
	};
}

function looksLikeJsx(s) {
	return /(^|\n)<[A-Z]/.test(s) || /\{[A-Za-z_$]/.test(s);
}

function walk(blocks, fn) {
	for (const b of blocks) {
		fn(b);
		if (b.innerBlocks?.length) walk(b.innerBlocks, fn);
	}
}

// ----- Small HTML extraction helpers ----------------------------------------

function extractAttr(html, attr) {
	const re = new RegExp(`\\b${attr}=("([^"]*)"|'([^']*)')`, 'i');
	const m = html?.match(re);
	if (!m) return undefined;
	return m[2] ?? m[3];
}

function extractTagText(html, tag) {
	const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
	const m = html?.match(re);
	return m ? m[1].replace(/<[^>]+>/g, '').trim() : undefined;
}

// ----- Built-in renderers ---------------------------------------------------

const BUILTIN = {
	'core/separator': () => '---',
	'core/spacer': () => '',
	'core/html': (b) => b.innerHTML ?? '',
	'core/shortcode': (b) => b.innerHTML ?? '',

	'core/image': (b) => {
		const html = b.innerHTML ?? '';
		const src = extractAttr(html, 'src') ?? b.attrs?.url;
		const alt = extractAttr(html, 'alt') ?? '';
		const href = extractAttr(html, 'href') ?? b.attrs?.href;
		const caption = extractTagText(html, 'figcaption');
		if (!src) return undefined;
		const img = `![${alt}](${src})`;
		const linked = href ? `[${img}](${href})` : img;
		if (caption) {
			return `<figure>\n\n${linked}\n\n<figcaption>${caption}</figcaption>\n\n</figure>`;
		}
		return linked;
	},

	'core/gallery': async (b, ctx) => {
		const items = (b.innerBlocks ?? []).filter((x) => x.blockName === 'core/image');
		if (items.length === 0) return undefined;
		const out = [];
		for (const img of items) {
			const r = await renderOne(img, ctx);
			if (r.text?.trim()) out.push(r.text.trim());
		}
		return out.join('\n\n');
	},

	'core/embed': (b) => {
		return b.attrs?.url ?? extractAttr(b.innerHTML, 'src');
	},

	'core/video': (b) => {
		const src = b.attrs?.src ?? extractAttr(b.innerHTML, 'src');
		return src ? `<video src="${src}" controls></video>` : undefined;
	},

	'core/audio': (b) => {
		const src = b.attrs?.src ?? extractAttr(b.innerHTML, 'src');
		return src ? `<audio src="${src}" controls></audio>` : undefined;
	},

	'core/file': (b) => {
		const href = b.attrs?.href ?? extractAttr(b.innerHTML, 'href');
		const text = b.attrs?.fileName || extractTagText(b.innerHTML, 'a') || 'Download';
		return href ? `[${text}](${href})` : undefined;
	},

	'core/button': (b) => {
		const href = extractAttr(b.innerHTML, 'href') ?? b.attrs?.url;
		const text = extractTagText(b.innerHTML, 'a') ?? b.attrs?.text ?? '';
		return href ? `[${text || href}](${href})` : undefined;
	},

	'core/buttons': async (b, ctx) => {
		const out = [];
		for (const child of b.innerBlocks ?? []) {
			const r = await renderOne(child, ctx);
			if (r.text?.trim()) out.push(r.text.trim());
		}
		return out.length > 0 ? out.join(' ') : undefined;
	}
};
