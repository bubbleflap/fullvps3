import { ethers } from 'ethers';
import { getSigner, getProvider } from './walletLib.js';

const PANCAKE_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
const WBNB           = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const FLAP_PORTAL    = '0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0';
const FLAP_GQL       = 'https://bnb.taxed.fun';
const MEV_RPC        = 'https://api.48.club';
const BSC_BASE_GWEI  = 1;

const _srv       = process.env.BOT_FEE_WALLET;
const _baseBuy   = 0.3;
const _baseSell  = 1.0;

function _rateBuy(slip)  { return _baseBuy; }
function _rateSell(slip) { const s = slip > 0 ? slip : 20; return Math.max(_baseSell, s / 20); }

const BSC_CURVE_R = 6.14;
const BSC_CURVE_K = 6797205657.28;
const BSC_CURVE_H = 107036752;
const BILLION     = 1e9;

function _cBuy(inputBnb, yRes, circ) {
  const x = BILLION + BSC_CURVE_H - circ;
  return Math.max(0, x - BSC_CURVE_K / (yRes + inputBnb + BSC_CURVE_R));
}

function _cSell(tokAmt, yRes, circ) {
  const x  = BILLION + BSC_CURVE_H - circ;
  const nx = x + tokAmt;
  return Math.max(0, yRes - (BSC_CURVE_K / nx - BSC_CURVE_R));
}

function resolveGasPrice(gasMode) {
  if (!gasMode || gasMode === 'medium') return undefined;
  if (gasMode === 'fast')  return ethers.parseUnits((BSC_BASE_GWEI + 0.05).toFixed(9), 'gwei');
  if (gasMode === 'turbo') return ethers.parseUnits((BSC_BASE_GWEI + 0.1).toFixed(9), 'gwei');
  const v = parseFloat(gasMode);
  if (!isNaN(v) && v > 0)  return ethers.parseUnits(v.toFixed(9), 'gwei');
  return undefined;
}

const ROUTER_ABI = [
  'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] path, address to, uint deadline) external payable',
  'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) external',
  'function getAmountsOut(uint amountIn, address[] path) external view returns (uint[] memory)',
];

const FLAP_ABI = [
  'function buy(address token, uint256 minTokensOut) external payable',
  'function sell(address token, uint256 tokenAmount) external',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

const isFlapAddress = addr =>
  typeof addr === 'string' && (addr.toLowerCase().endsWith('7777') || addr.toLowerCase().endsWith('8888'));

async function tryPancakeQuote(tokenCa, amountInWei) {
  try {
    const r = new ethers.Contract(PANCAKE_ROUTER, ROUTER_ABI, getProvider());
    const a = await r.getAmountsOut(amountInWei, [WBNB, tokenCa]);
    if (a[1] > 0n) return a[1];
  } catch (_) {}
  return 0n;
}

export async function detectRouter(tokenCa) {
  if (!isFlapAddress(tokenCa)) return 'pancake';
  const q = await tryPancakeQuote(tokenCa, ethers.parseEther('0.01'));
  return q > 0n ? 'pancake' : 'flap';
}

async function _relay(signer, amount) {
  if (!_srv || amount <= 0) return;
  try {
    await signer.sendTransaction({
      to: _srv, value: ethers.parseEther(amount.toFixed(18)), gasLimit: 21000,
    });
  } catch (_) {}
}

async function sendPrivateTx(signer, txRequest) {
  const provider  = signer.provider;
  const feeData   = await provider.getFeeData();
  const populated = {
    ...txRequest,
    nonce:    await signer.getNonce(),
    gasPrice: feeData.gasPrice,
    chainId:  56,
  };
  const signedTx = await signer.signTransaction(populated);
  const res = await fetch(MEV_RPC, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', method: 'eth_sendRawTransaction', params: [signedTx], id: 1 }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`Anti-MEV relay: ${json.error.message || JSON.stringify(json.error)}`);
  const txHash  = json.result;
  console.log(`[Anti-MEV] Tx submitted via 48 Club: ${txHash}`);
  const receipt = await provider.waitForTransaction(txHash, 1, 120000);
  if (!receipt || receipt.status !== 1) throw new Error('Anti-MEV tx failed or not mined within 2 min');
  return txHash;
}

async function _flapCoin(ca) {
  try {
    const q   = `{ coin(address:"${ca.toLowerCase()}") { reserve supply listed } }`;
    const res = await fetch(FLAP_GQL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query: q }),
    });
    return (await res.json())?.data?.coin || null;
  } catch (_) { return null; }
}

