// One-off study: profile leafyrx export to decide which CPTs to export and
// whether featured images are resolvable. Uses the project's own data layer.
//
//   node scripts/study-leafyrx.mjs
import { load } from '../src/data.js';
import { readFileSync } from 'node:fs';

const XML = 'input/leafyrx.WordPress.2026-06-25.xml';
const rss = await load(readFileSync(XML, 'utf8'));
const channel = rss.child('channel');
const items = channel.children('item');

const NOISE = /^(_edit_lock|_edit_last|_wp_old_|_oembed|_encloseme|_pingme|_thumbnail_id|_bricks_|_wp_page_template|_menu_item)/;

const byType = {};
const seoSignatures = { seopress: 0, yoast: 0, rankmath: 0, aioseo: 0 };
let attachmentItems = 0;

for (const it of items) {
	const type = it.optionalChildValue('post_type') || '(none)';
	const status = it.optionalChildValue('status') || '?';
	if (type === 'attachment') attachmentItems++;

	const t = (byType[type] ??= {
		total: 0, publish: 0, draft: 0, other: 0,
		withThumb: 0, withContentImg: 0, contentLen: 0, metaKeys: {},
	});
	t.total++;
	if (status === 'publish') t.publish++;
	else if (status === 'draft') t.draft++;
	else t.other++;

	// featured-image reference (WP gives the ID; can we resolve it?)
	if (it.postMeta('_thumbnail_id')) t.withThumb++;

	// first <img> in body — the fallback source for a cover image
	const content = it.children('encoded')[0]?.optionalValue() ?? '';
	if (/<img\s/i.test(content)) t.withContentImg++;
	t.contentLen += content.length;

	for (const { key } of it.postMetaPairs()) {
		if (!key) continue;
		t.metaKeys[key] = (t.metaKeys[key] || 0) + 1;
		if (/_seopress/.test(key)) seoSignatures.seopress++;
		if (/_yoast/.test(key)) seoSignatures.yoast++;
		if (/rank_math/.test(key)) seoSignatures.rankmath++;
		if (/_aioseo/.test(key)) seoSignatures.aioseo++;
	}
}

// Taxonomies (channel-level term declarations)
const termDomains = {};
for (const term of channel.children('term')) {
	const d = term.optionalChildValue('term_taxonomy');
	if (d) termDomains[d] = (termDomains[d] || 0) + 1;
}

// Authors
const authors = channel.children('author').length;

console.log('═'.repeat(72));
console.log('leafyrx export study —', items.length, 'items total');
console.log('attachment items in export:', attachmentItems,
	attachmentItems === 0 ? '(⚠ featured-image IDs are NOT resolvable)' : '');
console.log('SEO plugin signals:', JSON.stringify(seoSignatures));
console.log('authors declared:', authors);
console.log('taxonomy term domains:', JSON.stringify(termDomains));
console.log('═'.repeat(72));

const rows = Object.entries(byType).sort((a, b) => b[1].total - a[1].total);
for (const [type, t] of rows) {
	console.log(`\n${type}  —  ${t.total} items  (publish=${t.publish} draft=${t.draft} other=${t.other})`);
	console.log(`  _thumbnail_id set : ${t.withThumb}/${t.total}`);
	console.log(`  body has <img>    : ${t.withContentImg}/${t.total}   (fallback cover source)`);
	console.log(`  avg content size  : ${Math.round(t.contentLen / t.total)} chars`);
	const keys = Object.entries(t.metaKeys)
		.filter(([k]) => !NOISE.test(k))
		.sort((a, b) => b[1] - a[1]);
	console.log(`  meta keys (top 20 of ${keys.length} non-noise):`);
	for (const [k, c] of keys.slice(0, 20)) {
		console.log(`      ${String(c).padStart(4)}  ${k}`);
	}
}

// Dump one published blog post fully so we can map the desired frontmatter.
console.log('\n' + '═'.repeat(72));
console.log('SAMPLE published `post` (blog) item');
console.log('═'.repeat(72));
const sample = items.find((it) =>
	it.optionalChildValue('post_type') === 'post' &&
	it.optionalChildValue('status') === 'publish');
if (sample) {
	console.log('title   :', sample.optionalChildValue('title'));
	console.log('link    :', sample.optionalChildValue('link'));
	console.log('creator :', sample.optionalChildValue('creator'));
	console.log('date    :', sample.optionalChildValue('post_date'));
	for (const d of ['category', 'post_tag']) {
		const terms = sample.terms(d);
		if (terms.length) console.log(`${d.padEnd(8)}:`, JSON.stringify(terms));
	}
	console.log('meta keys present:');
	for (const { key, value } of sample.postMetaPairs()) {
		const v = String(value ?? '');
		console.log(`    ${key.padEnd(38)} = ${v.slice(0, 90).replace(/\n/g, ' ')}`);
	}
	const content = sample.children('encoded')[0]?.optionalValue() ?? '';
	const imgMatch = content.match(/<img[^>]*>/i);
	console.log('first <img> in body:', imgMatch ? imgMatch[0] : '(none)');
}
