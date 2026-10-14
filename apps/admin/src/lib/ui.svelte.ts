// Global toast + confirm dialog state (rendered once by <UiHost/> in the app layout).

export interface Toast {
	id: number;
	kind: 'success' | 'error' | 'info';
	text: string;
}

export const toasts = $state<Toast[]>([]);
let seq = 0;

const MAX_TOASTS = 5;

function push(kind: Toast['kind'], text: string, ms = kind === 'error' ? 6000 : 3500) {
	const id = ++seq;
	while (toasts.length >= MAX_TOASTS) toasts.shift();
	toasts.push({ id, kind, text });
	setTimeout(() => dismissToast(id), ms);
}

export function dismissToast(id: number) {
	const i = toasts.findIndex((t) => t.id === id);
	if (i >= 0) toasts.splice(i, 1);
}

export const toast = {
	success: (t: string) => push('success', t),
	error: (t: string) => push('error', t),
	info: (t: string) => push('info', t)
};

export interface ConfirmRequest {
	title: string;
	body?: string;
	confirmLabel?: string;
	danger?: boolean;
	/** When set, the user must type a reason/note; the promise resolves with it. */
	input?: { label: string; placeholder?: string; required?: boolean };
}

interface Pending extends ConfirmRequest {
	resolve: (v: { ok: boolean; value: string }) => void;
}

export const confirmState = $state<{ current: Pending | null }>({ current: null });

export function confirmDialog(req: ConfirmRequest): Promise<{ ok: boolean; value: string }> {
	return new Promise((resolve) => {
		confirmState.current?.resolve({ ok: false, value: '' });
		confirmState.current = { ...req, resolve };
	});
}

export async function confirmAction(req: ConfirmRequest): Promise<boolean> {
	return (await confirmDialog(req)).ok;
}
