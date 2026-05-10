import turndownPluginGfm from '@guyplusplus/turndown-plugin-gfm';
import turndown from 'turndown';
import * as shared from './shared.js';
import { stripBlockComments } from './blocks.js';
import { applyShortcodes } from './shortcodes.js';
import { escapeForMdx } from './mdx.js';
import { renderBlocks, isBlockContent } from './gutenberg.js';

const turndownService = initTurndownService();

function initTurndownService() {
	const t = new turndown({
		headingStyle: 'atx',
		bulletListMarker: '-',
		codeBlockStyle: 'fenced'
	});

	t.use(turndownPluginGfm.tables);

	t.remove(['style']);

	t.addRule('tweet', {
		filter: (node) => node.nodeName === 'BLOCKQUOTE' && node.getAttribute('class') === 'twitter-tweet',
		replacement: (content, node) => '\n\n' + node.outerHTML
	});

	t.addRule('codepen', {
		filter: (node) => {
			return (
				['P', 'DIV'].includes(node.nodeName) &&
				node.attributes['data-slug-hash'] &&
				node.getAttribute('class') === 'codepen'
			);
		},
		replacement: (content, node) => '\n\n' + node.outerHTML
	});

	t.addRule('div', {
		filter: (node) => {
			return node.nodeName === 'DIV' && node.closest('a') !== null;
		},
		replacement: (content) => content
	});

	t.addRule('script', {
		filter: 'script',
		replacement: (content, node) => {
			let before = '\n\n';
			if (node.previousSibling && node.previousSibling.nodeName !== '#text') {
				before = '\n';
			}
			const html = node.outerHTML.replace('async=""', 'async');
			return before + html + '\n\n';
		}
	});

	t.addRule('iframe', {
		filter: 'iframe',
		replacement: (content, node) => {
			const html = node.outerHTML
				.replace('allowfullscreen=""', 'allowfullscreen')
				.replace('allowpaymentrequest=""', 'allowpaymentrequest');
			return '\n\n' + html + '\n\n';
		}
	});

	t.addRule('figure', {
		filter: 'figure',
		replacement: (content, node) => {
			if (node.querySelector('figcaption')) {
				const result = '\n\n<figure>\n\n' + content + '\n\n</figure>\n\n';
				return result.replace('\n\n\n\n', '\n\n');
			} else {
				return '\n' + content + '\n';
			}
		}
	});

	t.addRule('figcaption', {
		filter: 'figcaption',
		replacement: (content) => {
			return '\n\n<figcaption>\n\n' + content + '\n\n</figcaption>\n\n';
		}
	});

	t.addRule('pre', {
		filter: (node) => {
			return node.nodeName === 'PRE' && !node.querySelector('code');
		},
		replacement: (content, node) => {
			const language = node.getAttribute('data-wetm-language') ?? '';
			return '\n\n```' + language + '\n' + node.textContent + '\n```\n\n';
		}
	});

	return t;
}

// Pure HTML -> markdown via turndown (used as a fallback inside the Gutenberg
// renderer and for non-block content).
function htmlToMarkdown(html) {
	if (!html) return '';
	let s = html.replace(/(\r?\n){2}/g, '\n<div></div>\n');
	if (shared.config.saveImages === 'scraped' || shared.config.saveImages === 'all') {
		s = s.replace(/(<img(?=\s)[^>]+?(?<=\s)src=")[^"]*?([^/"]+?)(\?[^"]*)?("[^>]*>)/gi, '$1images/$2$4');
	}
	s = s.replace(/<(!--more( .*)?--)>/, '&lt;$1&gt;');
	s = s.replace(/(<!-- wp:.+? \{"language":"(.+?)"\} -->\r?\n<pre )/g, '$1data-wetm-language="$2" ');
	return turndownService.turndown(s);
}

export async function getPostContent(content, ctx = {}) {
	if (!content) return { content: '', forcedMdx: false };
	const { plugins = [], shortcodeReport, report, isMdx = false } = ctx;

	// Apply shortcodes on the RAW HTML before any markdown conversion so square
	// brackets aren't markdown-escaped by turndown (whether the Gutenberg parser
	// path or the legacy turndown path is used).
	let body = applyShortcodes(content, plugins, shortcodeReport);

	let forcedMdx = false;

	if (shared.config.gutenbergParser !== false && isBlockContent(body)) {
		const result = await renderBlocks(body, {
			plugins,
			turndownFn: htmlToMarkdown,
			report
		});
		if (result.rendered !== undefined) {
			body = result.rendered;
			if (result.hasJsx) forcedMdx = true;
		}
	} else {
		body = stripBlockComments(body);
		body = htmlToMarkdown(body);
	}

	// clean up
	body = body.replace(/(-|\d+\.) +/g, '$1 ');
	body = body.replace(/(\r?\n){3,}/g, '\n\n');

	if (isMdx || forcedMdx) {
		body = escapeForMdx(body);
	}

	return { content: body, forcedMdx };
}
