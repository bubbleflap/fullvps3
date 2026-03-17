import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });
import { createBot } from './bot.js';
import { initBotDb } from './lib/db.js';
import { startAlertsJob } from './lib/alertsJob.js';
import { startSniperJob } from './lib/sniper.js';
import { startLimitWatcher } from './lib/limitWatcher.js';
import { startAutoSellWatcher } from './lib/autoSellWatcher.js';
import { startDepositMonitor } from './monitor.js';

async function main() {
  console.log('[BubbleFlap Bot] Starting...');

  await initBotDb();

  const bot = createBot();

  startAlertsJob(bot);
  startSniperJob(bot);
  startLimitWatcher(bot);
  startAutoSellWatcher(bot);
  startDepositMonitor(bot.telegram);

  await bot.launch();
  console.log('[BubbleFlap Bot] Running ✅');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch(e => {
  console.error('[BubbleFlap Bot] Fatal:', e.message);
  process.exit(1);
});
