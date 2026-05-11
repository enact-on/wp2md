// Plugin registry + loader.
// A plugin is { name, onMeta?, onShortcode?, onBlock?, onContent?, onFrontmatter?, onPost? }.

import url from 'url';
import path from 'path';
import * as shared from '../shared.js';
import * as acf from './acf.js';
import * as yoast from './yoast.js';
import * as woocommerce from './woocommerce.js';
import * as rankmath from './rankmath.js';
import * as seopress from './seopress.js';

const BUILTIN = {
	acf:        acf.plugin,
	yoast:      yoast.plugin,
	rankmath:   rankmath.plugin,
	seopress:   seopress.plugin,
	woocommerce: woocommerce.plugin
};

export async function loadPlugins(names, configFile) {
	const plugins = [];

	for (const name of names) {
		if (typeof name === 'object' && name !== null) {
			// Inline plugin object passed directly in the array
			plugins.push(name);
			continue;
		}
		if (BUILTIN[name]) {
			plugins.push(BUILTIN[name]);
			continue;
		}
		// User-supplied file path
		try {
			const resolved = name.startsWith('.') || path.isAbsolute(name)
				? url.pathToFileURL(path.resolve(name)).href
				: `./${name}.js`;
			const mod = await import(resolved);
			if (mod.plugin) plugins.push(mod.plugin);
			else if (mod.default?.name) plugins.push(mod.default);
		} catch (ex) {
			console.warn(`Could not load plugin "${name}": ${ex.message}`);
		}
	}

	// Legacy: plugins array in old-format wetm.config.js
	if (Array.isArray(configFile?.plugins)) {
		for (const p of configFile.plugins) plugins.push(p);
	}

	// Block handlers from old-format config file (not new-format — handled via shared.config)
	if (configFile?.blockHandlers && !configFile?.blocks && Object.keys(configFile.blockHandlers).length > 0) {
		plugins.push(makeBlockHandlersPlugin(configFile.blockHandlers));
	}

	// New-format: blocks.handlers from config-schema (shared.config.blockHandlers)
	const blockHandlers = shared.config.blockHandlers;
	if (blockHandlers && Object.keys(blockHandlers).length > 0) {
		plugins.push(makeBlockHandlersPlugin(blockHandlers));
	}

	// New-format: shortcodes.handlers from config-schema
	const shortcodeHandlers = shared.config.shortcodeHandlers;
	if (shortcodeHandlers && Object.keys(shortcodeHandlers).length > 0) {
		plugins.push(makeShortcodeHandlersPlugin(shortcodeHandlers));
	}

	// New-format: custom plugins from config-schema (inline objects or file paths)
	const customPlugins = shared.config._customPlugins ?? [];
	for (const p of customPlugins) {
		if (typeof p === 'string') {
			try {
				const resolved = url.pathToFileURL(path.resolve(p)).href;
				const mod = await import(resolved);
				if (mod.plugin) plugins.push(mod.plugin);
				else if (mod.default?.name) plugins.push(mod.default);
			} catch (ex) {
				console.warn(`Could not load custom plugin "${p}": ${ex.message}`);
			}
		} else if (p && typeof p === 'object') {
			plugins.push(p);
		}
	}

	return plugins;
}

// Build a plugin from a { 'blockName': handler, 'namespace/*': handler } map.
// handler: 'skip' | 'html' | 'fallback' | (ctx) => string | undefined
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
				if (h === 'fallback') return undefined;
				if (h === 'markdown') return undefined;
				if (typeof h === 'function') return h({ block });
			}
			return undefined;
		}
	};
}

// Build a plugin from a { 'shortcodeName': handler } map.
// handler: 'skip' | 'html' | 'text' | (ctx) => string | undefined
function makeShortcodeHandlersPlugin(handlers) {
	return {
		name: 'config-shortcode-handlers',
		onShortcode(ctx) {
			const h = handlers[ctx.name];
			if (h === undefined) return undefined;
			if (h === 'skip') return '';
			if (h === 'html') return ctx.raw;
			if (h === 'text') return ctx.inner ?? '';
			if (typeof h === 'function') return h(ctx);
			return undefined;
		}
	};
}

export const builtinPluginNames = Object.keys(BUILTIN);
