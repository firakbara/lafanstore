import { describe, expect, test } from 'bun:test';
import { verifyBotToken } from './telegram';

const fakeFetch = (status: number, body: unknown) =>
	(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('verifyBotToken', () => {
	test('accepts a token Telegram knows and returns the username', async () => {
		const r = await verifyBotToken('1:abc', fakeFetch(200, { ok: true, result: { is_bot: true, username: 'patunginbot' } }));
		expect(r).toEqual({ ok: true, username: 'patunginbot' });
	});
	test('rejects a token Telegram refuses', async () => {
		const r = await verifyBotToken('1:abc', fakeFetch(401, { ok: false, error_code: 401, description: 'Unauthorized' }));
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toBe('invalid');
	});
	test('treats 404 as an invalid token', async () => {
		const r = await verifyBotToken('1:abc', fakeFetch(404, { ok: false, description: 'Not Found' }));
		expect(r.ok === false && r.reason).toBe('invalid');
	});
	test('reports network failures separately', async () => {
		const failing = (async () => {
			throw new TypeError('fetch failed');
		}) as unknown as typeof fetch;
		const r = await verifyBotToken('1:abc', failing);
		expect(r.ok === false && r.reason).toBe('network');
	});
	test('reports Telegram 5xx as network', async () => {
		const r = await verifyBotToken('1:abc', fakeFetch(502, { ok: false }));
		expect(r.ok === false && r.reason).toBe('network');
	});
	test('calls getMe on the bot API', async () => {
		let called = '';
		const spy = (async (url: string) => {
			called = url;
			return new Response(JSON.stringify({ ok: true, result: { is_bot: true, username: 'x' } }));
		}) as unknown as typeof fetch;
		await verifyBotToken('123:XYZ', spy);
		expect(called).toBe('https://api.telegram.org/bot123:XYZ/getMe');
	});
});
