// MDX-safe escaping helpers and serialization of `export const` blocks.

// Escape characters that MDX would parse as JSX. We are conservative so as not
// to mangle code blocks or inline code; escape only outside of fenced/inline
// code regions.
export function escapeForMdx(content) {
	if (!content) return content;

	const segments = splitByCode(content);
	for (let i = 0; i < segments.length; i++) {
		if (segments[i].code) continue;
		segments[i].text = segments[i].text.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
	}
	return segments.map((s) => s.text).join('');
}

function splitByCode(content) {
	// Split on fenced code blocks (```...```) and inline code (`...`).
	const out = [];
	const re = /(```[\s\S]*?```|`[^`\n]*`)/g;
	let last = 0;
	let m;
	while ((m = re.exec(content)) !== null) {
		if (m.index > last) out.push({ text: content.slice(last, m.index), code: false });
		out.push({ text: m[0], code: true });
		last = m.index + m[0].length;
	}
	if (last < content.length) out.push({ text: content.slice(last), code: false });
	return out;
}

// Build the leading `export const` block for an MDX file from collected exports.
export function buildExportBlock(exports) {
	if (!exports || exports.length === 0) return '';
	return exports
		.map(({ name, value }) => `export const ${name} = ${stringifyJs(value)};`)
		.join('\n') + '\n\n';
}

// Stringify a JS value in a JSX-friendly way: 2-space indent, double quotes.
function stringifyJs(value, indent = 0) {
	const pad = '  '.repeat(indent);
	const padNext = '  '.repeat(indent + 1);

	if (value === null) return 'null';
	if (value === undefined) return 'undefined';
	if (typeof value === 'number') return String(value);
	if (typeof value === 'boolean') return String(value);
	if (typeof value === 'string') return JSON.stringify(value);

	if (Array.isArray(value)) {
		if (value.length === 0) return '[]';
		const items = value.map((v) => `${padNext}${stringifyJs(v, indent + 1)}`);
		return `[\n${items.join(',\n')}\n${pad}]`;
	}

	if (typeof value === 'object') {
		const entries = Object.entries(value);
		if (entries.length === 0) return '{}';
		const items = entries.map(([k, v]) => {
			const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
			return `${padNext}${key}: ${stringifyJs(v, indent + 1)}`;
		});
		return `{\n${items.join(',\n')}\n${pad}}`;
	}

	return JSON.stringify(value);
}
