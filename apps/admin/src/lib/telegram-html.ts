// Pure helpers for Telegram parse_mode=HTML messages.

/** Telegram HTML subset check: only allowed tags, balanced. Returns an error message or null. */
export function validateTelegramHtml(html: string): string | null {
	const allowed = new Set(['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'a', 'code', 'pre', 'tg-spoiler', 'span', 'blockquote', 'tg-emoji']);
	const stack: string[] = [];
	const re = /<\/?([a-zA-Z-]+)(\s[^>]*)?\/?>/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(html))) {
		const tag = m[1]!.toLowerCase();
		if (!allowed.has(tag)) return `Tag <${tag}> is not supported by Telegram`;
		if (m[0].startsWith('</')) {
			if (stack.pop() !== tag) return `Unbalanced closing tag </${tag}>`;
		} else if (!m[0].endsWith('/>')) {
			stack.push(tag);
		}
	}
	if (stack.length) return `Unclosed tag <${stack[stack.length - 1]}>`;
	return null;
}
