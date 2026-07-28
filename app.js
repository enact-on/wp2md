#!/usr/bin/env node

// Entry point. Dispatches to subcommands or the conversion pipeline.
//
// Usage:
//   wetm init [export.xml]        — analyze export, generate starter config
//   wetm split [export.xml]       — split export into one JSON file per post/page/type
//   wetm [conversion flags...]    — run the conversion (config-file or CLI driven)

import { runInit } from './src/commands/init.js';
import { runConvert } from './src/commands/convert.js';
import { runSplit } from './src/commands/split.js';

const firstArg = process.argv[2];

if (firstArg === 'init') {
	process.argv.splice(2, 1);
	runInit().catch((ex) => {
		console.error('\nError during init:', ex.message);
		process.exit(1);
	});
} else if (firstArg === 'split') {
	process.argv.splice(2, 1);
	runSplit().catch((ex) => {
		console.error('\nError during split:', ex.message);
		process.exit(1);
	});
} else {
	runConvert().catch((ex) => {
		console.log('\nSomething went wrong, execution halted early.');
		console.error(ex);
		process.exit(1);
	});
}
