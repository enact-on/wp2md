#!/usr/bin/env node
// Unit tests for src/analyzer.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyze } from '../../src/analyzer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, '../fixtures/export.xml');

// Run all tests against the fixture export
const findings = await analyze(FIXTURE);

test('detects site URL', () => {
	assert.equal(findings.siteUrl, 'https://example.com');
});

test('detects all post types with correct counts', () => {
	const typeMap = Object.fromEntries(findings.postTypes.map((t) => [t.type, t.count]));
	assert.equal(typeMap.post, 1, 'post count');
	assert.equal(typeMap.page, 1, 'page count');
	assert.equal(typeMap.case_study, 1, 'case_study count');
	assert.equal(typeMap.product, 1, 'product count');
});

test('post types are sorted: post first, page second, then alpha', () => {
	assert.equal(findings.postTypes[0].type, 'post');
	assert.equal(findings.postTypes[1].type, 'page');
});

test('detects custom taxonomy "industry"', () => {
	assert.ok(findings.taxonomies.includes('industry'), 'industry taxonomy missing');
});

test('does not include standard taxonomies in custom list', () => {
	for (const std of ['category', 'post_tag', 'post_format']) {
		assert.ok(!findings.taxonomies.includes(std), `standard taxonomy "${std}" should not be in custom list`);
	}
});

test('collects meta keys with counts', () => {
	const keyMap = Object.fromEntries(findings.metaKeys.map((m) => [m.key, m]));
	// Yoast keys from hello-world post
	assert.ok(keyMap['_yoast_wpseo_title'], '_yoast_wpseo_title not found');
	assert.ok(keyMap['_yoast_wpseo_metadesc'], '_yoast_wpseo_metadesc not found');
	// WooCommerce keys from product post
	assert.ok(keyMap['_price'], '_price not found');
	assert.ok(keyMap['_sku'], '_sku not found');
	// ACF reference key from case_study
	assert.ok(keyMap['_field_client_name'], '_field_client_name not found');
});

test('meta keys sorted by count descending', () => {
	for (let i = 0; i < findings.metaKeys.length - 1; i++) {
		assert.ok(
			findings.metaKeys[i].count >= findings.metaKeys[i + 1].count,
			`meta key at index ${i} has lower count than index ${i + 1}`
		);
	}
});

test('detects Yoast SEO plugin', () => {
	assert.ok(findings.detectedPlugins.includes('yoast'), 'yoast not detected');
});

test('detects WooCommerce plugin', () => {
	assert.ok(findings.detectedPlugins.includes('woocommerce'), 'woocommerce not detected');
});

test('detects ACF plugin', () => {
	assert.ok(findings.detectedPlugins.includes('acf'), 'acf not detected');
});

test('detects Gutenberg blocks', () => {
	const blockNames = findings.blocks.map((b) => b.name);
	assert.ok(blockNames.includes('core/paragraph'), 'core/paragraph not found');
	assert.ok(blockNames.includes('core/image'), 'core/image not found');
});

test('does not include built-in shortcodes in shortcode list', () => {
	const scNames = findings.shortcodes.map((s) => s.name);
	assert.ok(!scNames.includes('caption'), 'caption should be filtered as built-in');
});

test('returns sample values for meta keys', () => {
	const yoastTitle = findings.metaKeys.find((m) => m.key === '_yoast_wpseo_title');
	assert.ok(yoastTitle, '_yoast_wpseo_title not found');
	assert.ok(yoastTitle.sampleValues.length > 0, 'no sample values');
	assert.ok(yoastTitle.sampleValues[0].includes('Hello'), 'unexpected sample value');
});

test('blocks are sorted by count descending', () => {
	for (let i = 0; i < findings.blocks.length - 1; i++) {
		assert.ok(
			findings.blocks[i].count >= findings.blocks[i + 1].count,
			`block at index ${i} has lower count than index ${i + 1}`
		);
	}
});
