// RankMath SEO. Same shape as Yoast plugin, different keys.

import * as shared from '../shared.js';

const DEFAULT_MAP = {
	'rank_math_title':                'title',
	'rank_math_description':          'description',
	'rank_math_canonical_url':        'canonical',
	'rank_math_focus_keyword':        'focusKeyword',
	'rank_math_robots':               'robots',
	'rank_math_facebook_title':       'ogTitle',
	'rank_math_facebook_description': 'ogDescription',
	'rank_math_facebook_image':       'ogImage',
	'rank_math_twitter_title':        'twitterTitle',
	'rank_math_twitter_description':  'twitterDescription',
	'rank_math_twitter_image':        'twitterImage'
};

export const plugin = {
	name: 'rankmath',
	onMeta({ metas, frontmatter, consumed }) {
		const fmKey = shared.config.seoFrontmatterKey ?? 'seo';
		const seo = {};
		for (const meta of metas) {
			const target = DEFAULT_MAP[meta.key];
			if (!target) continue;
			seo[target] = meta.value;
			consumed.add(meta.key);
		}
		if (Object.keys(seo).length > 0) {
			frontmatter[fmKey] = { ...(frontmatter[fmKey] ?? {}), ...seo };
		}
	}
};
