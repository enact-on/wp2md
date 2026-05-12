// Wrapper around the `php-unserialize` package with safer fallback semantics.
// Returns `{ ok: boolean, value?: any }` so callers can distinguish "decoded
// PHP-serialized blob" from "looks like serialized but failed to parse".

import * as php from 'php-unserialize';

const SERIALIZED_PREFIX = /^([adObsiNb]):/;

export function looksSerialized(str) {
	if (typeof str !== 'string') return false;
	return SERIALIZED_PREFIX.test(str.trim());
}

export function tryUnserialize(str) {
	if (!looksSerialized(str)) {
		return { ok: false };
	}
	try {
		const value = php.unserialize(str);
		return { ok: true, value: phpAssocToObject(value) };
	} catch {
		return { ok: false };
	}
}

// php-unserialize returns mixed arrays/objects. Normalize to plain JS objects/arrays.
function phpAssocToObject(value) {
	if (Array.isArray(value)) {
		return value.map(phpAssocToObject);
	}
	if (value && typeof value === 'object') {
		const keys = Object.keys(value);
		// detect a numerically-indexed PHP array starting at 0.
		// Empty objects from php-unserialize always represent a:0:{} (empty PHP array),
		// so treat length === 0 as array too (vacuous truth: [].every(...) === true).
		const looksArray = keys.every((k, i) => String(i) === k);
		if (looksArray) {
			return keys.map((k) => phpAssocToObject(value[k]));
		}
		const out = {};
		for (const k of keys) {
			out[k] = phpAssocToObject(value[k]);
		}
		return out;
	}
	return value;
}
