// Classifies WordPress postmeta into:
//   - skip:        ignored (private/internal noise)
//   - frontmatter: scalar / flat array, embedded in YAML frontmatter
//   - complex:     nested object/array, emitted as `export const` MDX block
//
// Plugins (acf, yoast, woocommerce, ...) can pre-process raw metas, override
// classification, rename keys, and produce structured frontmatter blocks
// (e.g. an entire `seo: {...}` object) before classification is applied.

import { tryUnserialize, looksSerialized } from './php-unserialize.js';

const DEFAULT_DENY_PREFIXES = [
	'_edit_lock',
	'_edit_last',
	'_oembed_',
	'_wp_old_',
	'_wp_attachment_metadata',
	'_wp_attached_file',
	'_yoast_indexable_'
];

const DEFAULT_ALLOW_UNDERSCORE = new Set([
	'_thumbnail_id' // we already use this internally; surfaced via coverImage
]);

function isDenied(key, options) {
	if (DEFAULT_ALLOW_UNDERSCORE.has(key)) return true; // handled elsewhere, drop from output
	if (options.metaDeny.includes(key)) return true;
	if (DEFAULT_DENY_PREFIXES.some((p) => key.startsWith(p))) return true;
	if (options.includePrivateMeta) return false;
	if (key.startsWith('_')) return true; // private by WordPress convention
	return false;
}

function decodeValue(rawValue) {
	if (typeof rawValue !== 'string') return rawValue;

	// Try PHP unserialize first
	const phpAttempt = tryUnserialize(rawValue);
	if (phpAttempt.ok) return phpAttempt.value;

	// Try JSON
	const trimmed = rawValue.trim();
	if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
		(trimmed.startsWith('[') && trimmed.endsWith(']'))) {
		try {
			return JSON.parse(trimmed);
		} catch {
			// fall through
		}
	}

	// Simple coercions for common scalar shapes
	if (trimmed === '') return '';
	if (/^-?\d+$/.test(trimmed)) {
		const n = Number(trimmed);
		if (Number.isSafeInteger(n)) return n;
	}
	if (/^-?\d+\.\d+$/.test(trimmed)) return Number(trimmed);
	if (trimmed === 'true') return true;
	if (trimmed === 'false') return false;

	return rawValue;
}

function isScalar(value) {
	const t = typeof value;
	return value === null || t === 'string' || t === 'number' || t === 'boolean';
}

function isFlatArrayOfScalars(value) {
	return Array.isArray(value) && value.every(isScalar);
}

function classify(value, options) {
	if (isScalar(value)) {
		// Long strings (e.g. embedded HTML) are better as complex blocks
		if (typeof value === 'string' && value.length > options.maxFrontmatterStringLength) {
			return 'complex';
		}
		return 'frontmatter';
	}
	if (isFlatArrayOfScalars(value)) {
		return 'frontmatter';
	}
	return 'complex';
}

// Convert "field-name 1" -> "fieldName1", strip invalid identifier chars
export function toIdentifier(key) {
	let id = String(key).replace(/[^A-Za-z0-9_$]+(.)/g, (_, c) => c.toUpperCase());
	id = id.replace(/[^A-Za-z0-9_$]/g, '');
	if (/^\d/.test(id)) id = '_' + id;
	if (!id) id = 'field';
	return id;
}

export function processMeta(post, options, plugins) {
	const rawMetas = post.data.children('postmeta')
		.map((m) => ({
			key: m.childValue('meta_key'),
			value: m.optionalChildValue('meta_value')
		}))
		.filter((m) => m.key !== undefined);

	// Decode every meta value (PHP unserialize / JSON / coerce)
	let metas = rawMetas.map((m) => ({
		key: m.key,
		value: m.value === undefined ? null : decodeValue(m.value),
		raw: m.value,
		wasSerialized: typeof m.value === 'string' && looksSerialized(m.value)
	}));

	const ctx = {
		post,
		options,
		// plugins push to these; consumed below
		frontmatter: {},   // { dottedKey: value }   merged into post.frontmatter
		exports: [],       // { name, value }        emitted as `export const name = ...`
		consumed: new Set() // raw meta keys that should not be re-emitted
	};

	for (const plugin of plugins) {
		if (typeof plugin.onMeta === 'function') {
			plugin.onMeta({ metas, ...ctx });
		}
	}

	// Apply user overrides (--meta-rules) and default classification
	const result = {
		frontmatter: { ...ctx.frontmatter },
		exports: [...ctx.exports],
		report: { skipped: [], frontmatter: [], complex: [] }
	};

	for (const meta of metas) {
		if (ctx.consumed.has(meta.key)) {
			continue;
		}
		if (isDenied(meta.key, options)) {
			result.report.skipped.push(meta.key);
			continue;
		}

		const rule = options.metaRules[meta.key];
		const classification = rule?.mode ?? classify(meta.value, options);
		if (classification === 'skip') {
			result.report.skipped.push(meta.key);
			continue;
		}

		const targetKey = rule?.alias ?? meta.key;

		if (classification === 'frontmatter') {
			setDotted(result.frontmatter, targetKey, meta.value);
			result.report.frontmatter.push(meta.key);
		} else {
			result.exports.push({
				name: toIdentifier(targetKey),
				value: meta.value
			});
			result.report.complex.push(meta.key);
		}
	}

	return result;
}

function setDotted(obj, dottedKey, value) {
	const parts = dottedKey.split('.');
	let cursor = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		const k = parts[i];
		if (typeof cursor[k] !== 'object' || cursor[k] === null || Array.isArray(cursor[k])) {
			cursor[k] = {};
		}
		cursor = cursor[k];
	}
	cursor[parts[parts.length - 1]] = value;
}
