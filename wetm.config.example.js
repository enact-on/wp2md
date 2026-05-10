// Example wetm.config.js — picked up automatically from the cwd.
// Used by the test-suite runs to exercise the config-file loader.
//
// Pin per-site rules here for each client repo. CLI / wizard answers always
// take precedence over what is set here.
export default {
	postTypeConfig: {
		case_study: { folder: 'case-studies' }
	},
	plugins: [
		{
			name: 'project-extra',
			onMeta({ metas, frontmatter, consumed }) {
				// example: hoist any meta whose key starts with `seo_` into seo.{key}
				const seo = {};
				for (const m of metas) {
					if (m.key.startsWith('seo_')) {
						seo[m.key.slice(4)] = m.value;
						consumed.add(m.key);
					}
				}
				if (Object.keys(seo).length > 0) {
					frontmatter.seo = { ...(frontmatter.seo ?? {}), ...seo };
				}
			}
		}
	]
};
