// `wetm split [file]` — split a WordPress export into one JSON file per post/page/custom type.
//
// Output structure:
//   output/<site>-split/
//     <post-type>/
//       <slug>.json    ← full item data: all meta, content, taxonomies
//     _taxonomies/
//       <domain>/
//         <term-slug>.json  ← term: slug, name, parent, description
//
// Each JSON is a complete snapshot of the WP item, useful for matching MDX output
// back to raw source data — especially for custom fields, block JSON, and skipped meta.

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { load } from '../data.js';

function siteSlugFromFilename(filename) {
	const base = path.basename(filename, path.extname(filename));
	const wpMatch = base.match(/^(.+?)\.WordPress\./i);
	return wpMatch ? wpMatch[1] : base;
}

function resolveInputPath(inputArg) {
	if (inputArg) return path.resolve(inputArg);
	const inputDir = path.resolve('input');
	if (fs.existsSync(inputDir)) {
		const xmlFiles = fs.readdirSync(inputDir)
			.filter((f) => f.toLowerCase().endsWith('.xml'))
			.sort();
		if (xmlFiles.length === 1) return path.resolve(inputDir, xmlFiles[0]);
		if (xmlFiles.length > 1) {
			console.error(chalk.red('Multiple XML files found in input/. Specify one:'));
			xmlFiles.forEach((f) => console.error(`  wetm split input/${f}`));
			process.exit(1);
		}
	}
	return path.resolve('export.xml');
}

function safeFilename(str) {
	if (!str) return 'unnamed';
	return str.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'unnamed';
}

