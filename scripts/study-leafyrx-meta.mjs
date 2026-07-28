// Dump every distinct meta key (with a short sample value) for `condition` and
// `post` items, so we can find the "Reviewed by" fields and decide what else to
// surface as frontmatter.
import { load } from '../src/data.js';
import { readFileSync } from 'node:fs';

const rss = await load(readFileSync('input/leafyrx.WordPress.2026-06-25.xml', 'utf8'));
const items = rss.child('channel').children('item');

function profile(type) {
	const keys = {}; // key -> { count, sample }
	for (const it of items) {
		if (it.optionalChildValue('post_type') !== type) continue;
		for (const { key, value } of it.postMetaPairs()) {
			if (!key) continue;
			const k = key;
			(keys[k] ??= { count: 0, sample: '' });
			keys[k].count++;
			if (!keys[k].sample && value) {
				keys[k].sample = String(value).replace(/\s+/g, ' ').slice(0, 110);
			}
		}
	}
	return keys;
}

for (const type of ['condition', 'post', 'customer-review']) {
	const keys = profile(type);
	console.log('\n' + '═'.repeat(72));
	console.log(`${type} — ${Object.keys(keys).length} distinct meta keys`);
	console.log('═'.repeat(72));
	const entries = Object.entries(keys).sort((a, b) => b[1].count - a[1].count);
	for (const [k, { count, sample }] of entries) {
		const flag = /review|doctor|author|medic|credential|by|expert|clin/i.test(k) ? '  ← reviewer?' : '';
		console.log(`  ${String(count).padStart(3)}  ${k.padEnd(34)} ${sample}${flag}`);
	}
}
