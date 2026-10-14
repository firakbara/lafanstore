import { describe, expect, test } from 'bun:test';
import { CoreError } from '@tokobun/core';
import { tp } from '@tokobun/i18n';
import { errorText, isCoreError, isNotModified, isMessageGone, isBlocked, retryAfter } from '../src/util/errors';

describe('errorText', () => {
  test('returns translated text for CoreError instance', () => {
    const err = new CoreError('NOT_FOUND', 'product not found');
    expect(errorText(err, 'en')).toBe(tp('en', 'errors.NOT_FOUND'));
  });

  test('returns Indonesian translation for CoreError', () => {
    const err = new CoreError('NOT_FOUND');
    expect(errorText(err, 'id')).toBe(tp('id', 'errors.NOT_FOUND'));
  });

  test('returns translated text for duck-typed CoreError', () => {
    const err = { name: 'CoreError', code: 'USER_BANNED', message: 'banned' };
    expect(errorText(err, 'en')).toBe(tp('en', 'errors.USER_BANNED'));
  });

  test('returns generic error text for plain Error', () => {
    const err = new Error('something broke');
    expect(errorText(err, 'en')).toBe(tp('en', 'errors.GENERIC'));
  });

  test('returns generic error text for non-Error value', () => {
    expect(errorText('a string error', 'en')).toBe(tp('en', 'errors.GENERIC'));
  });

  test('returns generic error text for null', () => {
    expect(errorText(null, 'en')).toBe(tp('en', 'errors.GENERIC'));
  });

  test('returns generic error text for undefined', () => {
    expect(errorText(undefined, 'en')).toBe(tp('en', 'errors.GENERIC'));
  });

  test('duck-typed with non-string code falls back to generic', () => {
    const err = { name: 'CoreError', code: 42 };
    expect(errorText(err, 'en')).toBe(tp('en', 'errors.GENERIC'));
  });
});

describe('isCoreError', () => {
  test('true for CoreError instance', () => {
    expect(isCoreError(new CoreError('NOT_FOUND'))).toBe(true);
  });

  test('true for duck-typed CoreError', () => {
    expect(isCoreError({ name: 'CoreError', code: 'X' })).toBe(true);
  });

  test('false for generic Error', () => {
    expect(isCoreError(new Error('nope'))).toBe(false);
  });

  test('false for null', () => {
    expect(isCoreError(null)).toBe(false);
  });

  test('false for undefined', () => {
    expect(isCoreError(undefined)).toBe(false);
  });

  test('false for plain object without CoreError name', () => {
    expect(isCoreError({ name: 'TypeError', code: 'X' })).toBe(false);
  });
});

describe('isNotModified', () => {
  test('true for "message is not modified" description', () => {
    expect(isNotModified({ description: 'Bad Request: message is not modified' })).toBe(true);
  });

  test('true case-insensitive', () => {
    expect(isNotModified({ description: 'Message Is Not Modified' })).toBe(true);
  });

  test('false for unrelated description', () => {
    expect(isNotModified({ description: 'something else' })).toBe(false);
  });

  test('false for null', () => {
    expect(isNotModified(null)).toBe(false);
  });

  test('false for empty object', () => {
    expect(isNotModified({})).toBe(false);
  });

  test('matches via message field if no description', () => {
    expect(isNotModified({ message: 'message is not modified' })).toBe(true);
  });
});

describe('isMessageGone', () => {
  test('matches "message to edit not found"', () => {
    expect(isMessageGone({ description: 'Bad Request: message to edit not found' })).toBe(true);
  });

  test('matches "message can\'t be edited"', () => {
    expect(isMessageGone({ description: "message can't be edited" })).toBe(true);
  });

  test('matches "message to delete not found"', () => {
    expect(isMessageGone({ description: 'message to delete not found' })).toBe(true);
  });

  test('matches "there is no text in the message"', () => {
    expect(isMessageGone({ description: 'Bad Request: there is no text in the message' })).toBe(true);
  });

  test('matches "there is no caption in the message"', () => {
    expect(isMessageGone({ description: 'there is no caption in the message' })).toBe(true);
  });

  test('matches "MESSAGE_ID_INVALID"', () => {
    expect(isMessageGone({ description: 'MESSAGE_ID_INVALID' })).toBe(true);
  });

  test('false for unrelated description', () => {
    expect(isMessageGone({ description: 'some other error' })).toBe(false);
  });

  test('false for null', () => {
    expect(isMessageGone(null)).toBe(false);
  });

  test('matches via message field if no description', () => {
    expect(isMessageGone({ message: 'message to edit not found' })).toBe(true);
  });
});

describe('isBlocked', () => {
  test('true for error_code 403', () => {
    expect(isBlocked({ error_code: 403, description: 'Forbidden' })).toBe(true);
  });

  test('true for "bot was blocked"', () => {
    expect(isBlocked({ description: 'Forbidden: bot was blocked by the user' })).toBe(true);
  });

  test('true for "user is deactivated"', () => {
    expect(isBlocked({ description: 'Forbidden: user is deactivated' })).toBe(true);
  });

  test('true for "chat not found"', () => {
    expect(isBlocked({ description: 'Bad Request: chat not found' })).toBe(true);
  });

  test('false for unrelated error', () => {
    expect(isBlocked({ error_code: 400, description: 'Bad Request' })).toBe(false);
  });

  test('false for null', () => {
    expect(isBlocked(null)).toBe(false);
  });

  test('error_code 403 without description still matches', () => {
    expect(isBlocked({ error_code: 403 })).toBe(true);
  });

  test('matches via message fallback', () => {
    expect(isBlocked({ message: 'bot was blocked by the user' })).toBe(true);
  });
});

describe('retryAfter', () => {
  test('extracts retry_after from parameters', () => {
    expect(retryAfter({ parameters: { retry_after: 30 } })).toBe(30);
  });

  test('returns null when no parameters', () => {
    expect(retryAfter({ description: 'error' })).toBeNull();
  });

  test('returns null when parameters lacks retry_after', () => {
    expect(retryAfter({ parameters: {} })).toBeNull();
  });

  test('returns null for null error', () => {
    expect(retryAfter(null)).toBeNull();
  });

  test('returns null for undefined', () => {
    expect(retryAfter(undefined)).toBeNull();
  });

  test('returns 0 when retry_after is 0', () => {
    expect(retryAfter({ parameters: { retry_after: 0 } })).toBe(0);
  });
});
