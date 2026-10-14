import { describe, expect, test } from 'bun:test';
import {
	BadRequest,
	escapeCsv,
	escapeLike,
	escapeHtml,
	str,
	optStr,
	int,
	optInt,
	bool,
	oneOf,
	optDate,
	idParam,
	enumParam,
	readJson,
	jsonError,
	toErrorResponse,
	endpoint,
} from './http';

describe('escapeLike', () => {
	test('leaves plain text unchanged', () => {
		expect(escapeLike('hello')).toBe('hello');
	});
	test('escapes percent, underscore and backslash', () => {
		expect(escapeLike('100%')).toBe('100\\%');
		expect(escapeLike('a_b')).toBe('a\\_b');
		expect(escapeLike('c\\d')).toBe('c\\\\d');
	});
	test('escapes all wildcards in one string', () => {
		expect(escapeLike('%_\\')).toBe('\\%\\_\\\\');
	});
	test('handles empty string', () => {
		expect(escapeLike('')).toBe('');
	});
});

describe('escapeCsv', () => {
	test('plain values unchanged', () => {
		expect(escapeCsv('hello')).toBe('hello');
	});
	test('wraps commas in quotes', () => {
		expect(escapeCsv('a,b')).toBe('"a,b"');
	});
	test('escapes quotes inside values', () => {
		expect(escapeCsv('say "hi"')).toBe('"say ""hi"""');
	});
	test('wraps newlines', () => {
		expect(escapeCsv('line1\nline2')).toBe('"line1\nline2"');
	});
	test('handles empty string', () => {
		expect(escapeCsv('')).toBe('');
	});
	test('wraps formula-triggering prefixes to prevent injection', () => {
		expect(escapeCsv('=SUM(A1)')).toBe('"=SUM(A1)"');
		expect(escapeCsv('+cmd')).toBe('"+cmd"');
		expect(escapeCsv('-value')).toBe('"-value"');
		expect(escapeCsv('@import')).toBe('"@import"');
	});
	test('wraps values containing tabs', () => {
		expect(escapeCsv('a\tb')).toBe('"a\tb"');
		expect(escapeCsv('\tstart')).toBe('"\tstart"');
	});
	test('wraps formatted money values with commas', () => {
		expect(escapeCsv('12.50 USD')).toBe('12.50 USD');
		expect(escapeCsv('€1,234.56')).toBe('"€1,234.56"');
		expect(escapeCsv('12.50 USD (Rp203.750)')).toBe('12.50 USD (Rp203.750)');
		expect(escapeCsv('$1,000.00 USD ($1,000.00)')).toBe('"$1,000.00 USD ($1,000.00)"');
	});
});

