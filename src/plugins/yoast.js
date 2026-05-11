// Yoast SEO. Map _yoast_wpseo_* keys into a tidy `seo` object in frontmatter.
// The frontmatter key defaults to "seo" but respects shared.config.seoFrontmatterKey.

import * as shared from '../shared.js';

const DEFAULT_MAP = {
	'_yoast_wpseo_title':                  'title',
	'_yoast_wpseo_metadesc':               'description',
	'_yoast_wpseo_canonical':              'canonical',
	'_yoast_wpseo_focuskw':                'focusKeyword',
	'_yoast_wpseo_meta-robots-noindex':    'noindex',
	'_yoast_wpseo_meta-robots-nofollow':   'nofollow',
	'_yoast_wpseo_opengraph-title':        'ogTitle',
	'_yoast_wpseo_opengraph-description':  'ogDescription',
	'_yoast_wpseo_opengraph-image':        'ogImage',
	'_yoast_wpseo_twitter-title':          'twitterTitle',
	'_yoast_wpseo_twitter-description':    'twitterDescription',
	'_yoast_wpseo_twitter-image':          'twitterImage'
};

function getMap() {
	const overrides = shared.config.seoFieldOverrides ?? {};
	// overrides: { targetField: 'custom_meta_key' } — flip to { meta_key: targetField }
	const flipped = Object.fromEntries(
		Object.entries(overrides).map(([target, key]) => [key, target])
	);
	return { ...DEFAULT_MAP, ...flipped };
}

export const plugin = {
	name: 'yoast',
	onMeta({ metas, frontmatter, consumed }) {
		const map = getMap();
		const fmKey = shared.config.seoFrontmatterKey ?? 'seo';
		const seo = {};
		for (const meta of metas) {
			const target = map[meta.key];
			if (!target) continue;
			let value = meta.value;
			if (target === 'noindex' || target === 'nofollow') {
				value = String(value) === '1' || value === true;
			}
			seo[target] = value;
			consumed.add(meta.key);
		}
		if (Object.keys(seo).length > 0) {
			frontmatter[fmKey] = { ...(frontmatter[fmKey] ?? {}), ...seo };
		}
	}
};
