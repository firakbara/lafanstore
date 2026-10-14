// Checks a BotFather token against Telegram before it is stored.

export type VerifyResult =
	| { ok: true; username: string }
	| { ok: false; reason: 'invalid' | 'network'; message: string };

export async function verifyBotToken(token: string, fetchImpl: typeof fetch = fetch, timeoutMs = 10_000): Promise<VerifyResult> {
	let res: Response;
	try {
		res = await fetchImpl(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(timeoutMs) });
	} catch {
		return { ok: false, reason: 'network', message: 'Could not reach Telegram to check the bot token. Try again.' };
	}
	if (res.status === 401 || res.status === 404) {
		return { ok: false, reason: 'invalid', message: 'Telegram rejected this bot token. Copy it again from @BotFather.' };
	}
	const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: { is_bot?: boolean; username?: string } } | null;
	if (!res.ok || !body) return { ok: false, reason: 'network', message: `Telegram returned an error (${res.status}). Try again.` };
	if (!body.ok || !body.result?.is_bot || !body.result.username) {
		return { ok: false, reason: 'invalid', message: 'Telegram rejected this bot token. Copy it again from @BotFather.' };
	}
	return { ok: true, username: body.result.username };
}