describe('escapeHtml', () => {
	test('escapes &, < and >', () => {
		expect(escapeHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
	});
	test('leaves safe strings unchanged', () => {
		expect(escapeHtml('hello world')).toBe('hello world');
	});
	test('handles empty string', () => {
		expect(escapeHtml('')).toBe('');
	});
});

describe('str validator', () => {
	test('returns trimmed string', () => {
		expect(str({ name: '  Alice  ' }, 'name')).toBe('Alice');
	});
	test('throws when missing or non-string', () => {
		expect(() => str({}, 'name')).toThrow(BadRequest);
		expect(() => str({ name: 42 }, 'name')).toThrow(BadRequest);
	});
	test('throws when empty after trim', () => {
		expect(() => str({ name: '   ' }, 'name')).toThrow(BadRequest);
	});
	test('respects min length', () => {
		expect(() => str({ code: 'ab' }, 'code', { min: 3 })).toThrow(BadRequest);
		expect(str({ code: 'abc' }, 'code', { min: 3 })).toBe('abc');
	});
	test('respects max length', () => {
		expect(() => str({ name: 'abcdef' }, 'name', { max: 5 })).toThrow(BadRequest);
		expect(str({ name: 'abcde' }, 'name', { max: 5 })).toBe('abcde');
	});
});

describe('optStr validator', () => {
	test('returns null for undefined/null', () => {
		expect(optStr({}, 'x')).toBeNull();
		expect(optStr({ x: null }, 'x')).toBeNull();
	});
	test('returns null for empty string after trim', () => {
		expect(optStr({ x: '  ' }, 'x')).toBeNull();
	});
	test('returns trimmed value', () => {
		expect(optStr({ x: ' foo ' }, 'x')).toBe('foo');
	});
	test('throws for non-string', () => {
		expect(() => optStr({ x: 123 }, 'x')).toThrow(BadRequest);
	});
	test('respects max length', () => {
		expect(() => optStr({ x: 'abcdef' }, 'x', { max: 3 })).toThrow(BadRequest);
	});
});

describe('int validator', () => {
	test('accepts integers', () => {
		expect(int({ n: 42 }, 'n')).toBe(42);
		expect(int({ n: 0 }, 'n')).toBe(0);
		expect(int({ n: -5 }, 'n')).toBe(-5);
	});
	test('parses string integers', () => {
		expect(int({ n: '99' }, 'n')).toBe(99);
		expect(int({ n: '-3' }, 'n')).toBe(-3);
	});
	test('throws for non-integer', () => {
		expect(() => int({ n: 1.5 }, 'n')).toThrow(BadRequest);
		expect(() => int({ n: 'abc' }, 'n')).toThrow(BadRequest);
		expect(() => int({}, 'n')).toThrow(BadRequest);
	});
	test('respects min/max', () => {
		expect(() => int({ n: 0 }, 'n', { min: 1 })).toThrow(BadRequest);
		expect(() => int({ n: 101 }, 'n', { max: 100 })).toThrow(BadRequest);
		expect(int({ n: 1 }, 'n', { min: 1, max: 100 })).toBe(1);
	});
});

describe('optInt validator', () => {
	test('returns null for undefined/null/empty', () => {
		expect(optInt({}, 'n')).toBeNull();
		expect(optInt({ n: null }, 'n')).toBeNull();
		expect(optInt({ n: '' }, 'n')).toBeNull();
	});
	test('delegates to int for present values', () => {
		expect(optInt({ n: 5 }, 'n')).toBe(5);
		expect(optInt({ n: '10' }, 'n')).toBe(10);
	});
	test('respects min/max', () => {
		expect(() => optInt({ n: 0 }, 'n', { min: 1 })).toThrow(BadRequest);
	});
});

describe('bool validator', () => {
	test('returns boolean values', () => {
		expect(bool({ a: true }, 'a')).toBe(true);
		expect(bool({ a: false }, 'a')).toBe(false);
	});
	test('uses fallback when undefined', () => {
		expect(bool({}, 'a', false)).toBe(false);
		expect(bool({}, 'a', true)).toBe(true);
	});
	test('throws for non-boolean without fallback', () => {
		expect(() => bool({}, 'a')).toThrow(BadRequest);
		expect(() => bool({ a: 'true' }, 'a')).toThrow(BadRequest);
	});
});

describe('oneOf validator', () => {
	test('accepts valid values', () => {
		expect(oneOf({ s: 'a' }, 's', ['a', 'b', 'c'] as const)).toBe('a');
	});
	test('throws for invalid values', () => {
		expect(() => oneOf({ s: 'd' }, 's', ['a', 'b'] as const)).toThrow(BadRequest);
		expect(() => oneOf({ s: 123 }, 's', ['a'] as const)).toThrow(BadRequest);
	});
});

describe('optDate validator', () => {
	test('returns null for undefined/null/empty', () => {
		expect(optDate({}, 'd')).toBeNull();
		expect(optDate({ d: null }, 'd')).toBeNull();
		expect(optDate({ d: '' }, 'd')).toBeNull();
	});
	test('parses valid date strings', () => {
		const d = optDate({ d: '2026-06-15' }, 'd')!;
		expect(d).toBeInstanceOf(Date);
		expect(d.getFullYear()).toBe(2026);
	});
	test('throws for invalid date strings', () => {
		expect(() => optDate({ d: 'not-a-date' }, 'd')).toThrow(BadRequest);
	});
});

describe('idParam', () => {
	test('parses valid numeric string', () => {
		expect(idParam('42')).toBe(42);
		expect(idParam('0')).toBe(0);
	});
	test('throws for invalid input', () => {
		expect(() => idParam(undefined)).toThrow(BadRequest);
		expect(() => idParam('')).toThrow(BadRequest);
		expect(() => idParam('abc')).toThrow(BadRequest);
		expect(() => idParam('-1')).toThrow(BadRequest);
	});
});

describe('enumParam', () => {
	test('returns matching value', () => {
		const sp = new URLSearchParams('status=active');
		expect(enumParam(sp, 'status', ['active', 'inactive'] as const)).toBe('active');
	});
	test('returns null for missing or invalid', () => {
		expect(enumParam(new URLSearchParams(), 'status', ['a'] as const)).toBeNull();
		expect(enumParam(new URLSearchParams('status=x'), 'status', ['a'] as const)).toBeNull();
	});
});

describe('jsonError', () => {
	test('returns JSON response with status and error message', async () => {
		const res = jsonError(400, 'bad input');
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: 'bad input' });
	});
	test('merges extra fields', async () => {
		const res = jsonError(409, 'conflict', { code: 'DUPLICATE' });
		const body = await res.json();
		expect(body).toEqual({ error: 'conflict', code: 'DUPLICATE' });
	});
});

