import { getActiveWalletData, getTokenBalance } from '../lib/walletLib.js';
import { sellToken } from '../lib/swap.js';
import { saveTrade, getUser } from '../lib/db.js';
import { sellSuccessMsg, sellFailMsg } from '../lib/notify.js';

export async function handleSell(ctx) {
  const telegramId = ctx.from.id;
  const args = ctx.message.text.split(/\s+/).slice(1);
  const ca = args[0];
  const percentStr = args[1];

  if (!ca || !ca.startsWith('0x') || ca.length !== 42) {
    return ctx.reply('Usage: /sell <CA> <percent>\nExample: /sell 0x1234...abcd 50\n(Use 100 to sell all)');
  }

  const percent = parseInt(percentStr) || 100;
  if (percent < 1 || percent > 100) return ctx.reply('❌ Percent must be 1-100.');

  const user = await getUser(telegramId);
  if (!user) return ctx.reply('Please use /start first.');

  const wallet = await getActiveWalletData(telegramId);

  let tokenBal;
  try {
    tokenBal = await getTokenBalance(wallet.address, ca);
  } catch (e) {
    return ctx.reply(
      `🦋 <b>Bubble Flap — Could Not Read Balance</b>\n\n⚠️ <b>Reason:</b> Unable to fetch token balance\n💡 <b>Fix:</b> Check your network or try again.`,
      { parse_mode: 'HTML' }
    );
  }

  if (tokenBal.formatted <= 0) {
    return ctx.reply(`❌ No ${tokenBal.symbol || 'token'} balance in your wallet.`);
  }

  const msg = await ctx.reply(`⏳ Selling ${percent}% of ${tokenBal.formatted.toLocaleString()} ${tokenBal.symbol}...`);

  try {
    const slippage = user.swap_slippage ?? user.slippage ?? 10;
    const result   = await sellToken(wallet.privateKey, ca, percent, slippage);
    await saveTrade(telegramId, ca, 'sell', result.receivedBnb, result.feeBnb, result.txHash, 'success');

    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
      sellSuccessMsg(ca, tokenBal.symbol, percent, result.receivedBnb, result.txHash, result.router || 'PancakeSwap'),
      { parse_mode: 'HTML' }
    );
  } catch (e) {
    await saveTrade(telegramId, ca, 'sell', 0, 0, null, 'failed');
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null,
      sellFailMsg(ca, e),
      { parse_mode: 'HTML' }
    );
  }
}
