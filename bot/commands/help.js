export async function handleHelp(ctx) {
  const text = `🦋 *Bubble Flap Trading Bot*
_Fast, secure token trading on BNB Chain_

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
👛 *WALLET MANAGEMENT*

/start — Dashboard & wallet overview
/wallet — View address, balance & keys
/exportkey — Export your private key ⚠️

➤ *My Wallet* — Manage multiple wallets
➤ *Account* — Add, rename or switch wallets
➤ *Receive* — Show QR code & deposit address

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
💱 *TRADING*

➤ *Paste any CA* to open the full trade panel

/buy \`<CA>\` \`<BNB>\` — Buy a token with BNB
/sell \`<CA>\` \`<percent>\` — Sell % of your holdings

• Supports PancakeSwap & other routers
• Per-token slippage & gas control in the trade panel
• Auto Sell (Take Profit / Stop Loss) built-in

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
📋 *LIMIT ORDERS*

/limit — View & manage limit orders
➤ *Limit Orders* button — Set buy/sell triggers
• Executes automatically when price is hit

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
⚡ *AUTOMATION*

/snipe \`<CA>\` \`[BNB]\` — Auto-buy on first on-chain trade
/alert \`<CA>\` \`<2x>\` — Notify when price hits target
/cancel — Cancel all active snipes & alerts

• Sniper watches for the token's first trade
• Alerts support any multiplier (e.g. 0.5x, 3x)

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
💸 *TIPPING*

/tip \`<amount>\` \`@username\` — Tip BFLAP tokens to any user
/tip \`<amount>\` _(reply to a message)_ — Tip the person you replied to

• Works in private chat, groups & channels
• No @username needed — just reply to their message
• Recipient has no account? Tip is held and sent automatically when they join
• 1 💸 added per $10 worth of BFLAP sent

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
🔍 *RESEARCH & DISCOVERY*

/scan \`<CA>\` — Security scan + AI risk analysis
/trending — Trending tokens on BSC
/recentbond — Recently bonded tokens
/newcreated — Live new token launches (real-time feed)
/new — Latest tokens from Flap.sh launchpad

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
📊 *HISTORY & SETTINGS*

/history — Full trade history
/settings — Global slippage, gas mode & preferences

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰
_Powered by @BubbleFlap_`;

  await ctx.replyWithMarkdown(text, {
    reply_markup: {
      inline_keyboard: [[{ text: '❌ Close', callback_data: 'close_msg' }]],
    },
  });
}