describe('toErrorResponse', () => {
	test('maps BadRequest to 400', async () => {
		const res = toErrorResponse(new BadRequest('invalid', 'field1'));
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body).toEqual({ error: 'invalid', field: 'field1' });
	});

	test('maps CoreError to correct status', async () => {
		const err = Object.assign(new Error('NOT_FOUND'), { name: 'CoreError', code: 'NOT_FOUND' });
		const res = toErrorResponse(err);
		expect(res.status).toBe(404);
	});

	test('maps CoreError INSUFFICIENT_BALANCE to 409', async () => {
		const err = Object.assign(new Error('low'), { name: 'CoreError', code: 'INSUFFICIENT_BALANCE' });
		const res = toErrorResponse(err);
		expect(res.status).toBe(409);
	});

	test('humanizes CoreError code when message equals code', async () => {
		const err = Object.assign(new Error('NOT_FOUND'), { name: 'CoreError', code: 'NOT_FOUND' });
		const body = await toErrorResponse(err).json();
		expect(body.error).toBe('Not found');
	});

	test('maps "not implemented yet" to 501', async () => {
		const res = toErrorResponse(new Error('Feature not implemented yet'));
		expect(res.status).toBe(501);
	});

	test('maps Postgres unique violation (23505) to 409', async () => {
		const res = toErrorResponse({ code: '23505', detail: 'Key (code)=(X) exists' });
		expect(res.status).toBe(409);
		const body = await res.json();
		expect(body.error).toContain('Already exists');
	});

	test('maps Postgres FK violation (23503) to 409', async () => {
		const res = toErrorResponse({ code: '23503' });
		expect(res.status).toBe(409);
		const body = await res.json();
		expect(body.error).toContain('referenced');
	});

	test('nested Postgres code in cause', async () => {
		const res = toErrorResponse({ cause: { code: '23505', detail: 'dup' } });
		expect(res.status).toBe(409);
	});

	test('unknown errors become 500', async () => {
		const res = toErrorResponse(new Error('boom'));
		expect(res.status).toBe(500);
	});
});

