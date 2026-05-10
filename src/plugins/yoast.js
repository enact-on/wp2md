// Yoast SEO. Map _yoast_wpseo_* keys into a tidy `seo` object in frontmatter.

const MAP = {
	'_yoast_wpseo_title': 'title',
	'_yoast_wpseo_metadesc': 'description',
	'_yoast_wpseo_canonical': 'canonical',
	'_yoast_wpseo_focuskw': 'focusKeyword',
	'_yoast_wpseo_meta-robots-noindex': 'noindex',
	'_yoast_wpseo_meta-robots-nofollow': 'nofollow',
	'_yoast_wpseo_opengraph-title': 'ogTitle',
	'_yoast_wpseo_opengraph-description': 'ogDescription',
	'_yoast_wpseo_opengraph-image': 'ogImage',
	'_yoast_wpseo_twitter-title': 'twitterTitle',
	'_yoast_wpseo_twitter-description': 'twitterDescription',
	'_yoast_wpseo_twitter-image': 'twitterImage'
};

export const plugin = {
	name: 'yoast',
	onMeta({ metas, frontmatter, consumed }) {
		const seo = {};
		for (const meta of metas) {
			const target = MAP[meta.key];
			if (!target) continue;
			let value = meta.value;
			if (target === 'noindex' || target === 'nofollow') {
				value = String(value) === '1' || value === true;
			}
			seo[target] = value;
			consumed.add(meta.key);
		}
		if (Object.keys(seo).length > 0) {
			frontmatter.seo = { ...(frontmatter.seo ?? {}), ...seo };
		}
	}
};
