#!/usr/bin/env node
// Unit tests for src/config-generator.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../../src/config-generator.js';

// Representative findings as returned by analyzer
const FINDINGS = {
	siteUrl: 'https://example.com',
	postTypes: [
		{ type: 'post', count: 142 },
		{ type: 'page', count: 23 },
		{ type: 'product', count: 847 },
	],
	taxonomies: ['industry', 'product_cat'],
	metaKeys: [
		{ key: '_yoast_wpseo_title',   count: 142, sampleValues: ['SEO title'] },
		{ key: '_yoast_wpseo_metadesc',count: 142, sampleValues: ['desc'] },
		{ key: '_price',               count: 847, sampleValues: ['49.99'] },
		{ key: '_sku',                 count: 847, sampleValues: ['WID-001'] },
		{ key: '_field_my_field',      count: 142, sampleValues: ['field_abc123'] }, // ACF ref
		{ key: 'client_name',          count: 50,  sampleValues: ['Acme Corp'] },
		{ key: 'reading_time',         count: 142, sampleValues: ['5'] },
		{ key: '_edit_lock',           count: 142, sampleValues: [] },               // internal
	],
	blocks: [
		{ name: 'core/paragraph', count: 400 },
		{ name: 'core/image',     count: 120 },
		{ name: 'acf/hero',       count: 30 },
		{ name: 'acf/cta',        count: 15 },
	],
	shortcodes: [
		{ name: 'product',   count: 171 },
		{ name: 'vc_column', count: 5 },
	],
	detectedPlugins: ['yoast', 'woocommerce', 'acf'],
	detectedBuilders: ['wpbakery'],
};

const output = generate(FINDINGS, 'export.xml');

test('output is a non-empty string', () => {
	assert.equal(typeof output, 'string');
	assert.ok(output.length > 100);
});

test('contains export default block', () => {
	assert.ok(output.includes('export default {'), 'missing export default');
});

test('contains site URL', () => {
	assert.ok(output.includes('"https://example.com"'), 'site URL missing');
});

test('lists all detected post types', () => {
	assert.ok(output.includes('post:'), 'post type missing');
	assert.ok(output.includes('page:'), 'page type missing');
	assert.ok(output.includes('product:'), 'product type missing');
});

test('post type folders use correct defaults', () => {
	assert.ok(output.includes('folder: "posts"'), 'post folder wrong');
	assert.ok(output.includes('folder: "pages"'), 'page folder wrong');
	assert.ok(output.includes('folder: "product"'), 'product folder wrong');
});

test('includes custom taxonomies in enabled list', () => {
	assert.ok(output.includes('"industry"'), 'industry taxonomy missing');
	assert.ok(output.includes('"product_cat"'), 'product_cat taxonomy missing');
});

test('plugins.enabled contains detected plugins', () => {
	assert.ok(output.includes('"yoast"'), 'yoast plugin missing');
	assert.ok(output.includes('"woocommerce"'), 'woocommerce plugin missing');
	assert.ok(output.includes('"acf"'), 'acf plugin missing');
});

test('SEO plugin set to detected yoast', () => {
	assert.ok(output.includes('plugin: "yoast"'), 'seo plugin should be yoast');
});

test('WooCommerce meta keys excluded from meta.rules', () => {
	// _price and _sku should not appear in rules (handled by woocommerce plugin)
	const rulesSection = output.slice(output.indexOf('rules:'), output.indexOf('unknownFallback'));
	assert.ok(!rulesSection.includes('"_price"'), '_price should not be in meta.rules');
	assert.ok(!rulesSection.includes('"_sku"'), '_sku should not be in meta.rules');
});

test('SEO meta keys excluded from meta.rules', () => {
	const rulesSection = output.slice(output.indexOf('rules:'), output.indexOf('unknownFallback'));
	assert.ok(!rulesSection.includes('"_yoast_wpseo_title"'), 'yoast key should not be in rules');
});

test('ACF reference keys excluded from meta.rules', () => {
	const rulesSection = output.slice(output.indexOf('rules:'), output.indexOf('unknownFallback'));
	assert.ok(!rulesSection.includes('"_field_my_field"'), 'ACF ref key should not be in rules');
});

test('internal meta keys excluded from meta.rules', () => {
	const rulesSection = output.slice(output.indexOf('rules:'), output.indexOf('unknownFallback'));
	assert.ok(!rulesSection.includes('"_edit_lock"'), '_edit_lock should not be in rules');
});

test('user meta keys appear in rules section (commented)', () => {
	assert.ok(output.includes('"client_name"'), 'client_name should appear');
	assert.ok(output.includes('"reading_time"'), 'reading_time should appear');
});

test('WPBakery builder block comment included', () => {
	assert.ok(output.includes('"wpbakery/*"'), 'wpbakery wildcard missing');
});

test('custom shortcodes appear (commented)', () => {
	assert.ok(output.includes('"product"'), 'product shortcode missing');
});

test('contains all major config sections', () => {
	for (const section of ['site:', 'input:', 'output:', 'posts:', 'postTypes:', 'frontmatter:', 'contentFields:', 'seo:', 'taxonomies:', 'meta:', 'shortcodes:', 'blocks:', 'hooks:', 'links:', 'plugins:']) {
		assert.ok(output.includes(section), `missing section: ${section}`);
	}
});

test('generated with auto fallback when no SEO plugin', () => {
	const noSeo = generate({
		...FINDINGS,
		detectedPlugins: [],
		detectedBuilders: [],
	}, 'test.xml');
	assert.ok(noSeo.includes('plugin: "auto"'), 'should fall back to auto');
});

test('input path appears in header comment', () => {
	assert.ok(output.includes('wetm init export.xml'), 'input path missing from header');
});
