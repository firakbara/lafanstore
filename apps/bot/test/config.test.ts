import { describe, expect, test } from 'bun:test';
import { parseConfig } from '../src/config';

const minimal = { BOT_TOKEN: '123456:ABCdef_ghijklmnopqrst-uvwxyz1234' };

describe('parseConfig', () => {
	test('minimal valid config', () => {
		const cfg = parseConfig(minimal);
		expect(cfg.botToken).toBe(minimal.BOT_TOKEN);
		expect(cfg.adminIds).toEqual([]);
		expect(cfg.adminChatId).toBeNull();
		expect(cfg.botUsername).toBeNull();
		expect(cfg.channelUrl).toBeNull();
		expect(cfg.adminLang).toBe('id');
		expect(cfg.publicApiUrl).toBeNull();
		expect(cfg.webhookUrl).toBeNull();
		expect(cfg.webhookPath).toBe('/telegram');
		expect(cfg.webhookSecret).toBeNull();
		expect(cfg.port).toBe(8081);
		expect(cfg.broadcastWorker).toBe(true);
	});

	test('throws when BOT_TOKEN missing', () => {
		expect(() => parseConfig({})).toThrow('BOT_TOKEN');
		expect(() => parseConfig({ BOT_TOKEN: '' })).toThrow('BOT_TOKEN');
		expect(() => parseConfig({ BOT_TOKEN: '  ' })).toThrow('BOT_TOKEN');
	});

	test('parses ADMIN_IDS', () => {
		expect(parseConfig({ ...minimal, ADMIN_IDS: '111,222,333' }).adminIds).toEqual([111, 222, 333]);
		expect(parseConfig({ ...minimal, ADMIN_IDS: ' 111 , 222 ' }).adminIds).toEqual([111, 222]);
		expect(parseConfig({ ...minimal, ADMIN_IDS: '' }).adminIds).toEqual([]);
		expect(parseConfig({ ...minimal, ADMIN_IDS: 'abc,0,-5' }).adminIds).toEqual([]);
	});

	test('parses ADMIN_CHAT_ID', () => {
		expect(parseConfig({ ...minimal, ADMIN_CHAT_ID: '-1001234567890' }).adminChatId).toBe(-1001234567890);
		expect(parseConfig({ ...minimal, ADMIN_CHAT_ID: 'abc' }).adminChatId).toBeNull();
	});

	test('strips @ from BOT_USERNAME', () => {
		expect(parseConfig({ ...minimal, BOT_USERNAME: '@mybot' }).botUsername).toBe('mybot');
		expect(parseConfig({ ...minimal, BOT_USERNAME: 'mybot' }).botUsername).toBe('mybot');
	});

	test('parses webhook config', () => {
		const cfg = parseConfig({
			...minimal,
			WEBHOOK_URL: 'https://example.com/',
			WEBHOOK_PATH: '/bot',
			WEBHOOK_SECRET: 'abc',
		});
		expect(cfg.webhookUrl).toBe('https://example.com');
		expect(cfg.webhookPath).toBe('/bot');
		expect(cfg.webhookSecret).toBe('abc');
	});

	test('parses BOT_PORT', () => {
		expect(parseConfig({ ...minimal, BOT_PORT: '3000' }).port).toBe(3000);
		expect(parseConfig({ ...minimal, BOT_PORT: 'abc' }).port).toBe(8081);
	});

	test('BROADCAST_WORKER defaults to true, "false" disables', () => {
		expect(parseConfig({ ...minimal }).broadcastWorker).toBe(true);
		expect(parseConfig({ ...minimal, BROADCAST_WORKER: 'false' }).broadcastWorker).toBe(false);
		expect(parseConfig({ ...minimal, BROADCAST_WORKER: 'true' }).broadcastWorker).toBe(true);
		expect(parseConfig({ ...minimal, BROADCAST_WORKER: 'yes' }).broadcastWorker).toBe(true);
	});

	test('ADMIN_LANG defaults to id', () => {
		expect(parseConfig({ ...minimal, ADMIN_LANG: 'en' }).adminLang).toBe('en');
		expect(parseConfig({ ...minimal, ADMIN_LANG: '' }).adminLang).toBe('id');
	});

	test('WEBHOOK_URL without trailing slash is kept as-is', () => {
		expect(parseConfig({ ...minimal, WEBHOOK_URL: 'https://example.com' }).webhookUrl).toBe('https://example.com');
	});

	test('WEBHOOK_URL strips multiple trailing slashes', () => {
		expect(parseConfig({ ...minimal, WEBHOOK_URL: 'https://example.com///' }).webhookUrl).toBe('https://example.com');
	});

	test('ADMIN_CHAT_ID rejects float and NaN strings', () => {
		expect(parseConfig({ ...minimal, ADMIN_CHAT_ID: '3.14' }).adminChatId).toBeNull();
		expect(parseConfig({ ...minimal, ADMIN_CHAT_ID: 'NaN' }).adminChatId).toBeNull();
		expect(parseConfig({ ...minimal, ADMIN_CHAT_ID: 'Infinity' }).adminChatId).toBeNull();
	});

	test('ADMIN_IDS with only invalid values yields empty array', () => {
		expect(parseConfig({ ...minimal, ADMIN_IDS: 'bad,bad2,NaN' }).adminIds).toEqual([]);
	});

	test('ADMIN_IDS filters out zero and negative', () => {
		expect(parseConfig({ ...minimal, ADMIN_IDS: '0,-1,5' }).adminIds).toEqual([5]);
	});

	test('CHANNEL_URL is passed through', () => {
		expect(parseConfig({ ...minimal, CHANNEL_URL: 'https://t.me/mychannel' }).channelUrl).toBe('https://t.me/mychannel');
		expect(parseConfig({ ...minimal, CHANNEL_URL: '' }).channelUrl).toBeNull();
		expect(parseConfig({ ...minimal, CHANNEL_URL: '  ' }).channelUrl).toBeNull();
	});

	test('PUBLIC_API_URL is passed through', () => {
		expect(parseConfig({ ...minimal, PUBLIC_API_URL: 'https://api.example.com' }).publicApiUrl).toBe('https://api.example.com');
		expect(parseConfig({ ...minimal, PUBLIC_API_URL: '' }).publicApiUrl).toBeNull();
	});

	test('BOT_PORT falls back to 8081 for float values', () => {
		expect(parseConfig({ ...minimal, BOT_PORT: '3.5' }).port).toBe(8081);
	});

	test('BOT_USERNAME with whitespace is trimmed', () => {
		expect(parseConfig({ ...minimal, BOT_USERNAME: '  @mybot  ' }).botUsername).toBe('mybot');
	});
});
