const API = 'http://localhost:3001';

function fmtMcap(usd) {
  if (!usd || usd === 0) return '?';
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000)     return `$${(usd / 1_000).toFixed(1)}K`;
  return `$${usd.toFixed(0)}`;
}

function fmtProgress(p) {
  const bar = Math.round((p || 0) / 10);
  return `[${'█'.repeat(bar)}${'░'.repeat(10 - bar)}] ${(p || 0).toFixed(0)}%`;
}

async function getFlapTrending() {
  const res = await fetch(`${API}/api/bonding-tokens`);
  const data = await res.json();
  const tokens = (data.tokens || [])
    .filter(t => t.bondProgress > 0)
    .sort((a, b) => (b.bondProgress || 0) - (a.bondProgress || 0))
    .slice(0, 5);
  return tokens;
}

function buildTrendingText(tokens) {
  if (!tokens.length) return '📭 No active bonding tokens on flap.sh right now.';

  const lines = tokens.map((t, i) => {
    const name  = t.name || 'Unknown';
    const tick  = t.ticker || '???';
    const mcap  = fmtMcap(t.mcap);
    const prog  = fmtProgress(t.bondProgress);
    const short = `${t.address.slice(0, 6)}…${t.address.slice(-4)}`;
    const hold  = t.holders > 0 ? ` | 👥 ${t.holders}` : '';
    return (
      `${i + 1}. 🚀 <b>${name}</b> ($${tick})\n` +
      `   ${prog}\n` +
      `   MCap: ${mcap}${hold}\n` +
      `   <code>${t.address}</code>`
    );
  });

  return `🔥 <b>Trending on flap.sh Launchpad (BSC)</b>\n<i>Sorted by bond progress</i>\n\n${lines.join('\n\n')}`;
}

export async function handleTrending(ctx, editMsgId = null) {
  const isEdit = !!editMsgId;
  const msgId = editMsgId || (await ctx.reply('🔄 Loading trending flap.sh tokens...')).message_id;

  try {
    const tokens = await getFlapTrending();
    const text   = buildTrendingText(tokens);

    const keyboard = {
      inline_keyboard: [
        [{ text: '🔄 Refresh', callback_data: 'menu_trending' }],
        [{ text: '❌ Close',   callback_data: 'close_msg'     }],
      ],
    };

    await ctx.telegram.editMessageText(ctx.chat.id, msgId, null, text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: keyboard,
    });
  } catch (e) {
    await ctx.telegram.editMessageText(ctx.chat.id, msgId, null,
      `❌ Failed to load trending: ${e.message}`
    ).catch(() => {});
  }
}
