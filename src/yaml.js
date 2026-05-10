import yaml from 'yaml';
import * as luxon from 'luxon';
import * as shared from './shared.js';

// Convert internal frontmatter values into something the YAML stringifier can serialize cleanly.
function normalize(value) {
	if (value === undefined || value === null) {
		return undefined;
	}

	if (value instanceof luxon.DateTime) {
		if (shared.config.dateFormat) {
			return value.toFormat(shared.config.dateFormat);
		}
		return shared.config.includeTime ? value.toISO() : value.toISODate();
	}

	if (Array.isArray(value)) {
		const items = value.map((item) => normalize(item)).filter((item) => item !== undefined);
		return items.length > 0 ? items : undefined;
	}

	if (typeof value === 'object') {
		const out = {};
		for (const [key, val] of Object.entries(value)) {
			const normalized = normalize(val);
			if (normalized !== undefined) {
				out[key] = normalized;
			}
		}
		return Object.keys(out).length > 0 ? out : undefined;
	}

	if (typeof value === 'string' && value.length === 0) {
		return undefined;
	}

	return value;
}

export function stringify(frontmatter) {
	const cleaned = {};
	for (const [key, value] of Object.entries(frontmatter)) {
		const normalized = normalize(value);
		if (normalized !== undefined) {
			cleaned[key] = normalized;
		}
	}

	if (Object.keys(cleaned).length === 0) {
		return '';
	}

	const body = yaml.stringify(cleaned, {
		lineWidth: 0, // do not wrap long strings
		defaultStringType: 'QUOTE_DOUBLE',
		defaultKeyType: 'PLAIN',
		singleQuote: false,
		blockQuote: 'literal'
	});

	return body;
}
