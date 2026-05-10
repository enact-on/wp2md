// Example wetm.config.js — picked up automatically from the cwd.
// Used by the test-suite runs to exercise the config-file loader.
//
// Pin per-site rules here for each client repo. CLI / wizard answers always
// take precedence over what is set here.
export default {
	postTypeConfig: {
		case_study: { folder: 'case-studies' }
	},

	// ── Block handlers ────────────────────────────────────────────────────────
	// Map Gutenberg block names (or namespace wildcards) to a handling strategy.
	// This lets you configure third-party builder blocks without writing a plugin.
	//
	// Values:
	//   'skip'     — omit the block from output entirely
	//   'html'     — keep the raw innerHTML (works well in MDX contexts)
	//   'markdown' — use the generic HTML→MD fallback (same as doing nothing)
	//   function   — (block) => string | null   full custom handler
	//
	// Wildcards: 'namespace/*' matches any block in that namespace.
	//
	// Examples (all commented out):
	// blockHandlers: {
	//   'elementor/*': 'skip',              // drop all Elementor blocks
	//   'gravityforms/*': 'skip',           // drop all Gravity Forms
	//   'kadence/*': 'markdown',            // let generic HTML→MD handle Kadence
	//   'core/cover': 'html',              // keep cover block HTML as-is
	//   'my-theme/hero': (block) => `# ${block.attrs.title ?? ''}`,
	// },

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
