import { getAllWallets } from './lib/db.js';
import { getBnbBalance } from './lib/walletLib.js';
import { ethers } from 'ethers';

const POLL_INTERVAL = 30_000;
const BNB_THRESHOLD = 0.0001;

const knownBnbBalances = new Map();

function walletTag(w) {
  return w.address.slice(-4);
}

function walletLabel(w) {
  const name = w.name || `Wallet ${walletTag(w)}`;
  return `${name} (${walletTag(w)})`;
}

let telegram = null;
let timer    = null;

async function checkDeposits() {
  let wallets;
  try {
    wallets = await getAllWallets();
  } catch {
    return;
  }

  for (const w of wallets) {
    try {
      const bnb = parseFloat(await getBnbBalance(w.address).catch(() => '0'));
      const prev = knownBnbBalances.get(w.id);

      if (prev === undefined) {
        knownBnbBalances.set(w.id, bnb);
        continue;
      }

      const diff = bnb - prev;
      if (diff >= BNB_THRESHOLD) {
        knownBnbBalances.set(w.id, bnb);
        try {
          await telegram.sendMessage(
            w.telegram_id,
            `📥 <b>Deposit Received!</b>\n\n` +
            `💳 Account: <b>${walletLabel(w)}</b>\n` +
            `💰 Received: <b>+${diff.toFixed(6)} BNB</b>\n` +
            `📊 New Balance: <b>${bnb.toFixed(6)} BNB</b>\n\n` +
            `🌐 Network: BSC`,
            { parse_mode: 'HTML' }
          );
        } catch {}
      } else {
        knownBnbBalances.set(w.id, bnb);
      }
    } catch {}
  }
}

export function startDepositMonitor(tg) {
  if (timer) return;
  telegram = tg;
  timer = setInterval(checkDeposits, POLL_INTERVAL);
  checkDeposits().catch(() => {});
}

export function stopDepositMonitor() {
  if (timer) { clearInterval(timer); timer = null; }
}
