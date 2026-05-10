import fs from 'fs';
import path from 'path';

export function boolean(value) {
	if (typeof value === 'boolean') {
		return value;
	} else if (value === 'true') {
		return true;
	} else if (value === 'false') {
		return false;
	}

	throw new Error('Must be true or false.');
}

export function string(value) {
	return value;
}

// Used by the legacy `file-path` question type. Kept for backward compatibility
// but `--input` now also accepts directories and globs (see input.js).
export function filePath(value) {
	const unwrapped = value.replace(/"(.*?)"/, '$1');
	const absolute = path.resolve(unwrapped);

	let fileExists;
	try {
		fileExists = fs.existsSync(absolute) && fs.statSync(absolute).isFile();
	} catch (ex) {
		fileExists = false;
	}

	if (fileExists) {
		return absolute;
	}

	throw new Error('File not found at ' + absolute + '.');
}

export function list(value) {
	if (Array.isArray(value)) {
		return value;
	} else {
		const trimmed = value.trim();
		if (trimmed.length === 0) return [];
		return trimmed.split(/\s*,\s*/);
	}
}

export function integer(value) {
	const int = parseInt(value);
	if (!Number.isNaN(int) && int >= 0) {
		return int;
	}

	throw new Error('Must be an integer >= 0.');
}
