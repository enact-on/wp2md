// Detects custom taxonomies (anything beyond `category` and `post_tag`) and
// extracts the term registry from the channel header so we can emit hierarchical
// landing-page data files alongside posts.

const STANDARD = new Set(['category', 'post_tag', 'post_format']);

export function detectCustomTaxonomies(allPostData) {
	const found = new Set();
	for (const post of allPostData) {
		for (const cat of post.children('category')) {
			let domain;
			try {
				domain = cat.attribute('domain');
			} catch {
				continue;
			}
			if (!STANDARD.has(domain)) {
				found.add(domain);
			}
		}
	}
	return [...found].sort();
}

export function collectTermRegistry(channel) {
	const terms = [];

	// New-style <wp:term>
	for (const term of channel.children('term')) {
		terms.push({
			taxonomy: term.optionalChildValue('term_taxonomy') ?? 'unknown',
			id: term.optionalChildValue('term_id'),
			slug: decode(term.optionalChildValue('term_slug')),
			name: decode(term.optionalChildValue('term_name')),
			parent: decode(term.optionalChildValue('term_parent')) || null,
			description: term.optionalChildValue('term_description') ?? ''
		});
	}

	// Legacy <wp:category>
	for (const cat of channel.children('category')) {
		terms.push({
			taxonomy: 'category',
			id: cat.optionalChildValue('term_id'),
			slug: decode(cat.optionalChildValue('category_nicename')),
			name: decode(cat.optionalChildValue('cat_name')),
			parent: decode(cat.optionalChildValue('category_parent')) || null,
			description: cat.optionalChildValue('category_description') ?? ''
		});
	}

	// Legacy <wp:tag>
	for (const tag of channel.children('tag')) {
		terms.push({
			taxonomy: 'post_tag',
			id: tag.optionalChildValue('term_id'),
			slug: decode(tag.optionalChildValue('tag_slug')),
			name: decode(tag.optionalChildValue('tag_name')),
			parent: null,
			description: tag.optionalChildValue('tag_description') ?? ''
		});
	}

	return terms;
}

function decode(value) {
	if (typeof value !== 'string') return value;
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

// Emit the structured taxonomy snapshot that Astro can import.
export function buildTaxonomyDataFiles(taxonomies, terms) {
	const files = {};
	for (const tax of taxonomies) {
		const taxTerms = terms
			.filter((t) => t.taxonomy === tax)
			.map((t) => ({
				slug: t.slug,
				name: t.name,
				parent: t.parent,
				description: t.description
			}));
		files[tax] = taxTerms;
	}
	return files;
}

// Returns { taxonomy: [slug, ...] } for a single post.
export function getPostTaxonomyTerms(post, taxonomies) {
	const result = {};
	for (const tax of taxonomies) {
		result[tax] = [];
	}
	for (const cat of post.data.children('category')) {
		let domain, nicename;
		try {
			domain = cat.attribute('domain');
			nicename = cat.attribute('nicename');
		} catch {
			continue;
		}
		if (taxonomies.includes(domain)) {
			result[domain].push(decode(nicename));
		}
	}
	// drop empty arrays
	for (const k of Object.keys(result)) {
		if (result[k].length === 0) delete result[k];
	}
	return result;
}
