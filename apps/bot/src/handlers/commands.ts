// Slash commands (private chat) + setMyCommands per language.
import { getProductByCode } from '@tokobun/core';
import { SUPPORTED_LANGUAGES, tp } from '@tokobun/i18n';
import type { Api, Composer } from 'grammy';
import type { BotContext } from '../context';
import { showMain } from './menu';
import { showApi, showLanguage, showOrders, showProfile } from './profile';
import { showProduct, showShop } from './shop';
import { showHelp } from './support';
import { showTopup } from './topup';

export const COMMANDS = ['start', 'shop', 'topup', 'orders', 'profile', 'language', 'support', 'api'] as const;

/** Parse the /start payload: product deep link or referral (referral is handled by upsertTelegramUser). */
export function parseStartPayload(payload: string): { productCode: string } | null {
  const m = /^product_([\w-]{1,64})$/.exec(payload.trim());
  return m ? { productCode: m[1]! } : null;
}

export function registerCommands(composer: Composer<BotContext>): void {
  const priv = composer.chatType('private');
  priv.command('start', async (ctx) => {
    delete ctx.session.input;
    const deep = parseStartPayload(ctx.match);
    if (deep) {
      const product = await getProductByCode(deep.productCode);
      if (product?.isActive && product.storeId === ctx.storeId) return showProduct(ctx, product.id, 1);
    }
    await showMain(ctx);
  });
  priv.command('shop', async (ctx) => showShop(ctx, 1, 'all', null));
  priv.command('topup', async (ctx) => showTopup(ctx));
  priv.command('orders', async (ctx) => showOrders(ctx));
  priv.command('profile', async (ctx) => showProfile(ctx));
  priv.command('language', async (ctx) => showLanguage(ctx));
  priv.command('support', async (ctx) => showHelp(ctx));
  priv.command('api', async (ctx) => showApi(ctx));
}

export async function setCommands(api: Api): Promise<void> {
  const list = (lang: string) => COMMANDS.map((c) => ({ command: c, description: tp(lang, `commands.${c}`) }));
  await api.setMyCommands(list('en'));
  for (const lang of SUPPORTED_LANGUAGES) {
    if (lang === 'en') continue;
    await api.setMyCommands(list(lang), { language_code: lang as 'en' });
  }
}