describe('readJson', () => {
	test('parses a valid JSON object body', async () => {
		const req = new Request('http://x', {
			method: 'POST',
			body: JSON.stringify({ name: 'test' }),
			headers: { 'content-type': 'application/json' },
		});
		const body = await readJson(req);
		expect(body).toEqual({ name: 'test' });
	});

	test('throws BadRequest for array body', async () => {
		const req = new Request('http://x', {
			method: 'POST',
			body: JSON.stringify([1, 2]),
			headers: { 'content-type': 'application/json' },
		});
		await expect(readJson(req)).rejects.toThrow(BadRequest);
	});

	test('throws BadRequest for invalid JSON', async () => {
		const req = new Request('http://x', {
			method: 'POST',
			body: 'not json',
		});
		await expect(readJson(req)).rejects.toThrow(BadRequest);
	});

	test('rejects oversized content-length', async () => {
		const req = new Request('http://x', {
			method: 'POST',
			body: '{}',
			headers: { 'content-type': 'application/json', 'content-length': '2000000' },
		});
		await expect(readJson(req)).rejects.toThrow(BadRequest);
	});

	test('accepts oversized content-length when maxBytes is raised', async () => {
		const req = new Request('http://x', {
			method: 'POST',
			body: JSON.stringify({ ok: true }),
			headers: { 'content-type': 'application/json', 'content-length': '2000000' },
		});
		const body = await readJson(req, 5_000_000);
		expect(body).toEqual({ ok: true });
	});
});

describe('endpoint wrapper', () => {
	test('wraps return value in JSON response', async () => {
		const handler = endpoint(async () => ({ items: [1] }));
		const res = await handler({} as any);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ items: [1] });
	});

	test('passes through Response objects unchanged', async () => {
		const raw = new Response('hi', { status: 201 });
		const handler = endpoint(async () => raw);
		const res = await handler({} as any);
		expect(res.status).toBe(201);
	});

	test('returns { ok: true } for void return', async () => {
		const handler = endpoint(async () => {});
		const res = await handler({} as any);
		expect(await res.json()).toEqual({ ok: true });
	});

	test('catches errors and maps to JSON error responses', async () => {
		const handler = endpoint(async () => {
			throw new BadRequest('nope');
		});
		const res = await handler({} as any);
		expect(res.status).toBe(400);
		expect((await res.json()).error).toBe('nope');
	});
});

describe('str edge cases', () => {
	test('min: 0 allows empty string to pass', () => {
		expect(str({ x: '' }, 'x', { min: 0 })).toBe('');
	});
	test('max: 0 is falsy so does not trigger max check', () => {
		expect(str({ x: 'a' }, 'x', { max: 0 })).toBe('a');
	});
	test('max checks JS string length (emoji = 2 units each)', () => {
		expect(() => str({ x: '🎬🎬🎬' }, 'x', { max: 3 })).toThrow(BadRequest);
		expect(str({ x: '🎬🎬🎬' }, 'x', { max: 6 })).toBe('🎬🎬🎬');
	});
});

describe('int edge cases', () => {
	test('string with leading zeros is accepted', () => {
		expect(int({ n: '007' }, 'n')).toBe(7);
	});
	test('NaN is rejected', () => {
		expect(() => int({ n: NaN }, 'n')).toThrow(BadRequest);
	});
	test('Infinity is rejected', () => {
		expect(() => int({ n: Infinity }, 'n')).toThrow(BadRequest);
	});
	test('float string is rejected', () => {
		expect(() => int({ n: '1.5' }, 'n')).toThrow(BadRequest);
	});
	test('min and max boundaries are inclusive', () => {
		expect(int({ n: 5 }, 'n', { min: 5, max: 5 })).toBe(5);
	});
});

describe('bool edge cases', () => {
	test('string "false" is not accepted as boolean', () => {
		expect(() => bool({ a: 'false' }, 'a')).toThrow(BadRequest);
	});
	test('number 0 is not accepted as boolean', () => {
		expect(() => bool({ a: 0 }, 'a')).toThrow(BadRequest);
	});
	test('null is not accepted without fallback', () => {
		expect(() => bool({ a: null }, 'a')).toThrow(BadRequest);
	});
});

describe('optDate edge cases', () => {
	test('ISO string with timezone', () => {
		const d = optDate({ d: '2026-06-15T12:00:00+07:00' }, 'd')!;
		expect(d).toBeInstanceOf(Date);
		expect(d.getUTCHours()).toBe(5);
	});
	test('epoch number as string is parsed', () => {
		const d = optDate({ d: '0' }, 'd')!;
		expect(d).toBeInstanceOf(Date);
	});
});

