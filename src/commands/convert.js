// `wetm [flags...]` — run the conversion pipeline.
// Supports both the new config-file driven mode and the legacy CLI/wizard mode.

import chalk from 'chalk';
import path from 'path';
import * as intake from '../intake.js';
import * as parser from '../parser.js';
import * as shared from '../shared.js';
import * as writer from '../writer.js';
import { loadPlugins } from '../plugins/index.js';
import { createReport, writeReport } from '../report.js';
import { buildPermalinkMap, rewriteLinksInContent, buildRedirects } from '../links.js';
import * as taxonomiesLib from '../taxonomies.js';
import { applyConfigSchema } from '../config-schema.js';

export async function runConvert() {
	// Try loading wetm.config.js and applying it before the CLI/wizard runs.
	// If no config file exists, applyConfigSchema is a no-op and we fall back
	// to the full legacy CLI + wizard behaviour.
	await applyConfigSchema();

	// When a new-format config file was loaded, suppress the wizard —
	// everything the wizard would ask is already covered by the config.
	if (shared.config._wetmConfig) {
		if (!process.argv.includes('--wizard')) {
			process.argv.push('--wizard', 'false');
		}
	}

	await intake.getConfig();

	const report = createReport();
	report.input = shared.config.input;
	report.output = shared.config.output;

	const plugins = await loadPlugins(
		shared.config.plugins ?? [],
		shared.config._configFile?.value
	);
	if (plugins.length > 0) {
		console.log(chalk.gray(`Plugins loaded: ${plugins.map((p) => p.name).join(', ')}`));
	}

	const parsed = await parser.parseAllInputs();

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

	shared.config._authorRegistry = parsed.authors;

	shared.logHeading('Processing posts');
	const posts = await parser.buildPosts(parsed.allItems, {
		selectedTypes,
		selectedTaxonomies,
		plugins,
		report
	});
	console.log(`${posts.length} posts in scope.`);

	if (shared.config.rewriteLinks) {
		const permalinkMap = buildPermalinkMap(posts, parsed.siteUrl);
		const siteUrls = [parsed.siteUrl, shared.config.siteUrl].filter(Boolean);
		for (const post of posts) {
			const raw = post.data.optionalChildValue('encoded') ?? '';
			post._rewrittenContent = rewriteLinksInContent(raw, permalinkMap, siteUrls);
		}
	}

	const images = [];
	if (shared.config.saveImages === 'attached' || shared.config.saveImages === 'all') {
		images.push(...parser.collectAttachedImages(parsed.allItems, shared.config.attachmentTypes ?? ['gif', 'jpg', 'jpeg', 'png', 'webp']));
	}
	if (shared.config.saveImages === 'scraped' || shared.config.saveImages === 'all') {
		images.push(...parser.collectScrapedImages(parsed.allItems, selectedTypes));
	}
	parser.mergeImagesIntoPosts(images, posts);

	for (const post of posts) {
		await parser.finalizePost(post, { plugins, report });
	}

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

	const reportPaths = await writeReport(report, shared.config.output);
	console.log('\nMigration report:');
	console.log('  ' + reportPaths.txtPath);
	console.log('  ' + reportPaths.jsonPath);

	console.log('\nAll done!');
	console.log('Look for your output files in: ' + path.resolve(shared.config.output));
}
