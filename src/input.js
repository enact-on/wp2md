// Resolve `--input` to one or more XML files. Supports a single path, a
// directory (recursively picking up *.xml), or a glob.

import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';

export async function resolveInputs(input) {
	if (!input) throw new Error('No input file or pattern provided.');

	const candidates = [];
	const normalized = input.replace(/\\/g, '/');

	if (fs.existsSync(input)) {
		const stat = fs.statSync(input);
		if (stat.isDirectory()) {
			candidates.push(...await fg('**/*.xml', { cwd: input, absolute: true }));
		} else {
			candidates.push(path.resolve(input));
		}
	} else if (normalized.includes('*') || normalized.includes('?')) {
		candidates.push(...await fg(normalized, { absolute: true }));
	} else {
		throw new Error(`Input not found: ${input}`);
	}

	if (candidates.length === 0) {
		throw new Error(`No XML files matched: ${input}`);
	}
	return candidates;
}

export function dedupePosts(allItems) {
	// Items keyed by post_id; later wins (which usually means later split file).
	const byId = new Map();
	for (const item of allItems) {
		let id;
		try {
			id = item.optionalChildValue('post_id');
		} catch {
			id = undefined;
		}
		const key = id ?? Symbol('no-id');
		byId.set(key, item);
	}
	return [...byId.values()];
}