describe('idParam edge cases', () => {
	test('leading zeros accepted', () => {
		expect(idParam('007')).toBe(7);
	});
	test('large valid id', () => {
		expect(idParam('999999999')).toBe(999999999);
	});
	test('decimal rejected', () => {
		expect(() => idParam('1.5')).toThrow(BadRequest);
	});
});

describe('escapeLike edge cases', () => {
	test('multiple wildcards in sequence', () => {
		expect(escapeLike('%%__')).toBe('\\%\\%\\_\\_');
	});
	test('mixed text and wildcards', () => {
		expect(escapeLike('hello%world_test')).toBe('hello\\%world\\_test');
	});
});

describe('escapeCsv edge cases', () => {
	test('carriage return triggers quoting', () => {
		expect(escapeCsv('a\rb')).toBe('"a\rb"');
	});
	test('multiple quotes inside value', () => {
		expect(escapeCsv('"a""b"')).toBe('"""a""""b"""');
	});
});

describe('readJson edge cases', () => {
	test('null body throws', async () => {
		const req = new Request('http://x', { method: 'POST', body: 'null' });
		await expect(readJson(req)).rejects.toThrow(BadRequest);
	});
	test('number body throws', async () => {
		const req = new Request('http://x', { method: 'POST', body: '42' });
		await expect(readJson(req)).rejects.toThrow(BadRequest);
	});
	test('string body throws', async () => {
		const req = new Request('http://x', { method: 'POST', body: '"hello"' });
		await expect(readJson(req)).rejects.toThrow(BadRequest);
	});
	test('no content-length header is accepted', async () => {
		const req = new Request('http://x', {
			method: 'POST',
			body: JSON.stringify({ ok: true }),
			headers: { 'content-type': 'application/json' },
		});
		const body = await readJson(req);
		expect(body).toEqual({ ok: true });
	});
});

describe('toErrorResponse edge cases', () => {
	test('CoreError with custom message uses that message', async () => {
		const err = Object.assign(new Error('custom msg'), { name: 'CoreError', code: 'NOT_FOUND' });
		const body = await toErrorResponse(err).json();
		expect(body.error).toBe('custom msg');
	});
	test('CoreError with unknown code maps to 400', async () => {
		const err = Object.assign(new Error('UNKNOWN_CODE'), { name: 'CoreError', code: 'UNKNOWN_CODE' });
		const res = toErrorResponse(err);
		expect(res.status).toBe(400);
	});
	test('BadRequest without field omits field key', async () => {
		const res = toErrorResponse(new BadRequest('oops'));
		const body = await res.json();
		expect(body.field).toBeUndefined();
	});
	test('AuthInputError maps to 400', async () => {
		const { AuthInputError } = await import('./auth');
		const res = toErrorResponse(new AuthInputError('bad creds'));
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error).toBe('bad creds');
	});
	test('CoreError INVALID_STATE maps to 409', async () => {
		const err = Object.assign(new Error('bad state'), { name: 'CoreError', code: 'INVALID_STATE' });
		expect(toErrorResponse(err).status).toBe(409);
	});
	test('CoreError OUT_OF_STOCK maps to 409', async () => {
		const err = Object.assign(new Error('no stock'), { name: 'CoreError', code: 'OUT_OF_STOCK' });
		expect(toErrorResponse(err).status).toBe(409);
	});
	test('CoreError without code defaults to 400', async () => {
		const err = Object.assign(new Error('something'), { name: 'CoreError' });
		const res = toErrorResponse(err);
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.code).toBe('CORE_ERROR');
	});
	test('Postgres 23505 with no detail shows fallback', async () => {
		const res = toErrorResponse({ code: '23505' });
		expect(res.status).toBe(409);
		const body = await res.json();
		expect(body.error).toContain('Already exists');
		expect(body.error).toContain('duplicate value');
	});
});

describe('endpoint sync handler', () => {
	test('works with a synchronous return value', async () => {
		const handler = endpoint(() => ({ sync: true }));
		const res = await handler({} as any);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ sync: true });
	});
	test('sync throw is caught', async () => {
		const handler = endpoint(() => { throw new BadRequest('sync fail'); });
		const res = await handler({} as any);
		expect(res.status).toBe(400);
	});
});

