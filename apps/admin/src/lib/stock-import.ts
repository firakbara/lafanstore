// Bulk stock import parsing. Pure — used for the live preview on the client and again on the server.

export interface StockImportOptions {
	/** '' / undefined = one item per line. Otherwise a custom separator; the literal "\n" means newline. */
	separator?: string | null;
	/** Drop duplicates inside the pasted text and items that already exist (available) for the product. */
	dedupe?: boolean;
	/** Contents already in stock (only consulted when dedupe is on). */
	existing?: Iterable<string>;
	/** Override the maximum raw chunk count (default 100,000). */
	maxChunks?: number;
}

export interface StockImportResult {
	items: string[];
	duplicatesInInput: number;
	duplicatesExisting: number;
	emptySkipped: number;
}

export function normalizeSeparator(sep: string | null | undefined): string {
	if (!sep) return '\n';
	return sep.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

const MAX_CHUNKS = 100_000;

export function parseStockImport(text: string, opts: StockImportOptions = {}): StockImportResult {
	const sep = normalizeSeparator(opts.separator);
	const raw = text.replace(/\r\n?/g, '\n').split(sep);
	const limit = opts.maxChunks ?? MAX_CHUNKS;
	if (raw.length > limit) {
		throw new Error(`Import exceeds ${limit} items`);
	}
	const existing = opts.dedupe ? new Set(opts.existing ?? []) : null;
	const seen = new Set<string>();
	const items: string[] = [];
	let duplicatesInInput = 0;
	let duplicatesExisting = 0;
	let emptySkipped = 0;
	for (const part of raw) {
		const item = part.trim();
		if (!item) {
			emptySkipped++;
			continue;
		}
		if (opts.dedupe) {
			if (seen.has(item)) {
				duplicatesInInput++;
				continue;
			}
			seen.add(item);
			if (existing?.has(item)) {
				duplicatesExisting++;
				continue;
			}
		}
		items.push(item);
	}
	// A trailing separator produces one empty chunk; don't report it.
	if (raw.length && !raw[raw.length - 1]!.trim()) emptySkipped--;
	return { items, duplicatesInInput, duplicatesExisting, emptySkipped: Math.max(0, emptySkipped) };
}
