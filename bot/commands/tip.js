import { ethers } from 'ethers';
import { getActiveWalletData, getBnbBalance, getTokenBalance, getProvider, decryptKey } from '../lib/walletLib.js';
import { getUser, getUserByUsername, savePendingTip, getPendingTipsForUser, markTipCompleted, markTipFailed, getUserLanguage, getDefaultWallet } from '../lib/db.js';

const BFLAP_CA    = '0xa2320fff1069ED5b4B02dDb386823E837A7e7777';
const MIN_BNB_GAS = 0.001;
const RATE_LIMIT_MS = 30_000;
const MAX_PARTY = 20;

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
];

const tipCooldown = new Map();

function isRateLimited(userId) {
  const last = tipCooldown.get(userId);
  if (!last) return false;
  return Date.now() - last < RATE_LIMIT_MS;
}
function setRateLimit(userId) { tipCooldown.set(userId, Date.now()); }

async function transferBflap(privateKey, toAddress, amountDisplay) {
  const provider = getProvider();
  const signer   = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(BFLAP_CA, ERC20_ABI, signer);
  const decimals = await contract.decimals();
  const amountWei = ethers.parseUnits(String(amountDisplay), decimals);
  const tx = await contract.transfer(toAddress, amountWei);
  await tx.wait(1);
  return tx.hash;
}

