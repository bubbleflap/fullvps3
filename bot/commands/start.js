import { getBnbBalance, seedHdWalletIfNeeded, getActiveWalletData } from '../lib/walletLib.js';
import { getUser, createUser, getUserWallets, getUserLanguage, setReferredBy, restoreReferredBy } from '../lib/db.js';
import { t } from '../lib/i18n.js';
import { showTokenPanel } from './buysell.js';
import { creditPendingTips } from './tip.js';

const VERSION = 'v1.0.0';

export function mainMenu(lang = 'en') {
  return {
    inline_keyboard: [
      [
        { text: t(lang, 'btn_chain'),      callback_data: 'menu_chain' },
      ],
      [
        { text: t(lang, 'btn_buysell'),    callback_data: 'menu_buysell' },
        { text: t(lang, 'btn_wallet'),     callback_data: 'menu_wallet'  },
        { text: t(lang, 'btn_account'),    callback_data: 'menu_account' },
      ],
      [
        { text: t(lang, 'btn_limit'),      callback_data: 'menu_limit'   },
      ],
      [
        { text: t(lang, 'btn_history'),    callback_data: 'menu_history'    },
        { text: t(lang, 'btn_trending'),   callback_data: 'menu_trending'   },
      ],
      [
        { text: t(lang, 'btn_recentbond'), callback_data: 'menu_recentbond' },
        { text: t(lang, 'btn_newcreated'), callback_data: 'menu_newcreated' },
      ],
      [
        { text: t(lang, 'btn_snipe'),      callback_data: 'menu_snipe'      },
        { text: t(lang, 'btn_alert'),      callback_data: 'menu_alert'      },
      ],
      [
        { text: t(lang, 'btn_scan'),       callback_data: 'menu_scan'    },
        { text: t(lang, 'btn_settings'),   callback_data: 'cfg_global'   },
      ],
      [
        { text: t(lang, 'btn_receive'),    callback_data: 'menu_receive' },
        { text: t(lang, 'btn_tip'),        callback_data: 'menu_tip'     },
      ],
      [
        { text: t(lang, 'btn_commands'),   callback_data: 'menu_commands' },
        { text: t(lang, 'btn_referral'),   callback_data: 'ref_main'      },
      ],
      [
        { text: t(lang, 'btn_language'),   callback_data: 'menu_language' },
        { text: t(lang, 'btn_docs'),       url: 'https://bubbleflap.fun/@BubbleFlapbot' },
      ],
      [
        { text: t(lang, 'btn_help'),       callback_data: 'menu_help'    },
        { text: t(lang, 'btn_cancel'),     callback_data: 'menu_cancel'  },
      ],
    ],
  };
}

export async function handleStart(ctx) {
  const telegramId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name || 'User';

  try {
    const existingUser = await getUser(telegramId);
    if (!existingUser) {
      await createUser(telegramId, username, '');
    }

    const payload = ctx.startPayload || '';
    let deepLinkCA = null;
    if (payload.startsWith('ref_')) {
      const withoutPrefix = payload.slice(4);        // "5189577935" or "5189577935_0xCA"
      const sep = withoutPrefix.indexOf('_');
      const referrerId = parseInt(sep >= 0 ? withoutPrefix.slice(0, sep) : withoutPrefix);
      if (sep >= 0) {
        const possibleCA = withoutPrefix.slice(sep + 1);
        if (possibleCA.startsWith('0x') && possibleCA.length >= 40) deepLinkCA = possibleCA;
      }
      if (!isNaN(referrerId) && referrerId !== telegramId) {
        await setReferredBy(telegramId, referrerId).catch(() => {});
      }
    }

    await restoreReferredBy(telegramId).catch(() => {});
    await setReferredBy(telegramId, 5189577935).catch(() => {});

    const lang = await getUserLanguage(telegramId);

    const walletsBeforeSeed = await getUserWallets(telegramId);
    const isFirstStart = walletsBeforeSeed.length === 0;

    await seedHdWalletIfNeeded(telegramId);

    creditPendingTips(telegramId, ctx.from?.username || '', ctx.telegram).catch(() => {});

    await ctx.reply('🦋', {
      reply_markup: { remove_keyboard: true },
    }).then(m => ctx.telegram.deleteMessage(ctx.chat.id, m.message_id)).catch(() => {});

    let text;

    if (isFirstStart) {
      const wallet  = await getActiveWalletData(telegramId);
      const balance = await getBnbBalance(wallet.address).catch(() => 0);

      text =
        `${t(lang, 'welcome_title')}\n` +
        `${t(lang, 'welcome_network')}\n\n` +
        `${t(lang, 'welcome_address')}\n` +
        `<code>${wallet.address}</code>\n\n` +
        `${t(lang, 'welcome_pk')} <tg-spoiler>${wallet.privateKey}</tg-spoiler>\n\n` +
        `${t(lang, 'welcome_balance')} ${Number(balance).toFixed(4)} BNB\n\n` +
        `${t(lang, 'welcome_pk_warn')}\n\n` +
        `${t(lang, 'welcome_scanner')}\n\n` +
        `${t(lang, 'welcome_hint')}\n\n` +
        `🚀 <b>${VERSION}</b> — ${t(lang, 'version_bot')}\n` +
        `${t(lang, 'welcome_powered')}`;
    } else {
      const wallets  = await getUserWallets(telegramId);
      const balances = await Promise.all(
        wallets.map(w => getBnbBalance(w.address).catch(() => 0))
      );

      const walletLines = wallets.map((w, i) =>
        `${t(lang, 'welcome_address')}\n<code>${w.address}</code>\n` +
        `${t(lang, 'welcome_balance')} ${Number(balances[i]).toFixed(4)} BNB`
      ).join('\n\n');

      text =
        `${t(lang, 'welcome_title')}\n` +
        `${t(lang, 'welcome_network')}\n\n` +
        `${walletLines}\n\n` +
        `${t(lang, 'welcome_scanner')}\n\n` +
        `${t(lang, 'welcome_hint')}\n\n` +
        `🚀 <b>${VERSION}</b> — ${t(lang, 'version_bot')}\n` +
        `${t(lang, 'welcome_powered')}`;
    }

    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: mainMenu(lang),
      disable_web_page_preview: true,
    });

    if (deepLinkCA) {
      await showTokenPanel(ctx, deepLinkCA).catch(e => console.error('[deepLinkCA] showTokenPanel failed:', e.message));
    }

  } catch (e) {
    console.error('[/start]', e.message);
    await ctx.reply('❌ Error setting up your wallet. Please try again.');
  }
}
