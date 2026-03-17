import { ethers } from 'ethers';
import {
  deriveUserWallet, getBnbBalance, encryptKey, decryptKey,
  seedHdWalletIfNeeded, getActiveWalletData,
} from '../lib/walletLib.js';
import {
  getUser, getUserWallets, getWallet, getDefaultWallet,
  countUserWallets, createWalletRecord, setDefaultWallet,
  toggleManualWallet, renameWallet, deleteWallet,
} from '../lib/db.js';

function fmtBnb(n) {
  if (n === 0) return '0 BNB';
  if (n >= 0.001) return `${n.toFixed(4)} BNB`;
  return `${n.toExponential(3)} BNB`;
}

// ─── /wallet command entry point ─────────────────────────────────────────────
export async function handleWallet(ctx) {
  const telegramId = ctx.from.id;
  try {
    const user = await getUser(telegramId);
    if (!user) return ctx.reply('Please use /start first.');
    await seedHdWalletIfNeeded(telegramId);
    await showWalletList(ctx, telegramId);
  } catch (e) {
    console.error('[/wallet]', e.message);
    await ctx.reply('❌ Error loading wallets. Try again.');
  }
}

// ─── Wallet list view ─────────────────────────────────────────────────────────
export async function showWalletList(ctx, telegramId, editMsgId = null) {
  const wallets = await getUserWallets(telegramId);
  const balances = await Promise.all(
    wallets.map(w => getBnbBalance(w.address).catch(() => 0))
  );

  const defWallet = wallets.find(w => w.is_default);

  let text = '🔗 <b>BSC — My Wallets</b>\n\n';
  for (let i = 0; i < wallets.length; i++) {
    const w   = wallets[i];
    const bal = balances[i];
    const def = w.is_default ? '🟢 Default' : '🔴 Default';
    const man = w.is_manual  ? '🟢 Manual'  : '🔴 Manual';
    text +=
      `<a href="https://bscscan.com/address/${w.address}"><b>${w.name}</b></a> (<code>${w.address}</code>)\n` +
      `${def} | ${man} | 💰 ${fmtBnb(bal)}\n\n`;
  }

  text +=
    `ℹ️ <i>Enable "Manual" for wallets used in manual buys. The 🟢 Default wallet is used for all automated trades.</i>`;

  const rows = [];

  if (defWallet) {
    rows.push([{ text: `Default Wallet | ${defWallet.name}`, callback_data: 'noop' }]);
  }

  for (const w of wallets) {
    rows.push([
      { text: `⚙️ ${w.name}`,                                    callback_data: `wl_view_${w.id}` },
      { text: w.is_manual ? '🟢 Manual' : '🔴 Manual',           callback_data: `wl_manual_${w.id}` },
      { text: w.is_default ? '🔒' : '❌',                        callback_data: w.is_default ? 'noop' : `wl_delask_${w.id}` },
    ]);
  }

  if (wallets.length < 5) {
    rows.push([
      { text: '📥 Import Wallet',   callback_data: 'wl_import' },
      { text: '🔑 Generate Wallet', callback_data: 'wl_gen'    },
    ]);
  } else {
    rows.push([{ text: '⚠️ Max 5 wallets reached', callback_data: 'noop' }]);
  }

  rows.push([{ text: '⬅️ Back', callback_data: 'menu_main' }]);

  const opts = {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: rows },
  };

  if (editMsgId) {
    return ctx.telegram.editMessageText(ctx.chat.id, editMsgId, null, text, opts)
      .catch(() => ctx.reply(text, opts));
  }
  return ctx.reply(text, opts);
}

// ─── Single wallet detail view ────────────────────────────────────────────────
export async function showWalletDetail(ctx, telegramId, walletId, editMsgId = null) {
  const w = await getWallet(telegramId, walletId);
  if (!w) return ctx.reply('❌ Wallet not found.');

  const bal = await getBnbBalance(w.address).catch(() => 0);
  const def = w.is_default ? '🟢 Default' : '🔴 Default';
  const man = w.is_manual  ? '🟢 Manual'  : '🔴 Manual';

  const text =
    `🔗 <b>BSC — ${w.name}</b>\n\n` +
    `<a href="https://bscscan.com/address/${w.address}">${w.name}</a> (<code>${w.address}</code>)\n` +
    `${def} | ${man} | 💰 ${fmtBnb(bal)}\n\n` +
    `ℹ️ <i>Enable "Manual" for wallets participating in manual buys. Automated buys use the 🟢 Default wallet.</i>`;

  const rows = [
    [
      { text: '⬅️ Back',   callback_data: 'wl_list' },
      { text: '✏️ Rename', callback_data: `wl_rename_${w.id}` },
    ],
    [
      {
        text: w.is_default ? '🟢 Default (active)' : '🔴 Set as Default',
        callback_data: w.is_default ? 'noop' : `wl_default_${w.id}`,
      },
      {
        text: w.is_manual ? '🟢 Manual ON' : '🔴 Manual OFF',
        callback_data: `wl_manual_${w.id}`,
      },
    ],
    [
      { text: '💸 Send BNB', callback_data: `wl_sendb_${w.id}` },
      { text: '🔑 Export Key', callback_data: `wl_export_${w.id}` },
    ],
    [
      { text: '🗑️ Remove Wallet', callback_data: `wl_delask_${w.id}` },
    ],
  ];

  const opts = {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: rows },
  };

  if (editMsgId) {
    return ctx.telegram.editMessageText(ctx.chat.id, editMsgId, null, text, opts)
      .catch(() => ctx.reply(text, opts));
  }
  return ctx.reply(text, opts);
}

// ─── Export private key (ephemeral message) ───────────────────────────────────
export async function handleExportKey(ctx) {
  const telegramId = ctx.from.id;
  try {
    const w = await getActiveWalletData(telegramId);
    await ctx.replyWithMarkdown(
      `🔑 *Private Key — ${w.name || 'Your Wallet'}*\n\n` +
      `\`${w.privateKey}\`\n\n` +
      `⚠️ *NEVER share this with anyone.*\n` +
      `Import into MetaMask or any EVM wallet.\n\n` +
      `*Delete this message after saving.*`
    );
  } catch (e) {
    await ctx.reply('❌ Error exporting key.');
  }
}
