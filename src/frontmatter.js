// Built-in frontmatter getters. Each function receives the post object and
// returns the value to embed (or undefined to omit the field).
//
// Plugins / config files can register more getters via `registerField`.

import * as luxon from 'luxon';
import * as shared from './shared.js';
import { findAuthor } from './authors.js';

// Registry for user-defined fields. Plugins / wetm.config.js can call
// `registerField('myField', (post) => ...)` to expose new built-ins.
const customFields = {};

export function registerField(name, getter) {
	if (typeof getter !== 'function') {
		throw new Error(`Frontmatter getter for "${name}" must be a function.`);
	}
	customFields[name] = getter;
}

export function getCustom(name) {
	return customFields[name];
}

// ---------------------------------------------------------------------------
// Built-in getters
// ---------------------------------------------------------------------------

export function author(post) {
	const username = post.data.optionalChildValue('creator');
	if (!username) return undefined;
	const found = findAuthor(shared.config._authorRegistry ?? [], username);
	if (!found) return username;

	// If user wants the rich author object, return it; otherwise just the
	// human-friendly display name (more useful in Astro than the WP login).
	if (shared.config.authorAsObject) {
		return {
			username: found.username,
			displayName: found.displayName || found.username,
			email: found.email || undefined,
			firstName: found.firstName || undefined,
			lastName: found.lastName || undefined
		};
	}
	return found.displayName || found.username;
}

export function authorSlug(post) {
	return post.data.optionalChildValue('creator');
}

export function categories(post) {
	const decoded = post.data.terms('category')
		.filter((t) => t.slug !== 'uncategorized');
	return termList(decoded);
}

export function tags(post) {
	return termList(post.data.terms('post_tag'));
}

export function postFormat(post) {
	const formats = post.data.terms('post_format');
	return formats.length > 0 ? formats[0].slug : undefined;
}

export function coverImage(post) {
	return post.coverImage;
}

export function date(post) {
	return post.date;
}

export function modified(post) {
	const raw = post.data.optionalChildValue('post_modified_gmt')
		?? post.data.optionalChildValue('post_modified');
	if (!raw) return undefined;
	const dt = luxon.DateTime.fromSQL(raw, { zone: 'utc' });
	if (dt.isValid) return dt;
	const dt2 = luxon.DateTime.fromRFC2822(raw, { zone: 'utc' });
	return dt2.isValid ? dt2 : undefined;
}

export function draft(post) {
	return post.isDraft ? true : undefined;
}

export function excerpt(post) {
	const encoded = post.data.optionalChildValue('encoded', 1);
	if (!encoded) return undefined;
	const cleaned = encoded
		.replace(/<[^>]+>/g, ' ')          // strip tags
		.replace(/[\r\n]+/gm, ' ')         // collapse newlines
		.replace(/\s+/g, ' ')              // collapse whitespace
		.trim();
	return cleaned.length > 0 ? cleaned : undefined;
}

export function id(post) {
	return parseInt(post.id);
}

export function slug(post) {
	return post.slug;
}

export function title(post) {
	return post.data.optionalChildValue('title');
}

export function type(post) {
	return post.type;
}

export function status(post) {
	return post.data.optionalChildValue('status');
}

export function permalink(post) {
	// The original URL on the source WordPress site - useful for redirects /
	// canonical tags during migration.
	return post.data.optionalChildValue('link');
}

export function parent(post) {
	const p = post.data.optionalChildValue('post_parent');
	if (!p || p === '0') return undefined;
	return parseInt(p);
}

export function menuOrder(post) {
	const v = post.data.optionalChildValue('menu_order');
	if (!v || v === '0') return undefined;
	return parseInt(v);
}

export function commentStatus(post) {
	return post.data.optionalChildValue('comment_status');
}

export function pingStatus(post) {
	return post.data.optionalChildValue('ping_status');
}

export function password(post) {
	const v = post.data.optionalChildValue('post_password');
	return v ? v : undefined;
}

export function sticky(post) {
	const v = post.data.optionalChildValue('is_sticky');
	return v === '1' || v === 'true' ? true : undefined;
}

export function readTime(post) {
	const content = post.content ?? '';
	const words = content.trim().split(/\s+/).filter(Boolean).length;
	if (words === 0) return undefined;
	const minutes = Math.max(1, Math.round(words / 200));
	return `${minutes} min`;
}

// Aggregate of every custom taxonomy term we collected. Useful as a single
// catch-all field in the frontmatter without listing each taxonomy by name.
export function taxonomies(post) {
	const out = post._taxonomyTerms;
	if (!out || Object.keys(out).length === 0) return undefined;
	return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function termList(decoded) {
	if (!decoded || decoded.length === 0) return undefined;
	if (shared.config.termsAsObjects) {
		return decoded.map((t) => ({ slug: t.slug, name: t.name }));
	}
	return decoded.map((t) => t.slug);
}
