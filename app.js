#!/usr/bin/env node

// Entry point. Dispatches to the `init` command or the conversion pipeline.
//
// Usage:
//   wetm init [export.xml]        — analyze export, generate starter config
//   wetm [conversion flags...]    — run the conversion (config-file or CLI driven)

import { runInit } from './src/commands/init.js';
import { runConvert } from './src/commands/convert.js';

const firstArg = process.argv[2];

if (firstArg === 'init') {
	// Strip "init" from argv so the init command only sees its own args
	process.argv.splice(2, 1);
	runInit().catch((ex) => {
		console.error('\nError during init:', ex.message);
		process.exit(1);
	});
} else {
	runConvert().catch((ex) => {
		console.log('\nSomething went wrong, execution halted early.');
		console.error(ex);
		process.exit(1);
	});
}
