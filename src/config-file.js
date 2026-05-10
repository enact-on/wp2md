// Loads an optional `wetm.config.{js,mjs,json}` from cwd (or an explicit
// `--config` path). The config file lets users register plugins and hard-pin
// per-site rules instead of memorizing CLI flags.

import fs from 'fs';
import path from 'path';
import url from 'url';

const FILENAMES = ['wetm.config.js', 'wetm.config.mjs', 'wetm.config.json'];

export async function loadConfigFile(explicitPath) {
	let target;
	if (explicitPath) {
		target = path.resolve(explicitPath);
		if (!fs.existsSync(target)) {
			throw new Error(`Config file not found: ${target}`);
		}
	} else {
		for (const name of FILENAMES) {
			const candidate = path.resolve(name);
			if (fs.existsSync(candidate)) {
				target = candidate;
				break;
			}
		}
		if (!target) return null;
	}

	const ext = path.extname(target).toLowerCase();
	if (ext === '.json') {
		const raw = await fs.promises.readFile(target, 'utf8');
		return { path: target, value: JSON.parse(raw) };
	}
	const mod = await import(url.pathToFileURL(target).href);
	return { path: target, value: mod.default ?? mod.config ?? mod };
}
