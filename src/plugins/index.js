// Plugin registry + loader. A plugin is `{ name, onMeta?, onShortcode?, onBlock? }`.

import * as acf from './acf.js';
import * as yoast from './yoast.js';
import * as woocommerce from './woocommerce.js';
import * as rankmath from './rankmath.js';

const BUILTIN = {
	acf: acf.plugin,
	yoast: yoast.plugin,
	rankmath: rankmath.plugin,
	woocommerce: woocommerce.plugin
};

export async function loadPlugins(names, configFile) {
	const plugins = [];
	for (const name of names) {
		if (BUILTIN[name]) {
			plugins.push(BUILTIN[name]);
			continue;
		}
		// allow user-supplied path
		try {
			const mod = await import(name.startsWith('.') || name.includes('/') ? name : `./${name}.js`);
			if (mod.plugin) plugins.push(mod.plugin);
		} catch (ex) {
			console.warn(`Could not load plugin "${name}": ${ex.message}`);
		}
	}
	if (configFile?.plugins) {
		for (const p of configFile.plugins) plugins.push(p);
	}
	return plugins;
}

export const builtinPluginNames = Object.keys(BUILTIN);
