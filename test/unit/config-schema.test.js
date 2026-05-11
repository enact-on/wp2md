#!/usr/bin/env node
// Unit tests for src/config-schema.js

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMetaRules } from '../../src/config-schema.js';
import * as shared from '../../src/shared.js';

// Reset shared.config before each test so tests are isolated
beforeEach(() => {
	for (const key of Object.keys(shared.config)) {
		delete shared.config[key];
	}
	for (const key of Object.keys(shared.postTypeConfig)) {
		if (key !== 'post' && key !== 'page') delete shared.postTypeConfig[key];
	}
	// Reset standard post type folders to defaults
	shared.postTypeConfig.post = { folder: 'posts' };
	shared.postTypeConfig.page = { folder: 'pages' };
});

// ── normalizeMetaRules ────────────────────────────────────────────────────────

test('normalizeMetaRules: handles object form with mode+alias', () => {
	const result = normalizeMetaRules({
		'_price': { mode: 'frontmatter', alias: 'price' },
		'_bio':   { mode: 'complex' },
		'_junk':  { mode: 'skip' },
	});
	assert.equal(result['_price'].mode, 'frontmatter');
	assert.equal(result['_price'].alias, 'price');
	assert.equal(result['_bio'].mode, 'complex');
	assert.equal(result['_junk'].mode, 'skip');
});

test('normalizeMetaRules: handles shorthand string form', () => {
	const result = normalizeMetaRules({
		'_field': 'skip',
		'_data':  'frontmatter',
		'_obj':   'complex',
	});
	assert.equal(result['_field'].mode, 'skip');
	assert.equal(result['_data'].mode, 'frontmatter');
	assert.equal(result['_obj'].mode, 'complex');
});

test('normalizeMetaRules: rejects invalid mode', () => {
	const result = normalizeMetaRules({
		'_bad': { mode: 'invalid' },
	});
	assert.equal(result['_bad'], undefined);
});

test('normalizeMetaRules: preserves transform function', () => {
	const fn = (v) => Number(v);
	const result = normalizeMetaRules({
		'_price': { mode: 'frontmatter', transform: fn },
	});
	assert.equal(result['_price'].transform, fn);
});

test('normalizeMetaRules: strips non-function transform', () => {
	const result = normalizeMetaRules({
		'_price': { mode: 'frontmatter', transform: 'Number' },
	});
	assert.equal(result['_price'].transform, undefined);
});

test('normalizeMetaRules: handles null/undefined rules gracefully', () => {
	assert.deepEqual(normalizeMetaRules(null), {});
	assert.deepEqual(normalizeMetaRules(undefined), {});
	assert.deepEqual(normalizeMetaRules({}), {});
});
