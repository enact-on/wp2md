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

// Render a wp:wpseopress/faq-block as a markdown FAQ list.
// The block stores its data in attrs.faqs as a JSON array of { question, answer }.
function renderFaqBlock(block) {
	const faqs = block.attrs?.faqs;
	if (!Array.isArray(faqs) || faqs.length === 0) return null;
	const lines = [];
	for (const faq of faqs) {
		// question/answer may contain HTML entities or simple HTML tags — strip them
		const q = String(faq.question ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
		const a = String(faq.answer ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
		if (q) lines.push(`**${q}**\n\n${a}`);
	}
	return lines.join('\n\n');
}

export const plugin = {
	name: 'seopress',
	onBlock({ block }) {
		if (block.blockName === 'wpseopress/faq-block') {
			return renderFaqBlock(block);
		}
	},
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
