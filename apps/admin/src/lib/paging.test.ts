import { describe, expect, test } from 'bun:test';
import { parseListParams, qs, toPage } from './paging';

const opts = { sortable: ['createdAt', 'total'] as const, defaultSort: 'createdAt' as const };

describe('parseListParams', () => {
	test('defaults', () => {
		const p = parseListParams(new URLSearchParams(), opts);
		expect(p).toEqual({ page: 1, pageSize: 20, offset: 0, sort: 'createdAt', dir: 'desc', q: '' });
	});
	test('reads page, size, sort, dir and q', () => {
		const p = parseListParams(new URLSearchParams('page=3&pageSize=50&sort=total:asc&q=%20abc%20'), opts);
		expect(p).toEqual({ page: 3, pageSize: 50, offset: 100, sort: 'total', dir: 'asc', q: 'abc' });
	});
	test('clamps and rejects junk', () => {
		const p = parseListParams(new URLSearchParams('page=-2&pageSize=100000&sort=password:desc'), opts);
		expect(p.page).toBe(1);
		expect(p.pageSize).toBe(100);
		expect(p.sort).toBe('createdAt');
		const p2 = parseListParams(new URLSearchParams('page=abc&pageSize=0&sort=total:sideways'), opts);
		expect(p2.page).toBe(1);
		expect(p2.pageSize).toBe(1);
		expect(p2.dir).toBe('desc');
	});
	test('custom max/default page size and default dir', () => {
		const p = parseListParams(new URLSearchParams('pageSize=400'), { ...opts, maxPageSize: 500, defaultDir: 'asc' });
		expect(p.pageSize).toBe(400);
		expect(p.dir).toBe('asc');
	});
	test('q is length-limited', () => {
		expect(parseListParams(new URLSearchParams({ q: 'x'.repeat(500) }), opts).q.length).toBe(200);
	});
});

describe('toPage / qs', () => {
	test('computes total pages (min 1)', () => {
		expect(toPage([], 0, { page: 1, pageSize: 20 }).totalPages).toBe(1);
		expect(toPage([1], 41, { page: 1, pageSize: 20 }).totalPages).toBe(3);
	});
	test('qs skips empty values', () => {
		expect(qs({ page: 1, q: '', status: undefined, x: null, ok: true })).toBe('?page=1&ok=true');
		expect(qs({})).toBe('');
	});
	test('qs includes boolean false and number 0', () => {
		expect(qs({ active: false, page: 0 })).toBe('?active=false&page=0');
	});
	test('toPage with large total', () => {
		const p = toPage(Array(20).fill(null), 1_000_000, { page: 50000, pageSize: 20 });
		expect(p.totalPages).toBe(50000);
		expect(p.total).toBe(1_000_000);
		expect(p.page).toBe(50000);
	});
});

describe('parseListParams edge cases', () => {
	test('custom defaultPageSize', () => {
		const p = parseListParams(new URLSearchParams(), { ...opts, defaultPageSize: 50 });
		expect(p.pageSize).toBe(50);
	});
	test('sort with no colon uses default sort and dir', () => {
		const p = parseListParams(new URLSearchParams('sort=total'), opts);
		expect(p.sort).toBe('total');
		expect(p.dir).toBe('desc');
	});
	test('sort with multiple colons ignores extras', () => {
		const p = parseListParams(new URLSearchParams('sort=createdAt:asc:extra'), opts);
		expect(p.sort).toBe('createdAt');
		expect(p.dir).toBe('asc');
	});
	test('very large page number', () => {
		const p = parseListParams(new URLSearchParams('page=999999'), opts);
		expect(p.page).toBe(999999);
		expect(p.offset).toBe((999999 - 1) * 20);
	});
	test('pageSize with non-numeric string', () => {
		const p = parseListParams(new URLSearchParams('pageSize=abc'), opts);
		expect(p.pageSize).toBe(20);
	});
	test('page=0 clamps to 1', () => {
		const p = parseListParams(new URLSearchParams('page=0'), opts);
		expect(p.page).toBe(1);
	});
	test('sort with empty string after colon falls back to default dir', () => {
		const p = parseListParams(new URLSearchParams('sort=total:'), opts);
		expect(p.sort).toBe('total');
		expect(p.dir).toBe('desc');
	});
});

