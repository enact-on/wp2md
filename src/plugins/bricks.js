// Bricks Builder page content extractor.
//
// Bricks stores its layout as a PHP-serialized flat array in _bricks_page_content_*
// postmeta. The post's content:encoded is empty for Bricks-built pages.
//
// This plugin:
//   onMeta  — consumes all _bricks_* meta keys so they don't appear as raw
//              frontmatter/export blocks
//   onContent — when a post has no content, renders the Bricks element tree
//               to markdown

import { htmlToMarkdown } from '../translator.js';

// Meta key patterns owned by Bricks
const BRICKS_META_RE = /^_bricks_/;

// GutenBricks: blocks whose name starts with "default/gutenb-"
const GUTENB_RE = /^default\/gutenb-/;

// Matches gb-{6 lowercase alphanumeric} element field keys
const GB_FIELD_RE = /^gb-[a-z0-9]{6}$/;

// Elements that carry text content
const HEADING_EL    = new Set(['heading']);
const TEXT_EL       = new Set(['text', 'text-basic', 'richtext']);
const CODE_EL       = new Set(['code']);
const IMAGE_EL      = new Set(['image']);
const VIDEO_EL      = new Set(['video']);
const ACCORDION_EL  = new Set(['accordion']);
const SHORTCODE_EL  = new Set(['shortcode']);

// Elements to skip entirely (pure UI, no content value)
const SKIP_EL = new Set([
	'button', 'icon', 'nav-menu', 'nav-nested', 'nav', 'form',
	'email', 'phone', 'search', 'dropdown', 'pagination',
	'svg', 'counter', 'post-toc', 'template', 'social', 'social-link',
	'text-link', 'post-content',
]);

// Elements that are structural containers — recurse into children
const CONTAINER_EL = new Set([
	'section', 'container', 'block', 'div', 'tabs-nested', 'slider-nested',
]);