export async function runSplit() {
	const inputArg = process.argv[2];
	const inputPath = resolveInputPath(inputArg);

	if (!fs.existsSync(inputPath)) {
		console.error(chalk.red(`Export file not found: ${inputPath}`));
		console.error('Usage: wetm split [path/to/export.xml]');
		process.exit(1);
	}

	const siteSlug = siteSlugFromFilename(inputPath);
	const outputDir = path.resolve(`output/${siteSlug}-split`);

	console.log(chalk.blue(`Splitting: ${path.basename(inputPath)}`));
	console.log(chalk.blue(`Output:    ${outputDir}\n`));

	const content = await fs.promises.readFile(inputPath, 'utf8');
	const rss = await load(content);
	const channel = rss.child('channel');
	const items = channel.children('item');

	// Collect taxonomy terms from channel-level <wp:term> and <wp:category> elements
	const taxonomyTerms = {};
	for (const term of channel.children('term')) {
		const domain = term.optionalChildValue('term_taxonomy');
		if (!domain) continue;
		const slug = term.optionalChildValue('term_slug') || term.optionalChildValue('term_id');
		if (!slug) continue;
		if (!taxonomyTerms[domain]) taxonomyTerms[domain] = {};
		taxonomyTerms[domain][slug] = {
			slug,
			name: term.optionalChildValue('term_name') || slug,
			parent: term.optionalChildValue('term_parent') || null,
			description: term.optionalChildValue('term_description') || '',
			id: term.optionalChildValue('term_id'),
		};
	}
	for (const cat of channel.children('category')) {
		const domain = cat.optionalAttribute ? cat.optionalChildValue?.('category_nicename') : undefined;
		// channel-level <wp:category> elements
		const slug = cat.optionalChildValue('category_nicename');
		const name = cat.optionalChildValue('cat_name');
		if (slug && name) {
			if (!taxonomyTerms['category']) taxonomyTerms['category'] = {};
			taxonomyTerms['category'][slug] = {
				slug,
				name,
				parent: cat.optionalChildValue('category_parent') || null,
				description: '',
			};
		}
	}
	for (const tag of channel.children('tag')) {
		const slug = tag.optionalChildValue('tag_slug');
		const name = tag.optionalChildValue('tag_name');
		if (slug) {
			if (!taxonomyTerms['post_tag']) taxonomyTerms['post_tag'] = {};
			taxonomyTerms['post_tag'][slug] = { slug, name: name || slug, parent: null, description: '' };
		}
	}

	let written = 0;
	const typeCounts = {};

	for (const item of items) {
		const postType = item.optionalChildValue('post_type') || 'post';
		const postId = item.optionalChildValue('post_id');
		const rawSlug = item.optionalChildValue('post_name');
		const slug = safeFilename(rawSlug) || `id-${postId}`;
		const status = item.optionalChildValue('status') || 'publish';

		// All meta pairs
		const meta = {};
		for (const { key, value } of item.postMetaPairs()) {
			if (key) {
				if (meta[key] === undefined) {
					meta[key] = value;
				} else if (Array.isArray(meta[key])) {
					meta[key].push(value);
				} else {
					meta[key] = [meta[key], value];
				}
			}
		}

		// All taxonomy terms on this item (domain → [{slug, name}])
		const termDomains = {};
		for (const cat of item.children('category')) {
			const domain = cat.optionalAttribute ? undefined : undefined;
			// use the raw children approach
		}
		// Re-use the data.terms() helper for known domains
		const knownDomains = ['category', 'post_tag', 'doc_category', 'product_cat', 'product_tag'];
		for (const domain of knownDomains) {
			const terms = item.terms(domain);
			if (terms.length > 0) termDomains[domain] = terms;
		}
		// Also capture any unlisted taxonomies by scanning category children
		for (const cat of item.children('category')) {
			const domain = cat.optionalAttribute('domain');
			const nicename = cat.optionalAttribute('nicename');
			const name = cat.optionalValue ? cat.optionalValue() : undefined;
			if (domain && nicename && !knownDomains.includes(domain)) {
				if (!termDomains[domain]) termDomains[domain] = [];
				const exists = termDomains[domain].some((t) => t.slug === nicename);
				if (!exists) {
					termDomains[domain].push({ slug: nicename, name: name || nicename });
				}
				// Also collect into taxonomyTerms
				if (!taxonomyTerms[domain]) taxonomyTerms[domain] = {};
				if (!taxonomyTerms[domain][nicename]) {
					taxonomyTerms[domain][nicename] = { slug: nicename, name: name || nicename, parent: null, description: '' };
				}
			}
		}

		// Encoded content — xml2js stripPrefix merges content:encoded and excerpt:encoded both as "encoded"
		// They appear in order: content first, excerpt second
		const encodedNodes = item.children('encoded');
		const rawContent = encodedNodes[0]?.optionalValue() ?? '';
		const rawExcerpt = encodedNodes[1]?.optionalValue() ?? '';

		const record = {
			id: postId,
			slug: rawSlug || slug,
			type: postType,
			status,
			title: item.optionalChildValue('title'),
			link: item.optionalChildValue('link'),
			date: item.optionalChildValue('post_date'),
			modified: item.optionalChildValue('post_modified'),
			author: item.optionalChildValue('creator'),
			parent: item.optionalChildValue('post_parent'),
			menu_order: item.optionalChildValue('menu_order'),
			comment_status: item.optionalChildValue('comment_status'),
			content: rawContent,
			excerpt: rawExcerpt,
			taxonomies: termDomains,
			meta,
		};

		const typeDir = path.join(outputDir, postType);
		fs.mkdirSync(typeDir, { recursive: true });
		fs.writeFileSync(
			path.join(typeDir, `${slug}.json`),
			JSON.stringify(record, null, '\t'),
			'utf8'
		);

		typeCounts[postType] = (typeCounts[postType] || 0) + 1;
		written++;
	}

	// Write taxonomy term files
	let termCount = 0;
	for (const [domain, terms] of Object.entries(taxonomyTerms)) {
		const termDir = path.join(outputDir, '_taxonomies', domain);
		fs.mkdirSync(termDir, { recursive: true });
		for (const [slug, term] of Object.entries(terms)) {
			fs.writeFileSync(
				path.join(termDir, `${safeFilename(slug)}.json`),
				JSON.stringify(term, null, '\t'),
				'utf8'
			);
			termCount++;
		}
	}

	console.log(chalk.green(`\nSplit complete!`));
	console.log(`Posts: ${written}`);
	for (const [type, count] of Object.entries(typeCounts).sort()) {
		console.log(`  ${type}: ${count}`);
	}
	if (termCount > 0) {
		console.log(`Taxonomy terms: ${termCount}`);
	}
	console.log(`\nOutput: ${outputDir}`);
}
