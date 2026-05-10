// Advanced Custom Fields. ACF stores values under `field_name` and a parallel
// `_field_name = field_xxxxxxxxxx` reference key. We drop the underscore-prefixed
// references and let the public values flow through normal classification.

export const plugin = {
	name: 'acf',
	onMeta({ metas, consumed }) {
		for (const meta of metas) {
			// `_my_field` whose value starts with `field_` is the ACF reference; drop it
			if (meta.key.startsWith('_') && typeof meta.raw === 'string' && meta.raw.startsWith('field_')) {
				consumed.add(meta.key);
			}
		}
	}
};
