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
	// blockHandlers in the config file are converted into a plugin that runs
	// after all explicit plugins but before the Gutenberg built-in renderers.
	// This lets users handle entire builder namespaces (elementor/*, kadence/*)
	// without writing a full plugin.
	if (configFile?.blockHandlers && Object.keys(configFile.blockHandlers).length > 0) {
		plugins.push(makeBlockHandlersPlugin(configFile.blockHandlers));
	}
	return plugins;
}

// Build a plugin from a { 'blockName': handler, 'namespace/*': handler } map.
// handler can be:
//   'skip'     - omit the block from output
//   'html'     - keep the raw innerHTML (good in MDX contexts)
//   'markdown' - fall through to generic HTML→MD conversion
//   function   - (block) => string | null | undefined
function makeBlockHandlersPlugin(handlers) {
	const entries = Object.entries(handlers).map(([pattern, handler]) => {
		const wildcard = pattern.endsWith('/*');
		const prefix   = wildcard ? pattern.slice(0, -1) : null; // 'elementor/'
		return { pattern, wildcard, prefix, handler };
	});

	return {
		name: 'config-block-handlers',
		onBlock({ block }) {
			const name = block.blockName ?? '';
			for (const e of entries) {
				const matches = e.wildcard ? name.startsWith(e.prefix) : name === e.pattern;
				if (!matches) continue;
				const h = e.handler;
				if (h === 'skip')     return '';
				if (h === 'html')     return block.innerHTML ?? '';
				if (h === 'markdown') return undefined;
				if (typeof h === 'function') return h(block);
			}
			return undefined;
		}
	};
}

export const builtinPluginNames = Object.keys(BUILTIN);