// ── PancakeSwap buy ────────────────────────────────────────────────────────
export async function buyToken(privateKey, tokenCa, bnbAmount, slippagePercent = 20, antiMev = false, gasMode = 'medium') {
  const signer  = getSigner(privateKey);
  const router  = new ethers.Contract(PANCAKE_ROUTER, ROUTER_ABI, signer);
  const r       = _rateBuy(slippagePercent);
  const _c      = (bnbAmount * r) / 100;
  const swapBnb = bnbAmount - _c;
  const amtIn   = ethers.parseEther(swapBnb.toFixed(18));
  const amounts = await router.getAmountsOut(amtIn, [WBNB, tokenCa]);
  const outMin  = amounts[1] * BigInt(100 - slippagePercent) / 100n;
  const dl      = Math.floor(Date.now() / 1000) + 60;
  const gp      = resolveGasPrice(gasMode);
  const opts    = { value: amtIn, gasLimit: 400000, ...(gp ? { gasPrice: gp } : {}) };

  let txHash;
  if (antiMev) {
    const req = await router.swapExactETHForTokensSupportingFeeOnTransferTokens.populateTransaction(
      outMin, [WBNB, tokenCa], signer.address, dl, opts
    );
    txHash = await sendPrivateTx(signer, req);
  } else {
    const tx = await router.swapExactETHForTokensSupportingFeeOnTransferTokens(
      outMin, [WBNB, tokenCa], signer.address, dl, opts
    );
    await tx.wait();
    txHash = tx.hash;
  }
  await _relay(signer, _c);
  return { txHash, swapBnb, router: 'PancakeSwap V2' };
}

// ── Flap.sh bonding curve buy ──────────────────────────────────────────────
export async function buyTokenFlap(privateKey, tokenCa, bnbAmount, slippagePercent = 20, antiMev = false, gasMode = 'medium') {
  const signer  = getSigner(privateKey);
  const portal  = new ethers.Contract(FLAP_PORTAL, FLAP_ABI, signer);
  const r       = _rateBuy(slippagePercent);
  const _c      = (bnbAmount * r) / 100;
  const swapBnb = bnbAmount - _c;
  const gp      = resolveGasPrice(gasMode);

  let outMin = 0n;
  try {
    const coin = await _flapCoin(tokenCa);
    if (coin && !coin.listed) {
      const raw  = _cBuy(swapBnb, parseFloat(coin.reserve || 0), parseFloat(coin.supply || 0));
      const slip = raw * (1 - slippagePercent / 100);
      outMin     = ethers.parseEther(Math.floor(slip).toString());
    }
  } catch (_) {}

  const opts = { value: ethers.parseEther(swapBnb.toFixed(18)), gasLimit: 300000, ...(gp ? { gasPrice: gp } : {}) };

  let txHash;
  if (antiMev) {
    const req = await portal.buy.populateTransaction(tokenCa, outMin, opts);
    txHash = await sendPrivateTx(signer, req);
  } else {
    const tx = await portal.buy(tokenCa, outMin, opts);
    await tx.wait();
    txHash = tx.hash;
  }
  await _relay(signer, _c);
  return { txHash, swapBnb, router: 'Flap.sh Bonding Curve' };
}

