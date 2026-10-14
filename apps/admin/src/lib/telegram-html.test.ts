import { describe, expect, test } from 'bun:test';
import { validateTelegramHtml } from './telegram-html';

describe('validateTelegramHtml', () => {
	test('accepts supported, balanced markup', () => {
		expect(validateTelegramHtml('<b>Hi</b> <i>there</i> <a href="https://t.me/x">link</a> <code>x</code>')).toBeNull();
		expect(validateTelegramHtml('<tg-spoiler>secret</tg-spoiler><blockquote>q</blockquote>')).toBeNull();
		expect(validateTelegramHtml('plain text &amp; entities')).toBeNull();
	});
	test('rejects unsupported tags', () => {
		expect(validateTelegramHtml('<div>x</div>')).toContain('<div>');
		expect(validateTelegramHtml('<script>alert(1)</script>')).toContain('script');
	});
	test('rejects self-closing tags', () => {
		expect(validateTelegramHtml('<br/>')).toContain('<br>');
		expect(validateTelegramHtml('<img src="x"/>')).toContain('<img>');
	});
	test('rejects unbalanced markup', () => {
		expect(validateTelegramHtml('<b>open')).toContain('Unclosed');
		expect(validateTelegramHtml('<b><i>x</b></i>')).toContain('Unbalanced');
	});
	test('accepts empty string and plain text', () => {
		expect(validateTelegramHtml('')).toBeNull();
		expect(validateTelegramHtml('just text no tags')).toBeNull();
	});
	test('accepts deeply nested allowed tags', () => {
		expect(validateTelegramHtml('<b><i><u>deep</u></i></b>')).toBeNull();
	});
	test('self-closing allowed tags do not cause false unclosed error', () => {
		expect(validateTelegramHtml('text <tg-emoji/> more')).toBeNull();
	});
	test('accepts pre with nested code language class', () => {
		expect(validateTelegramHtml('<pre><code class="language-python">print(1)</code></pre>')).toBeNull();
	});
	test('handles HTML entities in text', () => {
		expect(validateTelegramHtml('price: &lt;$5 &amp; &gt;$1')).toBeNull();
	});
	test('unknown attributes on allowed tags pass through (Telegram strips them)', () => {
		expect(validateTelegramHtml('<a href="x" onclick="alert(1)">link</a>')).toBeNull();
		expect(validateTelegramHtml('<a href="javascript:void(0)">x</a>')).toBeNull();
	});
	test('rejects multiple unsupported tags in one string', () => {
		expect(validateTelegramHtml('<div>a</div><span>b</span>')).toContain('<div>');
	});
	test('accepts all semantic aliases', () => {
		expect(validateTelegramHtml('<strong>a</strong><em>b</em><ins>c</ins><del>d</del><strike>e</strike>')).toBeNull();
	});
});

describe('validateTelegramHtml additional edge cases', () => {
	test('very deeply nested tags (10 levels)', () => {
		const open = '<b><i><u><s><code><em><strong><ins><del><strike>';
		const close = '</strike></del></ins></strong></em></code></s></u></i></b>';
		expect(validateTelegramHtml(`${open}deep${close}`)).toBeNull();
	});

	test('empty tags are valid', () => {
		expect(validateTelegramHtml('<b></b>')).toBeNull();
		expect(validateTelegramHtml('<code></code>')).toBeNull();
	});

	test('XSS attempt: script inside allowed tag', () => {
		expect(validateTelegramHtml('<b><script>alert(1)</script></b>')).toContain('script');
	});

	test('XSS attempt: iframe tag', () => {
		expect(validateTelegramHtml('<iframe src="evil.com"></iframe>')).toContain('iframe');
	});

	test('XSS attempt: img with onerror', () => {
		expect(validateTelegramHtml('<img onerror="alert(1)"/>')).toContain('img');
	});

	test('XSS attempt: event handler attributes on allowed tags pass validation (Telegram strips them)', () => {
		// The validator only checks tag names, not attribute safety
		expect(validateTelegramHtml('<b onmouseover="alert(1)">text</b>')).toBeNull();
	});

	test('mixed case tags are accepted (lowercased internally)', () => {
		expect(validateTelegramHtml('<B>bold</B>')).toBeNull();
		expect(validateTelegramHtml('<Code>x</Code>')).toBeNull();
	});

	test('only a closing tag without opener is rejected', () => {
		expect(validateTelegramHtml('</b>')).toContain('Unbalanced');
	});

	test('multiple unclosed tags reports the last one on the stack', () => {
		const result = validateTelegramHtml('<b><i>');
		expect(result).toContain('Unclosed');
		expect(result).toContain('<i>');
	});

	test('adjacent tags with no text between them', () => {
		expect(validateTelegramHtml('<b></b><i></i><u></u>')).toBeNull();
	});

	test('tag with only whitespace content', () => {
		expect(validateTelegramHtml('<b>   </b>')).toBeNull();
	});

	test('tg-emoji tag', () => {
		expect(validateTelegramHtml('<tg-emoji emoji-id="123">emoji</tg-emoji>')).toBeNull();
	});

	test('span tag (used by Telegram for styling)', () => {
		expect(validateTelegramHtml('<span class="tg-spoiler">hidden</span>')).toBeNull();
	});

	test('very long text with no tags is valid', () => {
		const longText = 'a'.repeat(10_000);
		expect(validateTelegramHtml(longText)).toBeNull();
	});

	test('tag-like content in text (angle brackets without valid tag) passes through', () => {
		// "< b>" has a space so the regex won't match it as a tag
		expect(validateTelegramHtml('price < 100 and > 50')).toBeNull();
	});

	test('nested same tags are valid', () => {
		expect(validateTelegramHtml('<b><b>double bold</b></b>')).toBeNull();
	});

	test('wrong nesting order is caught', () => {
		expect(validateTelegramHtml('<b><i>text</b></i>')).toContain('Unbalanced');
	});

	test('form and input tags are rejected', () => {
		expect(validateTelegramHtml('<form><input/></form>')).toContain('form');
	});

	test('style and link tags are rejected', () => {
		expect(validateTelegramHtml('<style>body{}</style>')).toContain('style');
		expect(validateTelegramHtml('<link rel="stylesheet"/>')).toContain('link');
	});
});
