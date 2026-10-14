import { describe, expect, test } from 'bun:test';
import { normalizeSeparator, parseStockImport } from './stock-import';

describe('parseStockImport', () => {
	test('one item per line, trims and skips blank lines, handles CRLF', () => {
		const r = parseStockImport('a@x.com:1\r\n  b@x.com:2  \n\n\nc@x.com:3\n');
		expect(r.items).toEqual(['a@x.com:1', 'b@x.com:2', 'c@x.com:3']);
		expect(r.emptySkipped).toBe(2);
	});

	test('custom separator keeps multi-line items intact', () => {
		const text = 'user: a\npass: 1\n---\nuser: b\npass: 2\n---\n';
		const r = parseStockImport(text, { separator: '---' });
		expect(r.items).toEqual(['user: a\npass: 1', 'user: b\npass: 2']);
	});

	test('literal \\n separator means newline; \\n\\n splits on blank lines', () => {
		expect(normalizeSeparator('\\n')).toBe('\n');
		const r = parseStockImport('line1\nline2\n\nline3\nline4', { separator: '\\n\\n' });
		expect(r.items).toEqual(['line1\nline2', 'line3\nline4']);
	});

	test('pipe separator on a single line', () => {
		expect(parseStockImport('CODE1|CODE2| CODE3 |', { separator: '|' }).items).toEqual(['CODE1', 'CODE2', 'CODE3']);
	});

	test('without dedupe duplicates are kept', () => {
		const r = parseStockImport('a\na\nb');
		expect(r.items).toEqual(['a', 'a', 'b']);
		expect(r.duplicatesInInput).toBe(0);
	});

	test('dedupe removes duplicates in input and items already in stock', () => {
		const r = parseStockImport('a\nb\na\nc\nb\nd', { dedupe: true, existing: ['c', 'zzz'] });
		expect(r.items).toEqual(['a', 'b', 'd']);
		expect(r.duplicatesInInput).toBe(2);
		expect(r.duplicatesExisting).toBe(1);
	});

	test('existing is ignored when dedupe is off', () => {
		expect(parseStockImport('c', { existing: ['c'] }).items).toEqual(['c']);
	});

	test('empty input', () => {
		const r = parseStockImport('   \n\n');
		expect(r.items).toEqual([]);
	});

	test('rejects input exceeding maxChunks', () => {
		const huge = Array.from({ length: 101 }, (_, i) => `item${i}`).join('\n');
		expect(() => parseStockImport(huge, { maxChunks: 100 })).toThrow(/exceeds 100/);
	});

	test('accepts input at exactly maxChunks', () => {
		const big = Array.from({ length: 100 }, (_, i) => `item${i}`).join('\n');
		expect(() => parseStockImport(big, { maxChunks: 100 })).not.toThrow();
	});

	test('default maxChunks is 100,000', () => {
		expect(() => parseStockImport('a\nb\nc')).not.toThrow();
	});
});

describe('normalizeSeparator', () => {
	test('null/undefined/empty returns newline', () => {
		expect(normalizeSeparator(null)).toBe('\n');
		expect(normalizeSeparator(undefined)).toBe('\n');
		expect(normalizeSeparator('')).toBe('\n');
	});

	test('literal \\t becomes a tab character', () => {
		expect(normalizeSeparator('\\t')).toBe('\t');
		const r = parseStockImport('a\tb\tc', { separator: '\\t' });
		expect(r.items).toEqual(['a', 'b', 'c']);
	});

	test('mixed \\n and \\t escapes', () => {
		expect(normalizeSeparator('\\n\\t')).toBe('\n\t');
	});

	test('plain string without escape sequences is returned as-is', () => {
		expect(normalizeSeparator('||')).toBe('||');
		expect(normalizeSeparator(',')).toBe(',');
		expect(normalizeSeparator('---')).toBe('---');
	});
});