// Strip HTML tags, decode common entities, return plain text
function stripHtml(html) {
	if (!html) return '';
	return String(html)
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#039;|&#39;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

// Safely convert HTML to markdown; fall back to stripHtml on failure
function toMarkdown(html) {
	if (!html) return '';
	try {
		return htmlToMarkdown(html).trim();
	} catch {
		return stripHtml(html);
	}
}

// Determine heading level from settings.tag ('h1'–'h6') or tree depth
function headingLevel(settings, depth) {
	const tag = settings?.tag ?? '';
	if (/^h[1-6]$/i.test(tag)) return parseInt(tag[1]);
	return Math.min(depth + 2, 6); // depth 0 → h2, depth 1 → h3, …
}

// Returns true if a string is an unresolved ACF dynamic placeholder {acf_*}
function isDynamic(str) {
	return typeof str === 'string' && /^\{acf_/.test(str.trim());
}

function renderOne(el, byId, depth) {
	const name = el.name ?? '';
	const s    = el.settings ?? {};
	const out  = [];

	if (SKIP_EL.has(name)) return '';

	if (HEADING_EL.has(name)) {
		const text = stripHtml(s.text ?? '');
		if (text && !isDynamic(text)) {
			out.push(`${'#'.repeat(headingLevel(s, depth))} ${text}`);
		}

	} else if (TEXT_EL.has(name)) {
		const html = s.text ?? s.content ?? '';
		if (html && !isDynamic(html)) {
			const md = toMarkdown(html);
			if (md) out.push(md);
		}

	} else if (CODE_EL.has(name)) {
		const code = s.content ?? s.code ?? '';
		if (code) out.push('```\n' + code + '\n```');

	} else if (IMAGE_EL.has(name)) {
		const img = s.image ?? {};
		const src = img.url ?? img.src ?? s.src ?? '';
		const alt = img.alt ?? s.alt ?? '';
		if (src) out.push(`![${alt}](${src})`);

	} else if (VIDEO_EL.has(name)) {
		const src = s.url ?? s.src ?? '';
		if (src) out.push(`<video src="${src}" controls></video>`);

	} else if (ACCORDION_EL.has(name)) {
		const items    = s.accordions ?? [];
		const titleTag = s.titleTag ?? 'h3';
		const level    = /^h([1-6])$/.test(titleTag) ? parseInt(titleTag[1]) : 3;
		for (const item of items) {
			const title   = stripHtml(item.title   ?? '');
			const content = item.content ?? '';
			if (title && !isDynamic(title)) {
				out.push(`${'#'.repeat(level)} ${title}`);
			}
			if (content && !isDynamic(content)) {
				const md = toMarkdown(content);
				if (md) out.push(md);
			}
		}

	} else if (SHORTCODE_EL.has(name)) {
		const sc = s.shortcode ?? '';
		if (sc) out.push(sc);
	}

	// Recurse into children for all elements (containers + content elements
	// may themselves have nested children)
	for (const childId of (el.children ?? [])) {
		const child = byId.get(childId);
		if (!child) continue;
		const r = renderOne(child, byId, depth + 1);
		if (r) out.push(r);
	}

	return out.join('\n\n');
}

// ── GutenBricks block renderer ────────────────────────────────────────────────
// GutenBricks stores per-page content overrides in `gb-{6charId}` attrs and
// rich repeater data in `_gutenbricks_meta_data`. Both are extracted here.

// GutenBricks button fields carry a `style` key (e.g. "primary") alongside text
function isGbButton(obj) {
	return obj && typeof obj === 'object' && 'style' in obj;
}

// Render all `gb-{6charId}` text/image fields from a block's attrs.
// Returns an array of markdown strings (one per field).
function renderGbFields(attrs) {
	const parts = [];
	for (const [k, v] of Object.entries(attrs)) {
		if (!GB_FIELD_RE.test(k)) continue;
		if (!v || typeof v !== 'object') continue;
		if (v._gb_show_element === false) continue;
		if (isGbButton(v)) continue;

		if (v.text) {
			const md = toMarkdown(v.text).trim();
			if (md) parts.push(md);
		}
		if (v.image?.url) {
			const alt = v.image.alt ?? '';
			parts.push(`![${alt}](${v.image.url})`);
		}
	}
	return parts;
}

// Render a single _gutenbricks_meta_data repeater group.
function renderMetaGroup(key, items) {
	const parts = [];

	if (key === 'testimonial_card') {
		for (const item of items) {
			const title = stripHtml(item.title ?? '');
			const desc  = toMarkdown(item.description ?? '').trim();
			const score = item.rating_score ? ` (${item.rating_score}★)` : '';
			if (desc) {
				const quoted = desc.replace(/^/gm, '> ');
				parts.push(`${quoted}\n>\n> — **${title}**${score}`);
			}
		}

	} else if (key === 'medical_card_wrapper') {
		for (const item of items) {
			const num   = item.count ? `${item.count}. ` : '';
			const title = stripHtml(item.title ?? '').replace(/[\r\n]+/g, ' ');
			const desc  = toMarkdown(item.description ?? '').trim();
			if (title) parts.push(`**${num}${title}**${desc ? '\n\n' + desc : ''}`);
			else if (desc) parts.push(desc);
		}

	} else if (key === 'info_section') {
		const lines = items
			.map(item => `- ${stripHtml(item.text ?? '').replace(/[\r\n]+/g, ' ').trim()}`)
			.filter(l => l !== '- ');
		if (lines.length) parts.push(lines.join('\n'));

	} else if (key === 'faqs_wrapper') {
		for (const item of items) {
			const title = stripHtml(item.title ?? '').trim();
			const desc  = toMarkdown(item.description ?? '').trim();
			if (title) parts.push(`**${title}**${desc ? '\n\n' + desc : ''}`);
		}

	} else if (key === 'places_custom_field') {
		for (const item of items) {
			const title    = stripHtml(item.place_title ?? '').trim();
			const location = item.place_location
				? `*${item.place_location.trim()}*`
				: null;
			const descList = (item.place_description_list ?? [])
				.map(d => `- ${stripHtml(d.place_description ?? '').trim()}`)
				.filter(l => l !== '- ');
			if (title)           parts.push(`### ${title}`);
			if (location)        parts.push(location);
			if (descList.length) parts.push(descList.join('\n'));
		}

	} else if (key === 'helpfull_hotlines_custom_field') {
		for (const item of items) {
			const title = stripHtml(item.hotlines_title ?? '').trim();
			const desc  = toMarkdown(item.hotlines_description ?? '').trim();
			if (title) parts.push(`### ${title}`);
			if (desc)  parts.push(desc);
		}

	} else {
		// Generic repeater: extract title + description or text
		for (const item of items) {
			if (!item || typeof item !== 'object') continue;
			const title = item.title       ? stripHtml(item.title).trim()          : null;
			const desc  = item.description ? toMarkdown(item.description).trim()   : null;
			const text  = item.text        ? stripHtml(item.text).trim()           : null;
			if (title && desc) parts.push(`**${title}**\n\n${desc}`);
			else if (title)    parts.push(`**${title}**`);
			else if (desc)     parts.push(desc);
			else if (text)     parts.push(text);
		}
	}

	return parts;
}

function renderGutenbricksBlock(block) {
	const attrs = block.attrs ?? {};
	const parts = [];

	// gb-{id} fields: section headlines and inline text overrides
	const gbText = renderGbFields(attrs);
	if (gbText.length) parts.push(...gbText);

	// _gutenbricks_meta_data: rich repeater data (testimonials, cards, FAQs…)
	const meta = attrs._gutenbricks_meta_data;
	if (meta && typeof meta === 'object') {
		// tabs + tab_content must be rendered together
		if ('tabs' in meta || 'tab_content' in meta) {
			const tabs       = meta.tabs       ?? [];
			const tabContent = meta.tab_content ?? [];
			const count      = Math.max(tabs.length, tabContent.length);
			for (let i = 0; i < count; i++) {
				const tab     = tabs[i];
				const content = tabContent[i];
				if (!content) continue;
				const heading = stripHtml(content.heading ?? tab?.title ?? '').trim();
				const desc    = toMarkdown(content.description ?? '').trim();
				if (heading) parts.push(`### ${heading}`);
				if (desc)    parts.push(desc);
			}
		}

		for (const [key, items] of Object.entries(meta)) {
			if (key === 'tabs' || key === 'tab_content') continue;
			if (!Array.isArray(items) || items.length === 0) continue;
			parts.push(...renderMetaGroup(key, items));
		}
	}

	return parts.join('\n\n');
}

// ── Bricks element-tree renderer ──────────────────────────────────────────────

function renderBricksElements(elements) {
	if (!Array.isArray(elements) || elements.length === 0) return '';

	const byId = new Map(elements.map(el => [el.id, el]));

	// Roots: parent is 0 (integer) or parent ID not present in the flat list
	const allIds = new Set(elements.map(el => el.id));
	const roots  = elements.filter(el => el.parent === 0 || !allIds.has(el.parent));

	const parts = [];
	for (const root of roots) {
		const r = renderOne(root, byId, 0);
		if (r) parts.push(r);
	}
	return parts.join('\n\n');
}

export const plugin = {
	name: 'bricks',

	onBlock({ block }) {
		if (!GUTENB_RE.test(block.blockName ?? '')) return undefined;
		const rendered = renderGutenbricksBlock(block);
		return rendered || null;
	},

	onMeta({ metas, consumed }) {
		for (const meta of metas) {
			if (BRICKS_META_RE.test(meta.key)) {
				consumed.add(meta.key);
			}
		}
	},

	onContent({ content, post }) {
		// Only take over when the post body is empty (Bricks replaced content:encoded)
		if (content && content.trim()) return undefined;

		const decodedMeta = post._decodedMeta ?? {};

		// Collect all _bricks_page_content_* keys (sorted for consistency)
		const keys = Object.keys(decodedMeta)
			.filter(k => k.startsWith('_bricks_page_content_'))
			.sort();

		if (keys.length === 0) return undefined;

		const parts = [];
		for (const key of keys) {
			const rendered = renderBricksElements(decodedMeta[key]);
			if (rendered) parts.push(rendered);
		}

		return parts.join('\n\n') || undefined;
	},
};
