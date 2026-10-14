import { describe, expect, test } from 'bun:test';
import { qrPng } from '../src/util/qr';

describe('qrPng', () => {
	test('returns PNG bytes for a short payload', async () => {
		const buf = await qrPng('https://example.com');
		expect(buf).toBeInstanceOf(Uint8Array);
		expect(buf.length).toBeGreaterThan(100);
		expect(buf[0]).toBe(0x89);
		expect(buf[1]).toBe(0x50); // P
		expect(buf[2]).toBe(0x4e); // N
		expect(buf[3]).toBe(0x47); // G
	});

	test('single character produces valid PNG', async () => {
		const buf = await qrPng('A');
		expect(buf[0]).toBe(0x89);
		expect(buf.length).toBeGreaterThan(0);
	});

	test('rejects payload exceeding 4096 chars', async () => {
		const big = 'x'.repeat(4097);
		expect(qrPng(big)).rejects.toThrow('QR payload too large');
	});

	test('moderately large payload still works', async () => {
		const data = '0'.repeat(2000);
		const buf = await qrPng(data);
		expect(buf).toBeInstanceOf(Uint8Array);
		expect(buf[0]).toBe(0x89);
	});

	test('handles QRIS-style numeric payload', async () => {
		const qris = '00020101021226610014COM.GO-JEK.WWW011893600911002300630210123456789005303360540450005802ID5925MERCHANT NAME6013CITY1234567890';
		const buf = await qrPng(qris);
		expect(buf).toBeInstanceOf(Uint8Array);
		expect(buf[0]).toBe(0x89);
	});

	test('handles unicode payload', async () => {
		const buf = await qrPng('Привет мир 🌍');
		expect(buf).toBeInstanceOf(Uint8Array);
		expect(buf[0]).toBe(0x89);
	});
});