describe('parseStockImport edge cases', () => {
	test('comma separator splits correctly', () => {
		const r = parseStockImport('alpha, beta ,gamma', { separator: ',' });
		expect(r.items).toEqual(['alpha', 'beta', 'gamma']);
		expect(r.emptySkipped).toBe(0);
	});

	test('pure \\r\\n line endings are normalized', () => {
		const r = parseStockImport('a\r\nb\r\nc\r\n');
		expect(r.items).toEqual(['a', 'b', 'c']);
		expect(r.emptySkipped).toBe(0); // trailing newline is not counted
	});

	test('bare \\r (old Mac style) is normalized like \\r\\n', () => {
		const r = parseStockImport('x\ry\rz\r');
		expect(r.items).toEqual(['x', 'y', 'z']);
		expect(r.emptySkipped).toBe(0);
	});

	test('trailing separator does NOT count as emptySkipped', () => {
		const r = parseStockImport('a|b|c|', { separator: '|' });
		expect(r.items).toEqual(['a', 'b', 'c']);
		expect(r.emptySkipped).toBe(0);
	});

	test('trailing newline separator does NOT count as emptySkipped', () => {
		const r = parseStockImport('foo\nbar\n');
		expect(r.items).toEqual(['foo', 'bar']);
		expect(r.emptySkipped).toBe(0);
	});

	test('multiple trailing separators: only last one is forgiven', () => {
		const r = parseStockImport('a||', { separator: '|' });
		expect(r.items).toEqual(['a']);
		expect(r.emptySkipped).toBe(1); // first empty counts, last does not
	});

	test('completely empty string returns zero items and zero emptySkipped', () => {
		const r = parseStockImport('');
		expect(r.items).toEqual([]);
		expect(r.emptySkipped).toBe(0);
	});

	test('\\t separator via \\\\t string splits tab-separated values', () => {
		const r = parseStockImport('code1\tcode2\tcode3\t', { separator: '\\t' });
		expect(r.items).toEqual(['code1', 'code2', 'code3']);
		expect(r.emptySkipped).toBe(0); // trailing tab forgiven
	});

	test('maxChunks of 1 rejects even two chunks', () => {
		expect(() => parseStockImport('a\nb', { maxChunks: 1 })).toThrow(/exceeds 1/);
	});

	test('dedupe ON with all items already existing yields empty result', () => {
		const r = parseStockImport('a\nb\nc', { dedupe: true, existing: ['a', 'b', 'c'] });
		expect(r.items).toEqual([]);
		expect(r.duplicatesExisting).toBe(3);
		expect(r.duplicatesInInput).toBe(0);
	});

	test('dedupe ON with existing as an iterable (not array)', () => {
		const existingSet = new Set(['x']);
		const r = parseStockImport('x\ny\nz', { dedupe: true, existing: existingSet });
		expect(r.items).toEqual(['y', 'z']);
		expect(r.duplicatesExisting).toBe(1);
	});

	test('dedupe OFF leaves duplicatesInInput and duplicatesExisting at 0', () => {
		const r = parseStockImport('a\na\na');
		expect(r.duplicatesInInput).toBe(0);
		expect(r.duplicatesExisting).toBe(0);
	});

	test('items with leading/trailing whitespace are trimmed before deduplication', () => {
		const r = parseStockImport(' a \na\n  a  ', { dedupe: true });
		expect(r.items).toEqual(['a']);
		expect(r.duplicatesInInput).toBe(2);
	});
});

describe('parseStockImport additional edge cases', () => {
	test('items with only tab/space characters are treated as empty', () => {
		const r = parseStockImport('a\n \t \nb\n\t\nc');
		expect(r.items).toEqual(['a', 'b', 'c']);
		expect(r.emptySkipped).toBe(2);
	});

	test('unicode content is preserved', () => {
		const r = parseStockImport('item-é\nitem-世\nitem-😀');
		expect(r.items).toEqual(['item-é', 'item-世', 'item-😀']);
	});

	test('very long individual item is kept as-is', () => {
		const longItem = 'x'.repeat(10_000);
		const r = parseStockImport(longItem);
		expect(r.items).toEqual([longItem]);
	});

	test('single item with no separator', () => {
		const r = parseStockImport('single-code-123');
		expect(r.items).toEqual(['single-code-123']);
		expect(r.emptySkipped).toBe(0);
	});

	test('dedupe is case-sensitive', () => {
		const r = parseStockImport('ABC\nabc\nAbc', { dedupe: true });
		expect(r.items).toEqual(['ABC', 'abc', 'Abc']);
		expect(r.duplicatesInInput).toBe(0);
	});

	test('separator that is a regex special character (dot)', () => {
		// split uses string separator, not regex, so "." is literal
		const r = parseStockImport('a.b.c', { separator: '.' });
		expect(r.items).toEqual(['a', 'b', 'c']);
	});

	test('multi-character separator appearing as substring of items', () => {
		// separator is "::" and items contain single ":"
		const r = parseStockImport('key:val::key2:val2', { separator: '::' });
		expect(r.items).toEqual(['key:val', 'key2:val2']);
	});

	test('separator longer than any content chunk', () => {
		const r = parseStockImport('a---separator---b', { separator: '---separator---' });
		expect(r.items).toEqual(['a', 'b']);
	});

	test('all items are whitespace-only results in empty items', () => {
		const r = parseStockImport('   \n  \n\t');
		expect(r.items).toEqual([]);
	});

	test('dedupe with empty existing iterable', () => {
		const r = parseStockImport('a\nb\na', { dedupe: true, existing: [] });
		expect(r.items).toEqual(['a', 'b']);
		expect(r.duplicatesInInput).toBe(1);
		expect(r.duplicatesExisting).toBe(0);
	});

	test('maxChunks=0 rejects any input with chunks', () => {
		// Even single char "a" splits into 1 chunk, which is > 0
		expect(() => parseStockImport('a', { maxChunks: 0 })).toThrow(/exceeds 0/);
	});

	test('Windows-style CRLF mixed with Unix LF in custom separator', () => {
		const r = parseStockImport('a\r\nb\nc\r\n', { separator: '\\n' });
		// \r\n is normalized to \n first, then split by \n
		expect(r.items).toEqual(['a', 'b', 'c']);
	});

	test('items containing newlines when using non-newline separator', () => {
		const r = parseStockImport('line1a\nline1b|line2a\nline2b', { separator: '|' });
		expect(r.items).toEqual(['line1a\nline1b', 'line2a\nline2b']);
	});

	test('dedupe with existing containing items not in input', () => {
		const r = parseStockImport('a\nb', { dedupe: true, existing: ['x', 'y', 'z'] });
		expect(r.items).toEqual(['a', 'b']);
		expect(r.duplicatesExisting).toBe(0);
	});

	test('only-separator input: first empty counts, trailing forgiven', () => {
		const r = parseStockImport('|', { separator: '|' });
		// splits into ['', ''], 2 empties, trailing forgiven -> emptySkipped = 1
		expect(r.items).toEqual([]);
		expect(r.emptySkipped).toBe(1);
	});
});