async function getBflapPriceUsd() {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${BFLAP_CA}`);
    const json = await res.json();
    const pair = json?.pairs?.[0];
    return pair?.priceUsd ? parseFloat(pair.priceUsd) : 0;
  } catch { return 0; }
}

function partyEmojis(amount, priceUsd) {
  if (!priceUsd || priceUsd <= 0) return '💸';
  const usdValue = amount * priceUsd;
  const count = Math.max(1, Math.min(MAX_PARTY, Math.floor(usdValue / 10)));
  return '💸'.repeat(count);
}

function isGroup(ctx) {
  const type = ctx.chat?.type;
  return type === 'group' || type === 'supergroup' || type === 'channel';
}

async function autoDelete(ctx, msgId, ms = 30_000) {
  setTimeout(() => {
    ctx.telegram.deleteMessage(ctx.chat.id, msgId).catch(() => {});
  }, ms);
}

async function replyAndAutoDel(ctx, text, opts = {}) {
  const msg = await ctx.reply(text, { parse_mode: 'HTML', disable_web_page_preview: true, ...opts });
  if (isGroup(ctx)) autoDelete(ctx, msg.message_id);
  return msg;
}

async function editAndAutoDel(ctx, msgId, text, autodel = true) {
  await ctx.telegram.editMessageText(ctx.chat.id, msgId, null, text, {
    parse_mode: 'HTML', disable_web_page_preview: true,
  }).catch(async () => {
    const m = await ctx.reply(text, { parse_mode: 'HTML', disable_web_page_preview: true }).catch(() => null);
    if (m && isGroup(ctx) && autodel) autoDelete(ctx, m.message_id);
  });
  if (isGroup(ctx) && autodel) autoDelete(ctx, msgId);
}

export async function handleTip(ctx) {
  const senderId       = ctx.from?.id;
  const senderHandle   = ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name || 'Someone';
  const senderUsername = (ctx.from?.username || '').toLowerCase();

  const args        = (ctx.message?.text || '').trim().split(/\s+/);
  const replyUser   = ctx.message?.reply_to_message?.from;
  const isReply     = !!replyUser && !replyUser.is_bot;

  const usageHint =
    '💸 <b>Tip BFLAP to another user</b>\n\n' +
    'Usage: <code>/tip &lt;amount&gt; @username</code>\n' +
    'Or reply to a message: <code>/tip &lt;amount&gt;</code>\n' +
    'Example: <code>/tip 10000 @aamon</code>\n\n' +
    '• Amount in BFLAP tokens\n' +
    '• Works in private chat, groups &amp; channels\n' +
    '• Tip is held if recipient hasn\'t joined yet';

  if (args.length < 2) {
    return replyAndAutoDel(ctx, usageHint);
  }

  const rawAmount = args[1].replace(/,/g, '');
  const amount    = parseFloat(rawAmount);
  if (isNaN(amount) || amount <= 0) {
    return replyAndAutoDel(ctx, '❌ Invalid amount. Example: <code>/tip 10000 @aamon</code>');
  }

  let recipientUsername;
  let recipientTelegramId = null;
  let recipientDisplayName;

  if (isReply) {
    recipientUsername    = (replyUser.username || '').toLowerCase();
    recipientTelegramId  = replyUser.id;
    recipientDisplayName = replyUser.username ? `@${replyUser.username}` : replyUser.first_name;
  } else {
    if (args.length < 3) {
      return replyAndAutoDel(ctx, usageHint);
    }
    recipientUsername    = args[2].replace(/^@/, '').toLowerCase();
    recipientDisplayName = `@${recipientUsername}`;
  }

  if (!recipientUsername && !recipientTelegramId) {
    return replyAndAutoDel(ctx, '❌ Please specify a recipient. Example: <code>/tip 10000 @aamon</code>');
  }
  if (recipientTelegramId === senderId || (recipientUsername && recipientUsername === senderUsername)) {
    return replyAndAutoDel(ctx, '❌ You cannot tip yourself.');
  }

  if (isRateLimited(senderId)) {
    const remaining = Math.ceil((RATE_LIMIT_MS - (Date.now() - tipCooldown.get(senderId))) / 1000);
    return replyAndAutoDel(ctx, `⏱ Please wait <b>${remaining}s</b> before tipping again.`);
  }

  const processing = await ctx.reply('💸 Processing tip...', { parse_mode: 'HTML' });

  try {
    const wallet = await getActiveWalletData(senderId);
    if (!wallet) {
      return editAndAutoDel(ctx, processing.message_id, '❌ No wallet found. Use /start to set up your wallet.');
    }

    const [bnbBal, bflapInfo, priceUsd] = await Promise.all([
      getBnbBalance(wallet.address),
      getTokenBalance(wallet.address, BFLAP_CA),
      getBflapPriceUsd(),
    ]);

    if (bnbBal < MIN_BNB_GAS) {
      return editAndAutoDel(ctx, processing.message_id,
        `❌ <b>Tip failed</b> — Not enough BNB for gas\n` +
        `You have <code>${bnbBal.toFixed(5)} BNB</code>, need at least <code>${MIN_BNB_GAS} BNB</code>`
      );
    }

    if (bflapInfo.formatted < amount) {
      return editAndAutoDel(ctx, processing.message_id,
        `❌ <b>Tip failed</b> — Insufficient BFLAP balance\n` +
        `You have <code>${bflapInfo.formatted.toLocaleString()} BFLAP</code>, tried to send <code>${amount.toLocaleString()} BFLAP</code>`
      );
    }

    const recipient = recipientTelegramId
      ? await getUser(recipientTelegramId).catch(() => null)
      : await getUserByUsername(recipientUsername).catch(() => null);

    const party = partyEmojis(amount, priceUsd);

    if (recipient) {
      const recipientWallet = await getDefaultWallet(recipient.telegram_id);
      if (!recipientWallet) {
        return editAndAutoDel(ctx, processing.message_id,
          `❌ <b>Tip failed</b> — ${recipientDisplayName} has no wallet yet. Ask them to /start the bot first.`
        );
      }

      setRateLimit(senderId);
      const txHash = await transferBflap(wallet.privateKey, recipientWallet.address, amount);

      const successMsg =
        `${senderHandle} tipped <b>${amount.toLocaleString()} BFLAP</b> to ${recipientDisplayName} ${party}`;

      await editAndAutoDel(ctx, processing.message_id, successMsg);

      ctx.telegram.sendMessage(recipient.telegram_id,
        `${party} <b>You received a tip!</b>\n\n` +
        `💸 <b>${amount.toLocaleString()} BFLAP</b> from ${senderHandle}`,
        { parse_mode: 'HTML' }
      ).catch(() => {});

    } else {
      setRateLimit(senderId);
      await savePendingTip({ senderId, senderUsername, senderAddress: wallet.address, recipientUsername, recipientId: recipientTelegramId, amount });

      const queueMsg =
        `${senderHandle} tipped <b>${amount.toLocaleString()} BFLAP</b> to ${recipientDisplayName} ${party}\n` +
        `⏳ Held until ${recipientDisplayName} joins the bot`;

      await editAndAutoDel(ctx, processing.message_id, queueMsg);
    }

  } catch (err) {
    console.error('[/tip]', err.message);
    await editAndAutoDel(ctx, processing.message_id,
      `❌ <b>Tip failed</b> — ${err.message?.slice(0, 120) || 'Unknown error'}`
    );
  }
}

export async function creditPendingTips(telegramId, username, telegram = null) {
  const pending = await getPendingTipsForUser(telegramId, username || '').catch(() => []);
  if (!pending.length) return;

  const recipientWallet = await getDefaultWallet(telegramId).catch(() => null);
  if (!recipientWallet) return;

  for (const tip of pending) {
    try {
      const senderWallet = await getDefaultWallet(tip.sender_id).catch(() => null);
      if (!senderWallet) { await markTipFailed(tip.id); continue; }

      const privateKey = decryptKey(senderWallet.encrypted_pk);
      const bflapInfo  = await getTokenBalance(senderWallet.address, BFLAP_CA);

      if (bflapInfo.formatted < tip.amount) {
        await markTipFailed(tip.id);
        continue;
      }

      const [priceUsd, txHash] = await Promise.all([
        getBflapPriceUsd(),
        transferBflap(privateKey, recipientWallet.address, tip.amount),
      ]);
      await markTipCompleted(tip.id, txHash);

      const party      = partyEmojis(tip.amount, priceUsd);
      const senderUser = await getUser(tip.sender_id).catch(() => null);
      const senderName = senderUser?.username ? `@${senderUser.username}` : 'Someone';

      if (telegram) {
        telegram.sendMessage(telegramId,
          `${party} <b>Pending tip received!</b>\n\n` +
          `💸 <b>${Number(tip.amount).toLocaleString()} BFLAP</b> from ${senderName}`,
          { parse_mode: 'HTML' }
        ).catch(() => {});

        if (tip.sender_id) {
          telegram.sendMessage(tip.sender_id,
            `✅ Your queued tip of <b>${Number(tip.amount).toLocaleString()} BFLAP</b> to @${username} was delivered! ${party}`,
            { parse_mode: 'HTML' }
          ).catch(() => {});
        }
      }

    } catch (err) {
      console.error('[creditPendingTips]', err.message);
      await markTipFailed(tip.id).catch(() => {});
    }
  }
}
