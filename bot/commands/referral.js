import { getActiveWalletData } from '../lib/walletLib.js';
import {
  getReferralStats, getReferralInvitees, getReferralClaims,
  claimReferralReward, getUserReferredBy,
} from '../lib/db.js';

const BOT_USERNAME = 'BubbleFlapBot';
const MIN_CLAIM_BNB = 0.01;

function shortAddr(addr) {
  if (!addr) return '—';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toISOString().slice(0, 10).replace(/-/g, '.');
}

function today() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '.');
}

function referralKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📊 Promo Details', callback_data: 'ref_promo' }],
      [
        { text: '💰 Claim Reward', callback_data: 'ref_claim' },
        { text: '📋 Claim Records', callback_data: 'ref_records' },
      ],
      [{ text: '🔙 Back', callback_data: 'menu_main' }],
    ],
  };
}

export async function showReferralPage(ctx, telegramId) {
  try {
    const wallet     = await getActiveWalletData(telegramId).catch(() => null);
    const stats      = await getReferralStats(telegramId);
    const referredBy = await getUserReferredBy(telegramId).catch(() => null);
    const link       = `https://t.me/${BOT_USERNAME}?start=ref_${telegramId}`;
    const addr       = wallet?.address || null;

    const periodStart = stats.user_created_at ? fmtDate(stats.user_created_at) : '—';

    const tierLine = stats.next_tier
      ? `🏅 Your Rate: <b>${stats.tier_rate_pct}%</b> — ${stats.next_tier}`
      : `🏅 Your Rate: <b>${stats.tier_rate_pct}%</b> — ⭐ VIP tier unlocked!`;

    const discountLine = referredBy
      ? `🎟️ Fee Discount: <b>-0.1%</b> on all your trades (joined via referral)\n`
      : '';

    const text =
      `🚀 <b>Invite friends and earn BNB rewards!</b>\n` +
      `Share your link — earn <b>${stats.tier_rate_pct}%</b> of every BNB trade your friends make.\n\n` +
      `🔗 <b>Referral Link:</b>\n<code>${link}</code>\n\n` +
      `💰 Total Reward: <b>${Number(stats.total_bnb || 0).toFixed(6)} BNB</b>\n` +
      `💰 Claimable Reward: <b>${Number(stats.claimable_bnb || 0).toFixed(6)} BNB</b>\n` +
      `👥 Users Referred: <b>${stats.count}</b>\n\n` +
      `${tierLine}\n` +
      `${discountLine}\n` +
      `💳 <b>Claimable Reward:</b>\n` +
      `BSC: <code>${addr ? shortAddr(addr) : '—'}</code> | ${Number(stats.claimable_bnb || 0).toFixed(6)} BNB\n\n` +
      `⏳ Statistics Period: ${periodStart}–${today()}\n\n` +
      `🎁 Minimum claimable: <b>${MIN_CLAIM_BNB} BNB</b>. Network gas deducted on claim.\n\n` +
      `🎉 Grow the community — grow your rewards!\n\n` +
      `🔒 <i>Your referral ID is permanent — tied to your Telegram ID, never deleted, and stays the same even if you change your username. Rewards are active for 6 months per invitee.</i>`;

    const msgId = ctx.callbackQuery?.message?.message_id;
    if (msgId) {
      return ctx.telegram.editMessageText(ctx.chat.id, msgId, null, text, {
        parse_mode: 'HTML',
        reply_markup: referralKeyboard(),
        disable_web_page_preview: true,
      }).catch(() => ctx.reply(text, { parse_mode: 'HTML', reply_markup: referralKeyboard(), disable_web_page_preview: true }));
    }
    return ctx.reply(text, { parse_mode: 'HTML', reply_markup: referralKeyboard(), disable_web_page_preview: true });
  } catch (e) {
    console.error('[referral]', e.message);
    return ctx.reply('❌ Error loading referral page.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'menu_main' }]] },
    });
  }
}

