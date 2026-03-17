import { getUser, createSnipe, cancelUserSnipes } from '../lib/db.js';
import { deriveUserWallet, getBnbBalance } from '../lib/walletLib.js';

export async function doSnipe(ctx, telegramId, ca, bnbAmount) {
  const user = await getUser(telegramId);
  if (!user) return ctx.reply('Please use /start first.');

  const wallet = deriveUserWallet(telegramId);
  const balance = await getBnbBalance(wallet.address).catch(() => 0);

  if (balance < bnbAmount + 0.003) {
    return ctx.replyWithMarkdown(`❌ *Insufficient BNB*\nBalance: ${balance.toFixed(4)} BNB\nNeeded: ${(bnbAmount + 0.003).toFixed(4)} BNB\n\nDeposit to:\n\`${wallet.address}\``);
  }

  const snipe = await createSnipe(telegramId, ca, bnbAmount);

  await ctx.replyWithMarkdown(`🎯 *Snipe Set!*

Token: \`${ca}\`
Amount: ${bnbAmount} BNB

Watching for first on-chain trade...
Use /cancel to stop.

ID: #${snipe.id}`);
}

export async function handleSnipe(ctx) {
  const telegramId = ctx.from.id;
  const args = ctx.message.text.split(/\s+/).slice(1);
  const ca = args[0];
  const bnbStr = args[1] || '0.05';

  if (!ca || !ca.startsWith('0x') || ca.length !== 42) {
    return ctx.reply('Usage: /snipe <CA> [BNB amount]\nExample: /snipe 0x1234...abcd 0.1');
  }

  const bnbAmount = parseFloat(bnbStr);
  if (isNaN(bnbAmount) || bnbAmount <= 0) return ctx.reply('❌ Invalid BNB amount.');

  return doSnipe(ctx, telegramId, ca, bnbAmount);
}
