export function fmtDate(v: string | Date | null | undefined, withTime = true): string {
	if (!v) return '—';
	const d = typeof v === 'string' ? new Date(v) : v;
	if (Number.isNaN(d.getTime())) return '—';
	const pad = (n: number) => String(n).padStart(2, '0');
	const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	return withTime ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
}

export function fmtRelative(v: string | Date | null | undefined): string {
	if (!v) return '—';
	const d = typeof v === 'string' ? new Date(v) : v;
	const s = Math.round((Date.now() - d.getTime()) / 1000);
	const abs = Math.abs(s);
	const suffix = s >= 0 ? 'ago' : 'from now';
	if (abs < 60) return s >= 0 ? 'just now' : 'in a moment';
	if (abs < 3600) return `${Math.floor(abs / 60)}m ${suffix}`;
	if (abs < 86400) return `${Math.floor(abs / 3600)}h ${suffix}`;
	if (abs < 86400 * 30) return `${Math.floor(abs / 86400)}d ${suffix}`;
	return fmtDate(d, false);
}

export function fmtInt(n: number | null | undefined): string {
	return n == null ? '∞' : n.toLocaleString('en-US');
}

export function userLabel(u: { userId?: number; id?: number; username?: string | null; firstName?: string | null }): string {
	if (u.username) return `@${u.username}`;
	if (u.firstName) return u.firstName;
	return String(u.userId ?? u.id ?? '');
}
