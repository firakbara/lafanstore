import { describe, expect, test } from 'bun:test';
import { ApiError, errorMessage } from './api';

describe('ApiError', () => {
	test('stores message, status, code, and field', () => {
		const err = new ApiError('Not found', 404, 'NOT_FOUND', 'email');
		expect(err.message).toBe('Not found');
		expect(err.status).toBe(404);
		expect(err.code).toBe('NOT_FOUND');
		expect(err.field).toBe('email');
	});

	test('is instanceof Error', () => {
		const err = new ApiError('fail', 500);
		expect(err).toBeInstanceOf(Error);
	});

	test('code and field are undefined when not provided', () => {
		const err = new ApiError('Unauthorized', 401);
		expect(err.code).toBeUndefined();
		expect(err.field).toBeUndefined();
	});

	test('message is accessible via .message', () => {
		const err = new ApiError('Bad request', 400, 'VALIDATION');
		expect(err.message).toBe('Bad request');
	});
});

describe('errorMessage', () => {
	test('returns .message for Error instance', () => {
		expect(errorMessage(new Error('boom'))).toBe('boom');
	});

	test('returns .message for ApiError instance', () => {
		expect(errorMessage(new ApiError('api fail', 500))).toBe('api fail');
	});

	test('returns the string for a string input', () => {
		expect(errorMessage('something broke')).toBe('something broke');
	});

	test('returns string of number for number input', () => {
		expect(errorMessage(42)).toBe('42');
	});

	test('returns "null" for null', () => {
		expect(errorMessage(null)).toBe('null');
	});

	test('returns "undefined" for undefined', () => {
		expect(errorMessage(undefined)).toBe('undefined');
	});

	test('returns "[object Object]" for plain object', () => {
		expect(errorMessage({})).toBe('[object Object]');
	});
});

describe('ApiError additional edge cases', () => {
	test('can be caught and identified via instanceof', () => {
		try {
			throw new ApiError('test', 400);
		} catch (e) {
			expect(e).toBeInstanceOf(ApiError);
			expect(e).toBeInstanceOf(Error);
		}
	});
	test('status 0 is stored (e.g. network failure)', () => {
		const err = new ApiError('network', 0);
		expect(err.status).toBe(0);
	});
	test('empty message is stored', () => {
		const err = new ApiError('', 500);
		expect(err.message).toBe('');
	});
	test('code without field is allowed', () => {
		const err = new ApiError('bad', 400, 'VALIDATION');
		expect(err.code).toBe('VALIDATION');
		expect(err.field).toBeUndefined();
	});
});

describe('errorMessage additional edge cases', () => {
	test('object with custom toString', () => {
		expect(errorMessage({ toString: () => 'custom' })).toBe('custom');
	});
	test('boolean false', () => {
		expect(errorMessage(false)).toBe('false');
	});
	test('empty string', () => {
		expect(errorMessage('')).toBe('');
	});
	test('Error subclass preserves message', () => {
		class MyError extends Error {
			code = 'X';
		}
		expect(errorMessage(new MyError('sub'))).toBe('sub');
	});
	test('ApiError with all fields set', () => {
		expect(errorMessage(new ApiError('err', 422, 'INVALID', 'email'))).toBe('err');
	});
});
