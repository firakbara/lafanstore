import type { StoreSettings, UserProfile } from '@tokobun/core';
import type { Context, SessionFlavor } from 'grammy';
import type { BotConfig } from './config';
import type { SessionData } from './util/session';
import type { View } from './util/view';

/** Context after the middleware chain in bot.ts ran (user/settings/v are set for private updates). */
export interface BotFlavor {
  cfg: BotConfig;
  storeId: number;
  user: UserProfile;
  settings: StoreSettings;
  v: View;
  /** Set once the callback query was answered (toast/alert), so the router doesn't answer twice. */
  answered: boolean;
}

export type BotContext = Context & SessionFlavor<SessionData> & BotFlavor;
