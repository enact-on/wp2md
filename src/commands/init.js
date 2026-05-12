// `wetm init [file]` — analyze a WordPress export and write a starter config.

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { analyze } from '../analyzer.js';
import { generate } from '../config-generator.js';

// Extract a short site slug from the XML filename.
// "parkingmd.WordPress.2026-05-12.xml" → "parkingmd"
// "mysite-export.xml" → "mysite-export"
function siteSlugFromFilename(filename) {
	const base = path.basename(filename, path.extname(filename));
	const wpMatch = base.match(/^(.+?)\.WordPress\./i);
	return wpMatch ? wpMatch[1] : base;
}

// Resolve the XML input path. If no argument given, auto-discover from input/.
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
			xmlFiles.forEach((f) => console.error(`  wetm init input/${f}`));
			process.exit(1);
		}
	}

	return path.resolve('export.xml');
}

export async function runInit() {
	const inputArg = process.argv[2];
	const inputPath = resolveInputPath(inputArg);

	if (!fs.existsSync(inputPath)) {
		console.error(chalk.red(`Export file not found: ${inputPath}`));
		console.error('Usage: wetm init [path/to/export.xml]');
		console.error('       Drop your XML into input/ and run wetm init with no arguments.');
		process.exit(1);
	}

	const siteSlug = siteSlugFromFilename(inputPath);
	const outputDir = `output/${siteSlug}`;

	// Configs live in input/ (gitignored) alongside the XML files
	const inputDir = path.resolve('input');
	if (!fs.existsSync(inputDir)) fs.mkdirSync(inputDir);
	const configFilename = `wetm.config.${siteSlug}.js`;
	const configFilePath = path.join(inputDir, configFilename);

	// Refuse to overwrite an existing config — require explicit deletion
	if (fs.existsSync(configFilePath)) {
		console.warn(chalk.yellow(`Config already exists: input/${configFilename}`));
		console.warn(chalk.yellow(`Delete it first if you want to regenerate.`));
		process.exit(1);
	}

	console.log(chalk.cyan('\nAnalyzing export file...'));
	const findings = await analyze(inputPath);

	const postTypeList = findings.postTypes.map((t) => `  ${t.type} (${t.count})`).join('\n');
	const pluginList = findings.detectedPlugins.length > 0
		? findings.detectedPlugins.join(', ')
		: 'none';

	console.log(`\nFound:`);
	console.log(postTypeList);
	if (findings.taxonomies.length > 0) {
		console.log(`  Custom taxonomies: ${findings.taxonomies.join(', ')}`);
	}
	console.log(`  Plugins detected: ${chalk.green(pluginList)}`);
	if (findings.detectedBuilders.length > 0) {
		console.log(`  Page builders: ${chalk.yellow(findings.detectedBuilders.join(', '))}`);
	}
	console.log(`  Meta keys: ${findings.metaKeys.length}`);
	console.log(`  Blocks: ${findings.blocks.length}, Shortcodes: ${findings.shortcodes.length}`);

	const relativeInput = path.relative(process.cwd(), inputPath).replace(/\\/g, '/');
	const configContent = generate(findings, relativeInput, { outputDir });

	await fs.promises.writeFile(configFilePath, configContent, 'utf8');

	console.log(chalk.green(`\nWrote input/${configFilename}`));
	console.log(`Output will go to: ${chalk.cyan(outputDir)}`);
	console.log(`Review the file, uncomment the rules you need, then run: ${chalk.bold(`node app.js --config input/${configFilename}`)}`);
}
