// `wetm init [file]` — analyze a WordPress export and write a starter config.

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { analyze } from '../analyzer.js';
import { generate } from '../config-generator.js';

const CONFIG_FILENAME = 'wetm.config.js';
const FILENAMES = ['wetm.config.js', 'wetm.config.mjs', 'wetm.config.json'];

export async function runInit() {
	const inputArg = process.argv[2] || 'export.xml';
	const inputPath = path.resolve(inputArg);

	if (!fs.existsSync(inputPath)) {
		console.error(chalk.red(`Export file not found: ${inputPath}`));
		console.error('Usage: wetm init [export.xml]');
		process.exit(1);
	}

	// Warn if a config already exists
	const existing = FILENAMES.find((f) => fs.existsSync(path.resolve(f)));
	if (existing) {
		console.warn(chalk.yellow(`Warning: ${existing} already exists — it will be overwritten.`));
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
	const configContent = generate(findings, relativeInput);

	const outPath = path.resolve(CONFIG_FILENAME);
	await fs.promises.writeFile(outPath, configContent, 'utf8');

	console.log(chalk.green(`\nWrote ${CONFIG_FILENAME}`));
	console.log('Review the file, uncomment the rules you need, then run: wetm');
}