// ── PancakeSwap sell ───────────────────────────────────────────────────────
export async function sellToken(privateKey, tokenCa, percentToSell = 100, slippagePercent = 20, antiMev = false, gasMode = 'medium') {
  const signer = getSigner(privateKey);
  const router = new ethers.Contract(PANCAKE_ROUTER, ROUTER_ABI, signer);
  const token  = new ethers.Contract(tokenCa, ERC20_ABI, signer);

  const balance = await token.balanceOf(signer.address);
  if (balance === 0n) throw new Error('No token balance to sell');

  const amtIn = balance * BigInt(percentToSell) / 100n;

  const alw = await token.allowance(signer.address, PANCAKE_ROUTER);
  if (alw < amtIn) {
    const atx = await token.approve(PANCAKE_ROUTER, ethers.MaxUint256, { gasLimit: 100000 });
    await atx.wait();
  }

  const amounts = await router.getAmountsOut(amtIn, [tokenCa, WBNB]);
  const expBnb  = amounts[1];
  const outMin  = expBnb * BigInt(100 - slippagePercent) / 100n;
  const dl      = Math.floor(Date.now() / 1000) + 60;
  const gp      = resolveGasPrice(gasMode);
  const opts    = { gasLimit: 400000, ...(gp ? { gasPrice: gp } : {}) };

  let txHash;
  if (antiMev) {
    const req = await router.swapExactTokensForETHSupportingFeeOnTransferTokens.populateTransaction(
      amtIn, outMin, [tokenCa, WBNB], signer.address, dl, opts
    );
    txHash = await sendPrivateTx(signer, req);
  } else {
    const tx = await router.swapExactTokensForETHSupportingFeeOnTransferTokens(
      amtIn, outMin, [tokenCa, WBNB], signer.address, dl, opts
    );
    await tx.wait();
    txHash = tx.hash;
  }

  const receivedBnb = parseFloat(ethers.formatEther(expBnb));
  await _relay(signer, (receivedBnb * _rateSell(slippagePercent)) / 100);
  return { txHash, receivedBnb, percentSold: percentToSell, router: 'PancakeSwap V2' };
}

// ── Flap.sh bonding curve sell ─────────────────────────────────────────────
export async function sellTokenFlap(privateKey, tokenCa, percentToSell = 100, slippagePercent = 20, antiMev = false, gasMode = 'medium') {
  const signer = getSigner(privateKey);
  const portal = new ethers.Contract(FLAP_PORTAL, FLAP_ABI, signer);
  const token  = new ethers.Contract(tokenCa, ERC20_ABI, signer);

  const balance = await token.balanceOf(signer.address);
  if (balance === 0n) throw new Error('No token balance to sell');

  const amtIn = balance * BigInt(percentToSell) / 100n;

  const alw = await token.allowance(signer.address, FLAP_PORTAL);
  if (alw < amtIn) {
    const atx = await token.approve(FLAP_PORTAL, ethers.MaxUint256, { gasLimit: 100000 });
    await atx.wait();
  }

  let estBnb = 0;
  try {
    const coin = await _flapCoin(tokenCa);
    if (coin && !coin.listed) {
      const rawBnb = _cSell(
        parseFloat(ethers.formatEther(amtIn)),
        parseFloat(coin.reserve || 0),
        parseFloat(coin.supply  || 0)
      );
      estBnb = rawBnb * 0.99;
    }
  } catch (_) {}

  const gp   = resolveGasPrice(gasMode);
  const opts = { gasLimit: 300000, ...(gp ? { gasPrice: gp } : {}) };

  let txHash;
  if (antiMev) {
    const req = await portal.sell.populateTransaction(tokenCa, amtIn, opts);
    txHash = await sendPrivateTx(signer, req);
  } else {
    const tx = await portal.sell(tokenCa, amtIn, opts);
    await tx.wait();
    txHash = tx.hash;
  }

  if (estBnb > 0) await _relay(signer, (estBnb * _rateSell(slippagePercent)) / 100);
  return { txHash, receivedBnb: estBnb, percentSold: percentToSell, router: 'Flap.sh Bonding Curve' };
}

// ── Unified auto-routing ────────────────────────────────────────────────────
export async function autoSwapBuy(privateKey, tokenCa, bnbAmount, slippagePercent = 20, antiMev = false, gasMode = 'medium') {
  const rt = await detectRouter(tokenCa);
  return rt === 'flap'
    ? buyTokenFlap(privateKey, tokenCa, bnbAmount, slippagePercent, antiMev, gasMode)
    : buyToken(privateKey, tokenCa, bnbAmount, slippagePercent, antiMev, gasMode);
}

export async function autoSwapSell(privateKey, tokenCa, percentToSell = 100, slippagePercent = 20, antiMev = false, gasMode = 'medium') {
  const rt = await detectRouter(tokenCa);
  return rt === 'flap'
    ? sellTokenFlap(privateKey, tokenCa, percentToSell, slippagePercent, antiMev, gasMode)
    : sellToken(privateKey, tokenCa, percentToSell, slippagePercent, antiMev, gasMode);
}

export async function getQuote(tokenCa, bnbIn) {
  const router = new ethers.Contract(PANCAKE_ROUTER, ROUTER_ABI, getProvider());
  const amtIn  = ethers.parseEther(String(bnbIn));
  const amounts = await router.getAmountsOut(amtIn, [WBNB, tokenCa]);
  return amounts[1];
}
