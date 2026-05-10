import xml2js from 'xml2js';

// Thin wrapper around the parsed xml2js node tree. Provides safe accessors
// (`childValue`, `optionalChildValue`) plus helpers used by the rest of the
// pipeline so individual modules don't have to repeat null/exception plumbing.
class Data {
	#obj;
	#expression;

	constructor(obj, expression) {
		// xml2js returns leaf nodes as strings, turn those into consistent objects
		this.#obj = typeof obj === 'string' ? { _: obj } : obj;
		this.#expression = expression;
	}

	#buildExpression(propName, index = undefined) {
		let expression = `${this.#expression}.${propName}`;
		if (index !== undefined) {
			expression += `[${index}]`;
		}
		return expression;
	}

	#optional(func) {
		try {
			return func();
		} catch (ex) {
			return undefined;
		}
	}

	// --- existing surface --------------------------------------------------

	children(propName) {
		const nodes = this.#obj[propName] ?? [];
		return nodes.map((value, index) => new Data(value, this.#buildExpression(propName, index)));
	}

	child(propName, index = 0) {
		const nodes = this.#obj[propName];
		if (nodes === undefined) {
			throw new Error(`Could not find ${this.#buildExpression(propName)}.`);
		}
		const node = nodes[index];
		if (node === undefined) {
			throw new Error(`Could not find ${this.#buildExpression(propName, index)}.`);
		}
		return new Data(node, this.#buildExpression(propName, index));
	}

	childValue(propName, index = 0) {
		return this.child(propName, index).value();
	}

	value() {
		const value = this.#obj._;
		if (value === undefined) {
			throw new Error(`Could not get value from ${this.#expression}.`);
		}
		return value;
	}

	attribute(attrName) {
		const attribute = this.#obj.$?.[attrName];
		if (attribute === undefined) {
			throw new Error(`Could not get attribute ${attrName} from ${this.#expression}.`);
		}
		return attribute;
	}

	optionalChild(propName, index = 0) {
		return this.#optional(() => this.child(propName, index));
	}

	optionalChildValue(propName, index = 0) {
		return this.#optional(() => this.childValue(propName, index));
	}

	optionalValue() {
		return this.#optional(() => this.value());
	}

	// --- new helpers -------------------------------------------------------

	// Like `attribute` but returns undefined instead of throwing.
	optionalAttribute(attrName) {
		return this.#optional(() => this.attribute(attrName));
	}

	// Convenience: URI-decode a child value (slugs, names from <category nicename>).
	decodedChildValue(propName, index = 0) {
		const v = this.optionalChildValue(propName, index);
		if (typeof v !== 'string') return v;
		try { return decodeURIComponent(v); } catch { return v; }
	}

	// Get every child element whose name matches; equivalent to children()
	// but returns the underlying nodes (used by code that does its own
	// iteration). Kept separate so we don't mutate semantics of `children()`.
	rawChildren(propName) {
		return this.#obj[propName] ?? [];
	}

	// Find first child of `propName` for which `predicate(childData)` is true.
	findChild(propName, predicate) {
		for (const child of this.children(propName)) {
			try {
				if (predicate(child)) return child;
			} catch { /* ignore */ }
		}
		return undefined;
	}

	// All postmeta as { key, value } pairs (raw value, no decoding).
	postMetaPairs() {
		return this.children('postmeta')
			.map((m) => ({
				key: m.optionalChildValue('meta_key'),
				value: m.optionalChildValue('meta_value')
			}))
			.filter((p) => p.key !== undefined);
	}

	// Look up a single postmeta value by key (raw, undefined if missing).
	postMeta(key) {
		const m = this.findChild('postmeta', (c) => c.optionalChildValue('meta_key') === key);
		return m ? m.optionalChildValue('meta_value') : undefined;
	}

	// All <category> nodes for the given taxonomy domain.
	terms(domain) {
		return this.children('category')
			.filter((c) => c.optionalAttribute('domain') === domain)
			.map((c) => ({
				slug: safeDecode(c.optionalAttribute('nicename')),
				name: safeDecode(c.optionalValue())
			}));
	}

	// True if the underlying object has the named child element.
	has(propName) {
		return Array.isArray(this.#obj[propName]) && this.#obj[propName].length > 0;
	}

	// True if the underlying object has the named attribute.
	hasAttribute(attrName) {
		return this.#obj.$ !== undefined && this.#obj.$[attrName] !== undefined;
	}
}

function safeDecode(value) {
	if (typeof value !== 'string') return value;
	try { return decodeURIComponent(value); } catch { return value; }
}

export async function load(content) {
	const rootData = await xml2js.parseStringPromise(content, {
		tagNameProcessors: [xml2js.processors.stripPrefix],
		trim: true
	}).catch((ex) => {
		ex.message = 'Could not parse XML. This likely means your import file is malformed.\n\n' + ex.message;
		throw ex;
	});

	const rssData = rootData.rss;
	if (rssData === undefined) {
		throw new Error('Could not find <rss> root node. This likely means your import file is malformed.');
	}

	return new Data(rssData, 'rss');
}