describe('parseListParams additional edge cases', () => {
	test('float page number falls back to default (regex rejects decimals)', () => {
		const p = parseListParams(new URLSearchParams('page=1.5'), opts);
		expect(p.page).toBe(1);
	});

	test('negative pageSize is rejected by regex and falls back to default', () => {
		const p = parseListParams(new URLSearchParams('pageSize=-50'), opts);
		expect(p.pageSize).toBe(20); // "-50" fails /^\d+$/ so fallback 20 is used
	});

	test('unsafe integer for page falls back to default', () => {
		const p = parseListParams(new URLSearchParams(`page=${Number.MAX_SAFE_INTEGER + 10}`), opts);
		// The string representation of MAX_SAFE_INTEGER+10 won't round-trip
		expect(p.page).toBe(1);
	});

	test('q with special characters is preserved (trimmed and length-capped)', () => {
		const p = parseListParams(new URLSearchParams('q= <script>alert(1)</script> '), opts);
		expect(p.q).toBe('<script>alert(1)</script>');
	});

	test('empty sort param uses default sort', () => {
		const p = parseListParams(new URLSearchParams('sort='), opts);
		expect(p.sort).toBe('createdAt');
		expect(p.dir).toBe('desc');
	});

	test('sort=:asc with empty sort field uses default sort', () => {
		const p = parseListParams(new URLSearchParams('sort=:asc'), opts);
		expect(p.sort).toBe('createdAt');
		expect(p.dir).toBe('asc');
	});

	test('whitespace-only q trims to empty string', () => {
		const p = parseListParams(new URLSearchParams('q=   '), opts);
		expect(p.q).toBe('');
	});

	test('pageSize at boundary equals max', () => {
		const p = parseListParams(new URLSearchParams('pageSize=100'), opts);
		expect(p.pageSize).toBe(100);
	});

	test('pageSize=1 is valid minimum', () => {
		const p = parseListParams(new URLSearchParams('pageSize=1'), opts);
		expect(p.pageSize).toBe(1);
	});

	test('page with leading zeros is rejected (regex requires no leading zeros except 0 itself)', () => {
		// "01" fails /^\d+$/ test? Actually \d+ matches "01", so it depends on Number()
		const p = parseListParams(new URLSearchParams('page=01'), opts);
		// "01" matches /^\d+$/ and Number("01") = 1, which is safe
		expect(p.page).toBe(1);
	});

	test('page with hex notation is rejected', () => {
		const p = parseListParams(new URLSearchParams('page=0xff'), opts);
		expect(p.page).toBe(1); // regex rejects "0xff"
	});

	test('page with scientific notation is rejected', () => {
		const p = parseListParams(new URLSearchParams('page=1e3'), opts);
		expect(p.page).toBe(1); // regex rejects "1e3"
	});
});

describe('toPage additional edge cases', () => {
	test('single item total with large pageSize still gives 1 total page', () => {
		const p = toPage(['a'], 1, { page: 1, pageSize: 100 });
		expect(p.totalPages).toBe(1);
		expect(p.items).toEqual(['a']);
	});

	test('total exactly divisible by pageSize', () => {
		const p = toPage(Array(10).fill(null), 100, { page: 5, pageSize: 10 });
		expect(p.totalPages).toBe(10);
	});

	test('total off by one from pageSize boundary', () => {
		expect(toPage([], 21, { page: 2, pageSize: 10 }).totalPages).toBe(3);
		expect(toPage([], 19, { page: 2, pageSize: 10 }).totalPages).toBe(2);
	});

	test('pageSize=1 gives total equal to totalPages', () => {
		const p = toPage(['x'], 42, { page: 1, pageSize: 1 });
		expect(p.totalPages).toBe(42);
	});
});

describe('qs additional edge cases', () => {
	test('values with special characters are URL-encoded', () => {
		const result = qs({ q: 'hello world', tag: 'a&b' });
		expect(result).toContain('q=hello+world');
		expect(result).toContain('tag=a%26b');
	});

	test('numeric zero is included', () => {
		expect(qs({ offset: 0 })).toBe('?offset=0');
	});

	test('string "null" and "undefined" are included (they are truthy strings)', () => {
		expect(qs({ a: 'null', b: 'undefined' })).toBe('?a=null&b=undefined');
	});

	test('all values empty/null/undefined returns empty string', () => {
		expect(qs({ a: null, b: undefined, c: '' })).toBe('');
	});
});

describe('parseListParams defaultDir interaction', () => {
	test('explicit asc in sort overrides defaultDir=desc', () => {
		const p = parseListParams(new URLSearchParams('sort=total:asc'), { ...opts, defaultDir: 'desc' });
		expect(p.dir).toBe('asc');
	});

	test('no dir in sort uses defaultDir when provided', () => {
		const p = parseListParams(new URLSearchParams('sort=total'), { ...opts, defaultDir: 'asc' });
		expect(p.dir).toBe('asc');
	});

	test('invalid dir in sort uses defaultDir when provided', () => {
		const p = parseListParams(new URLSearchParams('sort=total:sideways'), { ...opts, defaultDir: 'asc' });
		expect(p.dir).toBe('asc');
	});
});

describe('parseListParams offset calculation', () => {
	test('offset = (page - 1) * pageSize for page 1', () => {
		const p = parseListParams(new URLSearchParams('page=1&pageSize=25'), opts);
		expect(p.offset).toBe(0);
	});

	test('offset = (page - 1) * pageSize for page 2', () => {
		const p = parseListParams(new URLSearchParams('page=2&pageSize=25'), opts);
		expect(p.offset).toBe(25);
	});

	test('offset with custom pageSize', () => {
		const p = parseListParams(new URLSearchParams('page=5&pageSize=10'), opts);
		expect(p.offset).toBe(40);
	});

	test('offset when pageSize is clamped to max', () => {
		const p = parseListParams(new URLSearchParams('page=3&pageSize=9999'), { ...opts, maxPageSize: 50 });
		expect(p.pageSize).toBe(50);
		expect(p.offset).toBe(100);
	});
});

describe('toPage preserves items array', () => {
	test('items are passed through unchanged', () => {
		const items = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }];
		const p = toPage(items, 50, { page: 1, pageSize: 10 });
		expect(p.items).toBe(items);
		expect(p.items).toHaveLength(2);
	});

	test('empty items with total > 0', () => {
		const p = toPage([], 100, { page: 999, pageSize: 10 });
		expect(p.items).toEqual([]);
		expect(p.totalPages).toBe(10);
		expect(p.page).toBe(999);
	});
});
