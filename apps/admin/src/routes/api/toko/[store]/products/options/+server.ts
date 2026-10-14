import { endpoint } from '#lib/server/http.ts';
import { productOptions } from '#lib/server/repo/products.ts';

export const GET = endpoint(async ({ url, locals }) =>
	productOptions(locals.storeId, {
		collectionsOnly: url.searchParams.get('kind') === 'collection',
		sellableOnly: url.searchParams.get('kind') === 'sellable'
	})
);
