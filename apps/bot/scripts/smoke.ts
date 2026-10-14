// Offline end-to-end smoke: feeds fake updates through the real bot + core + DB, with every
// Telegram API call intercepted (nothing is sent). Usage: bun --env-file=../../.env scripts/smoke.ts
import type { Update } from 'grammy/types';
import { createBot } from '../src/bot';
import { parseConfig } from '../src/config';

const USER_ID = 990_000_001; // fake Telegram user (row is created in the DB)
const cfg = parseConfig({ ...process.env, BOT_TOKEN: process.env.BOT_TOKEN || 'smoke:token', ADMIN_CHAT_ID: '' });
const bot = createBot(cfg, 1);
bot.botInfo = {
  id: 1, is_bot: true, first_name: 'Smoke', username: cfg.botUsername ?? 'smoke_bot', can_join_groups: false,
  can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business: false,
  has_main_web_app: false, has_topics_enabled: false, allows_users_to_create_topics: false,
} as typeof bot.botInfo;

let msgId = 100;
let lastMarkup: { inline_keyboard: { text: string; callback_data?: string }[][] } | undefined;
bot.api.config.use(async (_prev, method, payload) => {
  const p = payload as Record<string, unknown>;
  if (p.reply_markup) lastMarkup = p.reply_markup as typeof lastMarkup;
  const text = (p.text ?? p.caption ?? '') as string;
  console.log(`→ ${method}${text ? `\n${text}` : ''}${p.reply_markup ? `\n  ${JSON.stringify((p.reply_markup as { inline_keyboard: { text: string }[][] }).inline_keyboard.map((r) => r.map((b) => b.text)))}` : ''}${p.text === undefined && p.callback_query_id ? ` ${JSON.stringify(p)}` : ''}\n`);
  const result = method.startsWith('send') || method === 'copyMessage'
    ? { message_id: ++msgId, date: 0, chat: { id: USER_ID, type: 'private' } }
    : true;
  return { ok: true, result } as never;
});

const from = { id: USER_ID, is_bot: false, first_name: 'Smoke', language_code: 'id' };
const chat = { id: USER_ID, type: 'private' as const, first_name: 'Smoke' };
let uid = 1;
const text = (t: string): Update => ({
  update_id: uid++,
  message: { message_id: ++msgId, date: 0, chat, from, text: t, ...(t.startsWith('/') ? { entities: [{ type: 'bot_command', offset: 0, length: t.split(' ')[0]!.length }] } : {}) },
});
const press = (data: string): Update => ({
  update_id: uid++,
  callback_query: { id: String(uid), from, chat_instance: 'c', data, message: { message_id: msgId, date: 0, chat, text: 'menu' } },
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const handle = async (u: Update) => {
  await bot.handleUpdate(u);
  await sleep(400);
};
const find = (pred: (label: string) => boolean) =>
  lastMarkup?.inline_keyboard.flat().find((b) => b.callback_data && pred(b.text))?.callback_data;

await handle(text('/start'));
await handle(press('s:1:a:0'));
const first = find((l) => l.includes('(Stok:') && !l.includes('Stok: 0'));
if (first) {
  await handle(press(first));
  await handle(press(find((l) => l === '5')!));
  await handle(press(find((l) => l.includes('Catatan'))!));
}
await handle(press('pr'));
await handle(press('nt'));
await handle(press('r'));
await handle(press('t'));
const method = find(() => true);
if (method?.startsWith('tm:')) {
  await handle(press(method));
  await handle(text('50000'));
  const check = find((l) => l.includes('Cek Status'));
  if (check) await handle(press(check));
  const cancel = find((l) => l.includes('Batalkan'));
  if (cancel) await handle(press(cancel));
}
await handle(press('mo'));
await handle(press('2f'));
await handle(text('JBSWY3DPEHPK3PXP'));
await handle(press('hs')); // support without ADMIN_CHAT_ID → alert
console.log('smoke done');
process.exit(0);
