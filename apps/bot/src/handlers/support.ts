// Bantuan + Dukungan Langsung (support relay).
// User side: a private-chat topic when the bot has topics enabled (ctx.me.has_topics_enabled),
// otherwise the plain private chat. Admin side: one forum topic per session in ADMIN_CHAT_ID;
// when topics can't be created there, admins reply to the relayed message instead.
import {
  closeSupportSession,
  findSupportSessionByAdminThread,
  getOpenSupportSession,
  getUser,
  openSupportSession,
  setSupportThreads,
  type SupportSession,
} from '@tokobun/core';
import { t, tp } from '@tokobun/i18n';
import type { Api, Bot } from 'grammy';
import type { Message } from 'grammy/types';
import { A } from '../callback';
import type { BotConfig } from '../config';
import type { BotContext } from '../context';
import { helpScreen, supportOpenedScreen } from '../screens/help';
import { displayName } from '../util/format';
import { show, toast } from '../util/render';
import type { CallbackMap } from './types';

/** Admin-chat message id → user id, for reply-based relaying when the admin chat has no topics. */
const relayed = new Map<number, number>();
const RELAYED_MAX = 5000;
function remember(adminMsgId: number, userId: number) {
  relayed.set(adminMsgId, userId);
  if (relayed.size > RELAYED_MAX) relayed.delete(relayed.keys().next().value!);
}

export async function showHelp(ctx: BotContext): Promise<void> {
  const open = await getOpenSupportSession(ctx.storeId, ctx.user.id);
  await show(
    ctx,
    helpScreen(ctx.v, {
      supportUsername: ctx.settings.supportUsername,
      supportOpen: !!open,
      liveSupport: !!ctx.cfg.adminChatId,
    }),
  );
}

async function openSession(ctx: BotContext): Promise<{ session: SupportSession; topicName: string | null }> {
  const existing = await getOpenSupportSession(ctx.storeId, ctx.user.id);
  const topicName = ctx.v.tp('support.topicName');
  if (existing) return { session: existing, topicName: existing.userThreadId ? topicName : null };

  const session = await openSupportSession(ctx.storeId, ctx.user.id);
  const admin = ctx.cfg.adminChatId!;
  let userThreadId: number | null = null;
  if (ctx.me.has_topics_enabled) {
    userThreadId = await ctx.api
      .createForumTopic(ctx.user.id, topicName)
      .then((tp) => tp.message_thread_id)
      .catch(() => null);
  }
  const adminTopic = tp(ctx.cfg.adminLang, 'support.adminTopic', { id: session.id, name: displayName(ctx.user) }).slice(0, 128);
  const adminThreadId = await ctx.api
    .createForumTopic(admin, adminTopic)
    .then((tp) => tp.message_thread_id)
    .catch(() => null);
  await setSupportThreads(session.id, { userThreadId, adminThreadId });

  const header = t(ctx.cfg.adminLang, 'support.adminHeader', {
    id: session.id,
    name: displayName(ctx.user),
    username: ctx.user.username ? `@${ctx.user.username}` : '',
    userId: ctx.user.id,
    balance: ctx.v.money(ctx.user.balance),
  });
  await ctx.api
    .sendMessage(admin, header, { parse_mode: 'HTML', ...(adminThreadId ? { message_thread_id: adminThreadId } : {}) })
    .then((m) => remember(m.message_id, ctx.user.id))
    .catch((err) => console.warn('[support] admin header failed:', (err as Error).message));
  if (userThreadId) {
    await ctx.api.sendMessage(ctx.user.id, ctx.v.t('support.welcomeTopic'), { message_thread_id: userThreadId }).catch(() => {});
  }
  return { session: { ...session, userThreadId, adminThreadId }, topicName: userThreadId ? topicName : null };
}

async function closeSession(api: Api, cfg: BotConfig, session: SupportSession): Promise<void> {
  await closeSupportSession(session.id);
  if (!cfg.adminChatId) return;
  const text = t(cfg.adminLang, 'support.adminClosed', { id: session.id });
  const thread = session.adminThreadId ? { message_thread_id: session.adminThreadId } : {};
  await api.sendMessage(cfg.adminChatId, text, { parse_mode: 'HTML', ...thread }).catch(() => {});
  if (session.adminThreadId) await api.closeForumTopic(cfg.adminChatId, session.adminThreadId).catch(() => {});
}

/** Relay a private message from the user to the admin chat. Returns false when no session is open. */
export async function relayUserMessage(ctx: BotContext): Promise<boolean> {
  const admin = ctx.cfg.adminChatId;
  if (!admin || !ctx.message) return false;
  const session = await getOpenSupportSession(ctx.storeId, ctx.user.id);
  if (!session) return false;
  const thread = session.adminThreadId ? { message_thread_id: session.adminThreadId } : {};
  const copy = await ctx.api.copyMessage(admin, ctx.chat!.id, ctx.message.message_id, thread);
  remember(copy.message_id, ctx.user.id);
  return true;
}

async function copyToUser(api: Api, session: SupportSession, msg: Message): Promise<void> {
  if (session.userThreadId) {
    const ok = await api
      .copyMessage(session.userId, msg.chat.id, msg.message_id, { message_thread_id: session.userThreadId })
      .then(() => true)
      .catch(() => false);
    if (ok) return;
  }
  await api.copyMessage(session.userId, msg.chat.id, msg.message_id);
}

/** Admin-chat side: replies in a session topic (or replies to a relayed message) go to the user. */
export function registerSupportRelay(bot: Bot<BotContext>, cfg: BotConfig): void {
  if (!cfg.adminChatId) return;
  const adminChat = bot.filter((ctx) => ctx.chat?.id === cfg.adminChatId && !!ctx.message && !ctx.from?.is_bot);

  adminChat.command('close', async (ctx) => {
    const thread = ctx.message?.message_thread_id;
    const session = thread ? await findSupportSessionByAdminThread(thread) : null;
    if (!session || session.status !== 'open') return;
    await closeSession(ctx.api, cfg, session);
    const user = await getUser(session.userId);
    await ctx.api.sendMessage(session.userId, t(user?.language ?? 'en', 'support.closedByAdmin')).catch(() => {});
  });

  adminChat.on('message', async (ctx, next) => {
    const msg = ctx.message!;
    if (msg.text?.startsWith('/')) return next();
    let session: SupportSession | null = null;
    if (msg.is_topic_message && msg.message_thread_id) session = await findSupportSessionByAdminThread(msg.message_thread_id);
    if (!session && msg.reply_to_message) {
      const userId = relayed.get(msg.reply_to_message.message_id);
      if (userId) session = await getOpenSupportSession(ctx.storeId, userId);
    }
    if (!session || session.status !== 'open') return next();
    await copyToUser(ctx.api, session, msg).catch((err) => console.warn('[support] relay to user failed:', (err as Error).message));
  });
}

export const supportCallbacks: CallbackMap = {
  [A.help]: async (ctx) => showHelp(ctx),
  [A.supportOpen]: async (ctx) => {
    if (!ctx.cfg.adminChatId) {
      await toast(ctx, ctx.v.tp('support.unavailable'), true);
      return;
    }
    const { topicName } = await openSession(ctx);
    await show(ctx, supportOpenedScreen(ctx.v, { topicName }));
  },
  [A.supportClose]: async (ctx) => {
    const session = await getOpenSupportSession(ctx.storeId, ctx.user.id);
    if (session) await closeSession(ctx.api, ctx.cfg, session);
    await toast(ctx, ctx.v.tp('support.closed'));
    await showHelp(ctx);
  },
};
