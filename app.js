#!/usr/bin/env node

import chalk from 'chalk';
import * as commander from 'commander';
import path from 'path';
import * as intake from './src/intake.js';
import * as parser from './src/parser.js';
import * as shared from './src/shared.js';
import * as writer from './src/writer.js';
import { loadPlugins } from './src/plugins/index.js';
import { createReport, writeReport } from './src/report.js';
import { buildPermalinkMap, rewriteLinksInContent, buildRedirects } from './src/links.js';
import * as taxonomiesLib from './src/taxonomies.js';

(async () => {
	commander.program
		.name('npx wordpress-export-to-markdown')
		.helpOption('-h, --help', 'See the thing you\'re looking at right now')
		.addHelpText('after', '\nMore documentation is at https://github.com/lonekorean/wordpress-export-to-markdown')
		.configureHelp({
			styleOptionTerm: (str) => str.replace(/(<.*>)$/, chalk.gray('$1')),
			styleOptionDescription: (str) => str.replace(/(\(.*\))$/, chalk.gray('$1'))
		});

	await intake.getConfig();

	const report = createReport();
	report.input = shared.config.input;
	report.output = shared.config.output;

	// Load plugins
	const plugins = await loadPlugins(shared.config.plugins ?? [], shared.config._configFile?.value);
	if (plugins.length > 0) {
		console.log(chalk.gray(`Plugins loaded: ${plugins.map((p) => p.name).join(', ')}`));
	}

	// Read every input XML file (multi-file safe), get post types + taxonomies
	const parsed = await parser.parseAllInputs();

	// Determine candidate post types and ask the user (if not pre-selected)
	const availablePostTypes = parser.getAvailablePostTypes(parsed.allItems);
	console.log('\nDiscovered post types:');
	for (const { type, count } of availablePostTypes) {
		console.log(`  - ${type} (${count})`);
	}

	if (parsed.customTaxonomies.length > 0) {
		console.log('Custom taxonomies detected: ' + parsed.customTaxonomies.join(', '));
	}

	await intake.refineWithDiscovery({
		availablePostTypes,
		availableTaxonomies: parsed.customTaxonomies
	});

	const selectedTypes = (shared.config.postTypes && shared.config.postTypes.length > 0)
		? shared.config.postTypes
		: availablePostTypes.map((t) => t.type);
	const selectedTaxonomies = (shared.config.taxonomies && shared.config.taxonomies.length > 0)
		? shared.config.taxonomies
		: parsed.customTaxonomies;

	report.taxonomies = selectedTaxonomies;
	report.authors = parsed.authors.length;

	// Make the author registry available to frontmatter getters (so we can
	// resolve a post's username to its rich author record).
	shared.config._authorRegistry = parsed.authors;

	// Build posts (runs the meta pipeline + plugin classifiers)
	shared.logHeading('Processing posts');
	const posts = await parser.buildPosts(parsed.allItems, {
		selectedTypes,
		selectedTaxonomies,
		plugins,
		report
	});
	console.log(`${posts.length} posts in scope.`);

	// Build permalink map for internal link rewriting
	if (shared.config.rewriteLinks) {
		const permalinkMap = buildPermalinkMap(posts, parsed.siteUrl);
		const siteUrls = [parsed.siteUrl, shared.config.siteUrl].filter(Boolean);
		for (const post of posts) {
			const raw = post.data.optionalChildValue('encoded') ?? '';
			post._rewrittenContent = rewriteLinksInContent(raw, permalinkMap, siteUrls);
		}
	}

	// Image collection
	const images = [];
	if (shared.config.saveImages === 'attached' || shared.config.saveImages === 'all') {
		images.push(...parser.collectAttachedImages(parsed.allItems, shared.config.attachmentTypes ?? ['gif', 'jpg', 'jpeg', 'png', 'webp']));
	}
	if (shared.config.saveImages === 'scraped' || shared.config.saveImages === 'all') {
		images.push(...parser.collectScrapedImages(parsed.allItems, selectedTypes));
	}
	parser.mergeImagesIntoPosts(images, posts);

	// Finalize each post (translate content, build frontmatter, choose extension)
	for (const post of posts) {
		await parser.finalizePost(post, { plugins, report });
	}

	// Build extras
	const extras = { report };
	if (shared.config.emitTaxonomies && selectedTaxonomies.length > 0) {
		extras.taxonomies = taxonomiesLib.buildTaxonomyDataFiles(selectedTaxonomies, parsed.terms);
	}
	if (shared.config.emitAuthors && parsed.authors.length > 0) {
		extras.authors = parsed.authors;
	}
	if (shared.config.emitRedirects) {
		extras.redirects = buildRedirects(posts, parsed.siteUrl);
	}

	if (shared.config.dryRun) {
		shared.logHeading('Dry run');
		console.log('Skipping file output.');
	} else {
		await writer.writeFilesPromise(posts, extras);
	}

	// Write the migration report
	const reportPaths = await writeReport(report, shared.config.output);
	console.log('\nMigration report:');
	console.log('  ' + reportPaths.txtPath);
	console.log('  ' + reportPaths.jsonPath);

	console.log('\nAll done!');
	console.log('Look for your output files in: ' + path.resolve(shared.config.output));
})().catch((ex) => {
	console.log('\nSomething went wrong, execution halted early.');
	console.error(ex);
	process.exit(1);
});
