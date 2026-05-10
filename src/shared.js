import chalk from 'chalk';
import path from 'path';

// simple data store, populated via intake, used everywhere
export const config = {};

// Per-post-type config (folder names, etc.). Mutable so the wizard / config
// file can override defaults like `posts -> blog`.
export const postTypeConfig = {
	post: { folder: 'posts' },
	page: { folder: 'pages' }
};

export function getPostTypeFolder(type) {
	if (postTypeConfig[type]?.folder) return postTypeConfig[type].folder;
	return type;
}

export function camelCase(str) {
	return str.replace(/-(.)/g, (match) => match[1].toUpperCase());
}

export function getSlugWithFallback(post) {
	return post.slug ? post.slug : 'id-' + post.id;
}

export function logHeading(text) {
	console.log(`\n${chalk.cyan(text + '...')}`);
}

export function buildPostPath(post, overrideConfig) {
	const pathConfig = overrideConfig ?? config;
	const ext = post.extension ?? 'md';

	const pathSegments = [pathConfig.output];

	if (post.type) {
		pathSegments.push(getPostTypeFolder(post.type));
	}

	if (post.isDraft) {
		pathSegments.push('_drafts');
	}

	if (post.date) {
		if (pathConfig.dateFolders === 'year' || pathConfig.dateFolders === 'year-month') {
			pathSegments.push(post.date.toFormat('yyyy'));
		}
		if (pathConfig.dateFolders === 'year-month') {
			pathSegments.push(post.date.toFormat('LL'));
		}
	}

	let slug = getSlugWithFallback(post);
	if (pathConfig.prefixDate && post.date) {
		slug = post.date.toFormat('yyyy-LL-dd') + '-' + slug;
	}

	if (pathConfig.postFolders) {
		pathSegments.push(slug, `index.${ext}`);
	} else {
		pathSegments.push(`${slug}.${ext}`);
	}

	return path.join(...pathSegments);
}

export function getFilenameFromUrl(url) {
	let filename = url.split('/').slice(-1)[0];
	filename = filename.split('?')[0].split('#')[0];
	const invalidChars = /[<>:"\/\\|?*]/g;
	filename = filename.replace(invalidChars, '_');
	try {
		filename = decodeURIComponent(filename)
	} catch (ex) {
		// leave as-is
	}
	return filename;
}

export function parseMetaRules(list) {
	const out = {};
	for (const entry of list || []) {
		const parts = entry.split(':');
		if (parts.length < 2) continue;
		const [key, mode, ...rest] = parts;
		const alias = rest.length > 0 ? rest.join(':') : undefined;
		if (!['frontmatter', 'complex', 'skip'].includes(mode)) {
			console.warn(`Ignoring invalid meta rule mode "${mode}" for "${key}".`);
			continue;
		}
		out[key] = { mode, alias };
	}
	return out;
}
