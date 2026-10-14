import { healthCheck } from '@tokobun/core';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
	try {
		await healthCheck();
		return Response.json({ ok: true, time: new Date().toISOString() });
	} catch {
		return Response.json({ ok: false, time: new Date().toISOString() }, { status: 503 });
	}
};
