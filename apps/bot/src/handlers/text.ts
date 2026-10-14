// Private messages that are not commands: pending text input first, then support relay,
// otherwise re-show the main menu.
import type { Composer } from 'grammy';
import type { BotContext } from '../context';
import { showMain } from './menu';
import { onTwofaInput } from './more';
import { onWithdrawInput } from './referral';
import { onVoucherInput } from './shop';
import { relayUserMessage } from './support';
import { onTopupAmount } from './topup';

async function handleInput(ctx: BotContext, text: string): Promise<boolean> {
  const input = ctx.session.input;
  if (!input) return false;
  switch (input.kind) {
    case 'topup':
      await onTopupAmount(ctx, input, text);
      return true;
    case 'voucher':
      await onVoucherInput(ctx, input, text);
      return true;
    case 'twofa':
      await onTwofaInput(ctx, text);
      return true;
    case 'withdraw':
      await onWithdrawInput(ctx, input, text);
      return true;
    default:
      input satisfies never;
      return false;
  }
}

export function registerText(composer: Composer<BotContext>): void {
  const priv = composer.chatType('private');
  priv.on('message', async (ctx) => {
    const text = ctx.message.text;
    if (text?.startsWith('/')) return; // unknown command
    if (text !== undefined && (await handleInput(ctx, text))) return;
    if (await relayUserMessage(ctx)) return;
    await showMain(ctx);
  });
}
