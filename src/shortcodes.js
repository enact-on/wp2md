// Lightweight shortcode handling. We extract every shortcode encountered so the
// migration report can list unknowns, and we provide a small set of built-in
// rewrites (caption, gallery, embed). Project-specific mappings can be added
// via the plugin API (`onShortcode`).

// Shortcode pattern: `[name attrs]inner[/name]` or self-closing `[name attrs]`.
// We deliberately exclude matches immediately followed by `(` because that is
// a markdown link, not a shortcode.
const SHORTCODE_RE = /\[(\/?)([a-zA-Z][a-zA-Z0-9_\-]*)([^\]]*?)\](?!\()(?:([\s\S]*?)\[\/\2\])?/g;

export function findShortcodes(content) {
	if (!content) return [];
	const out = [];
	let match;
	const re = new RegExp(SHORTCODE_RE.source, 'g');
	while ((match = re.exec(content)) !== null) {
		if (match[1] === '/') continue;
		out.push({ name: match[2], attrs: parseAttrs(match[3]), inner: match[4] ?? '' });
	}
	return out;
}

function parseAttrs(attrString) {
	const attrs = {};
	const re = /([a-zA-Z0-9_\-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s\]]+))/g;
	let m;
	while ((m = re.exec(attrString)) !== null) {
		attrs[m[1]] = m[3] ?? m[4] ?? m[5] ?? '';
	}
	return attrs;
}

export function applyShortcodes(content, plugins, report) {
	if (!content) return content;
	const re = new RegExp(SHORTCODE_RE.source, 'g');
	return content.replace(re, (full, closing, name, attrString, inner, offset, string) => {
		if (closing) return full;
		const attrs = parseAttrs(attrString);
		// give plugins first dibs
		for (const plugin of plugins) {
			if (typeof plugin.onShortcode === 'function') {
				const replacement = plugin.onShortcode({ name, attrs, inner, raw: full });
				if (replacement !== undefined) {
					return replacement;
				}
			}
		}
		// built-ins
		switch (name) {
			case 'caption': {
				// strip the wrapper but keep inner content
				return (inner ?? '').trim();
			}
			case 'embed': {
				// inner is usually a URL
				return inner ?? '';
			}
			case 'audio':
			case 'video': {
				const src = attrs.src ?? attrs.mp3 ?? attrs.mp4 ?? '';
				return src ? `<${name} src="${src}" controls></${name}>` : full;
			}
		}
		// unknown shortcode: track and pass through.
		// Skip tracking if the match is inside a Gutenberg block comment —
		// JSON array syntax like [null,"",""] in block attribute strings
		// matches the shortcode regex but is not a real shortcode.
		if (report) {
			const before = string.lastIndexOf('<!--', offset);
			const close = before >= 0 ? string.indexOf('-->', before) : -1;
			const inBlockComment = before >= 0 && (close < 0 || close > offset);
			if (!inBlockComment) {
				report.unknownShortcodes ??= {};
				report.unknownShortcodes[name] = (report.unknownShortcodes[name] ?? 0) + 1;
			}
		}
		return full;
	});
}
