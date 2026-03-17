import { cancelUserSnipes, cancelUserAlerts } from '../lib/db.js';

export async function handleCancel(ctx) {
  const telegramId = ctx.from.id;
  try {
    const [snipes, alerts] = await Promise.all([
      cancelUserSnipes(telegramId),
      cancelUserAlerts(telegramId),
    ]);
    if (snipes + alerts === 0) {
      return ctx.reply('No active snipes or alerts to cancel.');
    }
    await ctx.reply(`✅ Cancelled ${snipes} snipe(s) and ${alerts} alert(s).`);
  } catch (e) {
    await ctx.reply(`❌ Error: ${e.message}`);
  }
}
