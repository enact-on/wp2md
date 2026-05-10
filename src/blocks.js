// Detects Gutenberg block comments (<!-- wp:blockname {...} -->) so we can
// surface them in the migration report and let plugins map them to JSX.

const BLOCK_OPEN_RE = /<!--\s*wp:([a-zA-Z0-9\/\-_]+)(\s+\{[^}]*\})?\s*(\/?)-->/g;

export function findBlocks(content) {
	if (!content) return [];
	const blocks = new Set();
	let m;
	const re = new RegExp(BLOCK_OPEN_RE.source, 'g');
	while ((m = re.exec(content)) !== null) {
		blocks.add(m[1]);
	}
	return [...blocks];
}

// Strip Gutenberg comments after plugin block handlers have had a chance to
// consume them (turndown leaves them behind otherwise, polluting MDX output).
export function stripBlockComments(content) {
	if (!content) return content;
	return content.replace(/<!--\s*\/?wp:[^>]*-->/g, '');
}
