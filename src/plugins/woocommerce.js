// WooCommerce product fields. Maps the most common scalar keys into a
// dedicated `product` object on frontmatter.

const SCALAR_MAP = {
	'_sku': 'sku',
	'_price': 'price',
	'_regular_price': 'regularPrice',
	'_sale_price': 'salePrice',
	'_stock': 'stock',
	'_stock_status': 'stockStatus',
	'_weight': 'weight',
	'_length': 'length',
	'_width': 'width',
	'_height': 'height',
	'_tax_status': 'taxStatus',
	'_tax_class': 'taxClass',
	'_visibility': 'visibility',
	'_featured': 'featured'
};

export const plugin = {
	name: 'woocommerce',
	onMeta({ metas, frontmatter, consumed }) {
		const product = {};
		for (const meta of metas) {
			const target = SCALAR_MAP[meta.key];
			if (!target) continue;
			product[target] = meta.value;
			consumed.add(meta.key);
		}
		if (Object.keys(product).length > 0) {
			frontmatter.product = { ...(frontmatter.product ?? {}), ...product };
		}
	}
};
