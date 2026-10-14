// Environment parsing for the bot process. Pure (takes an env object) so it is testable.
export interface BotConfig {
  botToken: string;
  botUsername: string | null;
  adminIds: number[];
  adminChatId: number | null;
  channelUrl: string | null;
  /** Language used for messages sent to the admin chat. */
  adminLang: string;
  /** Public base URL of the reseller API (apps/api), shown on the Developer API screen. */
  publicApiUrl: string | null;
  /** When set, the bot runs in webhook mode; Telegram posts to `${webhookUrl}${webhookPath}`. */
  webhookUrl: string | null;
  webhookPath: string;
  webhookSecret: string | null;
  port: number;
  /** Run the broadcast sender inside this process. */
  broadcastWorker: boolean;
}

const str = (v: string | undefined): string | null => {
  const s = v?.trim();
  return s ? s : null;
};

const int = (v: string | undefined): number | null => {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
};

export function parseConfig(env: Record<string, string | undefined>): BotConfig {
  // Per-store tokens live in the stores table; BOT_TOKEN is only a legacy fallback value.
  const botToken = str(env.BOT_TOKEN) ?? '';
  const adminIds = (env.ADMIN_IDS ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isSafeInteger(n) && n > 0);
  return {
    botToken,
    botUsername: str(env.BOT_USERNAME)?.replace(/^@/, '') ?? null,
    adminIds,
    adminChatId: int(env.ADMIN_CHAT_ID),
    channelUrl: str(env.CHANNEL_URL),
    adminLang: str(env.ADMIN_LANG) ?? 'id',
    publicApiUrl: str(env.PUBLIC_API_URL),
    webhookUrl: str(env.WEBHOOK_URL)?.replace(/\/+$/, '') ?? null,
    webhookPath: str(env.WEBHOOK_PATH) ?? '/telegram',
    webhookSecret: str(env.WEBHOOK_SECRET),
    port: int(env.BOT_PORT) ?? 8081,
    broadcastWorker: (env.BROADCAST_WORKER ?? 'true') !== 'false',
  };
}
