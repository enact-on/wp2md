// Build a permalink → new-relative-path map and rewrite URLs in post bodies.

import * as shared from './shared.js';

export function buildPermalinkMap(posts, siteUrl) {
	const map = new Map();
	for (const post of posts) {
		let link;
		try {
			link = post.data.optionalChildValue('link');
		} catch {
			link = undefined;
		}
		if (!link) continue;

		const candidates = new Set([link]);
		try {
			const u = new URL(link);
			candidates.add(u.pathname); // /2020/01/01/some-post/
			candidates.add(u.pathname.replace(/\/$/, ''));
		} catch {
			// link wasn't absolute, ignore
		}
		if (siteUrl) {
			try {
				const base = new URL(siteUrl);
				const abs = new URL(link, base).href;
				candidates.add(abs);
			} catch {
				// ignore
			}
		}

		const target = postRoute(post);
		for (const key of candidates) {
			map.set(key, target);
			map.set(stripTrailingSlash(key), target);
		}
	}
	return map;
}

function stripTrailingSlash(s) {
	return s.endsWith('/') ? s.slice(0, -1) : s;
}

function postRoute(post) {
	// Astro-style relative route: /<collection>/<slug>/
	const collection = shared.getPostTypeFolder(post.type);
	const slug = shared.getSlugWithFallback(post);
	return `/${collection}/${slug}/`;
}

export function rewriteLinksInContent(content, map, siteUrls) {
	if (!content) return content;

	// Match href="..." and src="..."
	return content.replace(/(href|src)=("|')([^"']+)\2/gi, (full, attr, quote, url) => {
		const rewritten = rewriteUrl(url, map, siteUrls);
		return `${attr}=${quote}${rewritten}${quote}`;
	});
}

function rewriteUrl(url, map, siteUrls) {
	// Try direct match
	if (map.has(url)) return map.get(url);

	// Try without trailing slash
	const noSlash = stripTrailingSlash(url);
	if (map.has(noSlash)) return map.get(noSlash);

	// If url is on a known site domain, try its pathname
	for (const site of siteUrls) {
		try {
			const base = new URL(site);
			const u = new URL(url, base);
			if (u.hostname === base.hostname) {
				const path = u.pathname;
				if (map.has(path)) return map.get(path);
				if (map.has(stripTrailingSlash(path))) return map.get(stripTrailingSlash(path));
			}
		} catch {
			// ignore
		}
	}
	return url;
}

// Astro/Netlify-style redirect entries for old → new permalinks.
export function buildRedirects(posts, siteUrl) {
	const out = [];
	for (const post of posts) {
		let link;
		try {
			link = post.data.optionalChildValue('link');
		} catch {
			link = undefined;
		}
		if (!link) continue;
		try {
			const u = new URL(link);
			if (u.pathname === '/') continue; // post link points to site root — no usable old URL
			out.push({ from: u.pathname, to: `/${shared.getPostTypeFolder(post.type)}/${shared.getSlugWithFallback(post)}/` });
		} catch {
			// ignore
		}
	}
	return out;
}
