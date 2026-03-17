import { getUserWallets, getWallet, deleteWallet, getTradedCAs } from '../lib/db.js';
import { getBnbBalance, getTokenBalance } from '../lib/walletLib.js';

function shortAddr(addr) {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function walletTag(w) {
  return w.address.slice(-4);
}

// ─── Main Account Page ────────────────────────────────────────────────────────
export async function showAccountPage(ctx, telegramId, editMsgId = null) {
  const wallets = await getUserWallets(telegramId);

  const balances = await Promise.all(
    wallets.map(w => getBnbBalance(w.address).catch(() => 0))
  );

  const lines = wallets.map((w, i) => {
    const bnb  = Number(balances[i] || 0).toFixed(4);
    const tag  = walletTag(w);
    const num  = String(i + 1).padStart(2, '0');
    const def  = w.is_default ? ' ★' : '';
    return `${num}: <a href="https://bscscan.com/address/${w.address}">${w.address}</a>(Wallet ${tag}${def}), ${bnb} BNB`;
  }).join('\n');

  const text =
    `🔒 <b>Account — BSC</b>\n\n` +
    `There are a total of <b>${wallets.length}</b> wallet${wallets.length !== 1 ? 's' : ''} under the current account:\n\n` +
    `${lines || '—'}`;

  const viewRows = wallets.map(w => ([{
    text: `💳 View Wallet ${walletTag(w)}`,
    callback_data: `acct_view_${w.id}`,
  }]));

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🌟 Create Wallet',  callback_data: 'wl_gen'    },
        { text: '🌙 Import Wallet',  callback_data: 'wl_import' },
      ],
      [{ text: '😖 Delete Wallet', callback_data: 'acct_delete' }],
      ...viewRows,
      [{ text: '⬅️ Back', callback_data: 'close_msg' }],
    ],
  };

  const opts = { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: keyboard };

  if (editMsgId) {
    return ctx.telegram.editMessageText(ctx.chat.id, editMsgId, null, text, opts)
      .catch(() => ctx.reply(text, opts));
  }
  return ctx.reply(text, opts);
}

// ─── Delete Wallet Selection ──────────────────────────────────────────────────
export async function showAccountDeletePage(ctx, telegramId, editMsgId = null) {
  const wallets = await getUserWallets(telegramId);

  let text =
    `🗑️ <b>Delete Wallet</b>\n\n` +
    `Select the wallet you want to delete. Please ensure that the wallet has been backed up or asset transferred to avoid asset loss.`;

  let rows;
  if (wallets.length <= 1) {
    text += `\n\n⚠️ You cannot delete your only wallet.`;
    rows = [];
  } else {
    rows = wallets.map(w => ([{
      text: `🗑 Delete Wallet ${walletTag(w)}${w.is_default ? ' ★' : ''}`,
      callback_data: `acct_delconfirm_${w.id}`,
    }]));
  }

  const keyboard = {
    inline_keyboard: [
      ...rows,
      [{ text: '⬅️ Back', callback_data: 'acct_main' }],
    ],
  };

  const opts = { parse_mode: 'HTML', reply_markup: keyboard };

  if (editMsgId) {
    return ctx.telegram.editMessageText(ctx.chat.id, editMsgId, null, text, opts)
      .catch(() => ctx.reply(text, opts));
  }
  return ctx.reply(text, opts);
}

// ─── View Wallet Assets ───────────────────────────────────────────────────────
export async function showViewWallet(ctx, telegramId, walletId, editMsgId = null) {
  const w = await getWallet(telegramId, walletId);
  if (!w) return ctx.reply('❌ Wallet not found.');

  const tag = walletTag(w);
  const bnb = await getBnbBalance(w.address).catch(() => 0);

  const tradedCAs = await getTradedCAs(telegramId);

  const holdings = [];
  await Promise.allSettled(
    tradedCAs.map(async ca => {
      const bal = await getTokenBalance(w.address, ca).catch(() => null);
      if (bal && Number(bal.formatted) > 0) {
        holdings.push({ ca, symbol: bal.symbol || ca.slice(0, 8), amount: Number(bal.formatted) });
      }
    })
  );

  const tokenLines = holdings.map(h =>
    `• <b>${h.symbol}</b>: ${h.amount.toFixed(4)} ` +
    `(<a href="https://bscscan.com/token/${h.ca}?a=${w.address}">view</a>)`
  );

  const tokenSection = tokenLines.length
    ? `\n\n<b>Tokens:</b>\n${tokenLines.join('\n')}`
    : '\n\n<i>No token holdings found.</i>';

  const text =
    `Network: BSC\n\n` +
    `💳 <b>Wallet ${tag}</b>\n` +
    `<a href="https://bscscan.com/address/${w.address}">${w.address}</a>\n` +
    `Balance: <b>${Number(bnb).toFixed(4)} BNB</b>\n` +
    `👆 <i>Click Token To Swap</i>` +
    tokenSection;

  const tokenButtons = holdings.slice(0, 8).map(h => ([{
    text: `🔄 ${h.symbol}`,
    callback_data: `bs_refresh_${h.ca}`,
  }]));

  const keyboard = {
    inline_keyboard: [
      [{ text: `✅ 💳 Wallet ${tag}`, callback_data: 'noop' }],
      ...tokenButtons,
      [{ text: '⬅️ Back to Account', callback_data: 'acct_main' }],
    ],
  };

  const opts = { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: keyboard };

  if (editMsgId) {
    return ctx.telegram.editMessageText(ctx.chat.id, editMsgId, null, text, opts)
      .catch(() => ctx.reply(text, opts));
  }
  return ctx.reply(text, opts);
}