describe('readJson boundary', () => {
	test('content-length exactly at maxBytes is accepted', async () => {
		const body = JSON.stringify({ ok: true });
		const req = new Request('http://x', {
			method: 'POST',
			body,
			headers: { 'content-type': 'application/json', 'content-length': String(body.length) },
		});
		const result = await readJson(req, body.length);
		expect(result).toEqual({ ok: true });
	});
	test('content-length one over maxBytes is rejected', async () => {
		const body = JSON.stringify({ ok: true });
		const req = new Request('http://x', {
			method: 'POST',
			body,
			headers: { 'content-type': 'application/json', 'content-length': String(body.length) },
		});
		await expect(readJson(req, body.length - 1)).rejects.toThrow(BadRequest);
	});
	test('boolean body (true) throws', async () => {
		const req = new Request('http://x', { method: 'POST', body: 'true' });
		await expect(readJson(req)).rejects.toThrow(BadRequest);
	});
});

describe('oneOf edge cases', () => {
	test('undefined value throws', () => {
		expect(() => oneOf({}, 's', ['a', 'b'] as const)).toThrow(BadRequest);
	});
	test('null value throws', () => {
		expect(() => oneOf({ s: null }, 's', ['a', 'b'] as const)).toThrow(BadRequest);
	});
	test('number value throws even if it matches toString', () => {
		expect(() => oneOf({ s: 1 }, 's', ['1', '2'] as const)).toThrow(BadRequest);
	});
});

describe('escapeHtml edge cases', () => {
	test('handles sequences of special chars', () => {
		expect(escapeHtml('<<<>>>&&&')).toBe('&lt;&lt;&lt;&gt;&gt;&gt;&amp;&amp;&amp;');
	});
	test('preserves quotes and other chars', () => {
		expect(escapeHtml('"hello" \'world\'')).toBe('"hello" \'world\'');
	});
	test('already-escaped entities are double-escaped', () => {
		expect(escapeHtml('&amp;')).toBe('&amp;amp;');
		expect(escapeHtml('&lt;')).toBe('&amp;lt;');
	});
});

describe('optInt additional edge cases', () => {
	test('0 is not treated as empty (delegates to int)', () => {
		expect(optInt({ n: 0 }, 'n')).toBe(0);
	});
	test('false is not null/undefined/"" so delegates to int which rejects', () => {
		expect(() => optInt({ n: false as unknown }, 'n')).toThrow(BadRequest);
	});
	test('0 respects min constraint', () => {
		expect(() => optInt({ n: 0 }, 'n', { min: 1 })).toThrow(BadRequest);
	});
});

describe('bool additional edge cases', () => {
	test('explicit false wins over truthy fallback', () => {
		expect(bool({ a: false }, 'a', true)).toBe(false);
	});
	test('explicit true wins over falsy fallback', () => {
		expect(bool({ a: true }, 'a', false)).toBe(true);
	});
});

describe('readJson additional body types', () => {
	test('empty body is rejected', async () => {
		const req = new Request('http://x', { method: 'POST', body: '' });
		await expect(readJson(req)).rejects.toThrow(BadRequest);
	});
	test('nested object body is accepted', async () => {
		const req = new Request('http://x', {
			method: 'POST',
			body: JSON.stringify({ a: { b: [1, 2] } }),
			headers: { 'content-type': 'application/json' },
		});
		const body = await readJson(req);
		expect(body).toEqual({ a: { b: [1, 2] } });
	});
});

describe('enumParam additional edge cases', () => {
	test('empty string value does not match', () => {
		expect(enumParam(new URLSearchParams('status='), 'status', ['active'] as const)).toBeNull();
	});
	test('case-sensitive: uppercase does not match lowercase', () => {
		expect(enumParam(new URLSearchParams('status=Active'), 'status', ['active'] as const)).toBeNull();
	});
	test('returns matching value from multiple options', () => {
		expect(enumParam(new URLSearchParams('s=b'), 's', ['a', 'b', 'c'] as const)).toBe('b');
	});
});