export async function showPromoDetails(ctx) {
  const text =
    `📊 <b>Bubble Flap Referral Program</b>\n\n` +
    `<b>How it works:</b>\n` +
    `1. Share your personal referral link with friends\n` +
    `2. When they join via your link, they're permanently linked to you\n` +
    `3. Every time they trade, you automatically earn BNB\n` +
    `4. Rewards accumulate in real time — claim anytime\n\n` +
    `<b>Reward Tiers:</b>\n` +
    `• Base: <b>0.30%</b> per trade (0–19 invitees)\n` +
    `• ⭐ VIP: <b>0.35%</b> per trade (20+ invitees)\n` +
    `• Works on both buys and sells — no cap\n\n` +
    `<b>Invitee Benefit:</b>\n` +
    `• Users who join via a referral link get a <b>-0.1% fee discount</b> on every trade\n` +
    `• Applied automatically — no action needed\n\n` +
    `<b>Referral Expiry:</b>\n` +
    `• Rewards active for <b>6 months</b> per invitee\n` +
    `• After 6 months, the invitee can re-join with a new link\n\n` +
    `<b>Claim Rules:</b>\n` +
    `• Minimum claimable: <b>${MIN_CLAIM_BNB} BNB</b>\n` +
    `• Network gas deducted on claim\n` +
    `• Paid directly to your active BSC wallet\n\n` +
    `<b>BSC Network only</b> — all rewards in BNB.`;

  const msgId = ctx.callbackQuery?.message?.message_id;
  const kb = { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'ref_main' }]] };
  if (msgId) {
    return ctx.telegram.editMessageText(ctx.chat.id, msgId, null, text, {
      parse_mode: 'HTML', reply_markup: kb,
    }).catch(() => ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb }));
  }
  return ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
}

export async function handleClaimReward(ctx, telegramId) {
  try {
    const stats = await getReferralStats(telegramId);
    const claimable = Number(stats.claimable_bnb || 0);

    if (claimable < MIN_CLAIM_BNB) {
      return ctx.answerCbQuery(
        `❌ Minimum claim is ${MIN_CLAIM_BNB} BNB. You have ${claimable.toFixed(6)} BNB.`,
        { show_alert: true }
      );
    }

    const wallet = await getActiveWalletData(telegramId);
    if (!wallet?.address) {
      return ctx.answerCbQuery('❌ No active wallet found.', { show_alert: true });
    }

    await ctx.answerCbQuery('⏳ Processing claim...', { show_alert: false });

    const { sendBnb } = await import('../lib/walletLib.js');
    const feeKey = process.env.BOT_MASTER_PRIVATE_KEY;
    if (!feeKey) throw new Error('BOT_MASTER_PRIVATE_KEY not set');

    const GAS_BNB = 0.00005;
    const sendAmt = claimable - GAS_BNB;
    if (sendAmt <= 0) {
      return ctx.reply('❌ Reward too small to cover gas. Keep accumulating!', {
        reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'ref_main' }]] },
      });
    }

    const txHash = await sendBnb(feeKey, wallet.address, sendAmt.toFixed(8));
    await claimReferralReward(telegramId, claimable, txHash || '');

    return ctx.reply(
      `✅ <b>Claimed!</b>\n\n` +
      `Sent <b>${sendAmt.toFixed(6)} BNB</b> to <code>${wallet.address}</code>\n` +
      `TX: <code>${txHash || 'pending'}</code>`,
      {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Referral', callback_data: 'ref_main' }]] },
      }
    );
  } catch (e) {
    console.error('[referral claim]', e.message);
    return ctx.reply(`❌ Claim failed: ${e.message}`, {
      reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'ref_main' }]] },
    });
  }
}

export async function showClaimRecords(ctx, telegramId) {
  try {
    const records = await getReferralClaims(telegramId);
    const msgId   = ctx.callbackQuery?.message?.message_id;
    const kb = { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'ref_main' }]] };

    if (!records.length) {
      const text = `📋 <b>Claim Records</b>\n\nNo claims yet. Refer friends to start earning!`;
      if (msgId) {
        return ctx.telegram.editMessageText(ctx.chat.id, msgId, null, text, { parse_mode: 'HTML', reply_markup: kb })
          .catch(() => ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb }));
      }
      return ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
    }

    const lines = records.slice(0, 10).map((r, i) =>
      `${i + 1}. <b>${Number(r.amount_bnb).toFixed(6)} BNB</b> — ${new Date(r.created_at).toISOString().slice(0, 10)} — ${r.status}`
    ).join('\n');

    const text = `📋 <b>Claim Records</b> (last ${records.slice(0, 10).length})\n\n${lines}`;
    if (msgId) {
      return ctx.telegram.editMessageText(ctx.chat.id, msgId, null, text, { parse_mode: 'HTML', reply_markup: kb })
        .catch(() => ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb }));
    }
    return ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  } catch (e) {
    console.error('[referral records]', e.message);
    return ctx.reply('❌ Error loading claim records.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'ref_main' }]] },
    });
  }
}
