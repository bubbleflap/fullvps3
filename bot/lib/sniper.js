import { getPendingSnipes, updateSnipeStatus, getUser } from './db.js';
import { getActiveWalletData } from './walletLib.js';
import { autoSwapBuy } from './swap.js';
import { saveTrade } from './db.js';
import { getProvider } from './walletLib.js';
import { ethers } from 'ethers';
import { snipeSuccessMsg, snipeFailMsg } from './notify.js';

const PANCAKE_FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';
const FACTORY_ABI = ['function getPair(address, address) view returns (address)'];
const PAIR_ABI = ['event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'];
const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

const watchedPairs = new Map();

async function getPairAddress(ca) {
  try {
    const provider = getProvider();
    const factory = new ethers.Contract(PANCAKE_FACTORY, FACTORY_ABI, provider);
    const pair = await factory.getPair(WBNB, ca);
    if (pair === ethers.ZeroAddress) return null;
    return pair;
  } catch {
    return null;
  }
}

export function startSniperJob(bot) {
  setInterval(async () => {
    try {
      const snipes = await getPendingSnipes();
      if (snipes.length === 0) return;

      const provider = getProvider();

      for (const snipe of snipes) {
        if (watchedPairs.has(snipe.ca)) continue;

        const pairAddr = await getPairAddress(snipe.ca);
        if (!pairAddr) continue;

        watchedPairs.set(snipe.ca, snipe.id);

        const pair = new ethers.Contract(pairAddr, PAIR_ABI, provider);

        const onSwap = async () => {
          pair.off('Swap', onSwap);
          watchedPairs.delete(snipe.ca);

          await updateSnipeStatus(snipe.id, 'triggered');

          const wallet  = await getActiveWalletData(snipe.telegram_id);
          const user    = await getUser(snipe.telegram_id).catch(() => null);
          const slip    = user?.sniper_slippage ?? user?.slippage ?? 50;
          const gasMode = user?.sniper_gas ? String(user.sniper_gas) : (user?.gas_mode || 'medium');
          const antiMev = !!(user?.anti_mev);

          try {
            const result = await autoSwapBuy(
              wallet.privateKey, snipe.ca, parseFloat(snipe.amount_bnb),
              slip, antiMev, gasMode
            );
            await saveTrade(snipe.telegram_id, snipe.ca, 'buy', snipe.amount_bnb, 0, result.txHash, 'success');

            await bot.telegram.sendMessage(
              snipe.telegram_id,
              snipeSuccessMsg(snipe.ca, result.swapBnb, result.txHash, result.router),
              { parse_mode: 'HTML' }
            ).catch(() => {});
          } catch (e) {
            await updateSnipeStatus(snipe.id, 'failed');
            await saveTrade(snipe.telegram_id, snipe.ca, 'buy', snipe.amount_bnb, 0, null, 'failed');
            await bot.telegram.sendMessage(
              snipe.telegram_id,
              snipeFailMsg(snipe.ca, e),
              { parse_mode: 'HTML' }
            ).catch(() => {});
          }
        };

        pair.on('Swap', onSwap);
        console.log(`[Sniper] Watching pair ${pairAddr} for CA ${snipe.ca}`);
      }
    } catch (e) {
      console.error('[SniperJob]', e.message);
    }
  }, 5000);

  console.log('[SniperJob] Started — checking every 5s');
}
