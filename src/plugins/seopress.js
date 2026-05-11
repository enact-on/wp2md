// SEOPress. Same shape as Yoast/RankMath plugins, different keys.
// _seopress_robots_index / _seopress_robots_follow store the string
// "noindex" / "nofollow" when enabled, or an empty string when not.

import * as shared from '../shared.js';

const DEFAULT_MAP = {
	'_seopress_titles_title':       'title',
	'_seopress_titles_desc':        'description',
	'_seopress_robots_canonical':   'canonical',
	'_seopress_titles_keywords':    'focusKeyword',
	'_seopress_robots_index':       'noindex',
	'_seopress_robots_follow':      'nofollow',
	'_seopress_social_fb_title':    'ogTitle',
	'_seopress_social_fb_desc':     'ogDescription',
	'_seopress_social_fb_img':      'ogImage',
	'_seopress_social_twitter_title': 'twitterTitle',
	'_seopress_social_twitter_desc':  'twitterDescription',
	'_seopress_social_twitter_img':   'twitterImage'
};

export const plugin = {
	name: 'seopress',
	onMeta({ metas, frontmatter, consumed }) {
		const fmKey = shared.config.seoFrontmatterKey ?? 'seo';
		const seo = {};
		for (const meta of metas) {
			const target = DEFAULT_MAP[meta.key];
			if (!target) continue;
			let value = meta.value;
			if (target === 'noindex') {
				value = String(value) === 'noindex' || value === true;
			} else if (target === 'nofollow') {
				value = String(value) === 'nofollow' || value === true;
			}
			seo[target] = value;
			consumed.add(meta.key);
		}
		if (Object.keys(seo).length > 0) {
			frontmatter[fmKey] = { ...(frontmatter[fmKey] ?? {}), ...seo };
		}
	}
};
