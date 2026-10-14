import type { FetchLike } from '../src/providers/types';

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Fake fetch: `routes` maps a URL-path suffix (e.g. "/transaction/create") to a JSON response. */
export function fakeFetch(routes: Record<string, unknown | ((call: RecordedCall) => unknown)>) {
  const calls: RecordedCall[] = [];
  const fn: FetchLike = async (input, init) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    const call: RecordedCall = {
      url,
      method: init?.method ?? 'GET',
      headers,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    };
    calls.push(call);
    const path = new URL(url).pathname;
    const key = Object.keys(routes).find((k) => path.endsWith(k));
    if (!key) return new Response(JSON.stringify({ success: false, ok: false, message: 'no route' }), { status: 404 });
    const r = routes[key];
    const payload = typeof r === 'function' ? (r as (c: RecordedCall) => unknown)(call) : r;
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetch: fn, calls };
}
