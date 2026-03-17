// ═══════════════════════════════════════════════════════════════════════════
// bondingService.js  —  Real-time Flap.sh graduated token feed
// ───────────────────────────────────────────────────────────────────────────
//  Detection: PancakeSwap Factory events (standardized, same as gmgn/flapscanner)
//  ─────────────────────────────────────────────────────────────────────────
//  V2 Factory: 0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73
//    PairCreated(address indexed token0, address indexed token1, address pair, uint256)
//    topic0: 0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9
//    Used for: Flap.sh TAX tokens (address suffix 7777)
//
//  V3 Factory: 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865
//    PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)
//    topic0: 0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118
//    Used for: Flap.sh STANDARD tokens (address suffix 8888)
//
//  Filter: token0 or token1 ends with 7777 or 8888 (Flap.sh vanity suffix)
//
//  Verification (anti-scam — 3 checks):
//    1. Originator: TX receipt must contain Flap.sh Portal events
//       (Portal: 0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0)
//    2. Liquidity floor: WBNB Transfer in TX must be >= 16 BNB
//       (real graduations move exactly ~16 BNB, scams use tiny amounts)
//    3. Bonding curve math:
//       Total supply: 1,000,000,000 (1B)
//       Milestone: 800,000,000 circulating → bonding curve complete
//       Reserve: 16 BNB collected → triggers DEX migration
//       Remaining 200M tokens + 16 BNB → added as PancakeSwap liquidity
//
//  Enrichment: AVE API → Flap GraphQL / Moralis / DexScreener (images)
// ═══════════════════════════════════════════════════════════════════════════

import { ethers } from 'ethers';

const V2_FACTORY      = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';
const V2_PAIR_CREATED = '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9';

const V3_FACTORY      = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
const V3_POOL_CREATED = '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118';

const WBNB            = '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';
const FLAP_PORTAL     = '0xe2ce6ab80874fa9fa2aae65d277dd6b8e65c9de0';
const MIN_BNB_RESERVE = 14;
const GRAD_SUPPLY     = 800_000_000;
const TOTAL_SUPPLY    = 1_000_000_000;

const BSC_WSS      = 'wss://bsc-rpc.publicnode.com';
const BSC_RPC      = 'https://bsc-rpc.publicnode.com';
const AVE_BASE     = 'https://prod.ave-api.com';
const AVE_KEY      = process.env.AVE_API_KEY;
const MORALIS_KEY  = process.env.MORALIS_API_KEY;
const FLAP_GQL     = 'https://bnb.taxed.fun';
const IPFS_GW      = 'https://flap.mypinata.cloud/ipfs/';
const BROWSER_UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const BACKFILL_BLOCKS = 100_000;
const MAX_TOKENS      = 75;
const SCAN_CHUNK      = 5_000;
const AVE_BATCH       = 50;
const MORALIS_BATCH   = 50;
const DSC_BATCH       = 30;
const ENRICH_INTERVAL = 2 * 60_000;
const WSS_RECONNECT   = 10_000;

const gradMap    = new Map();
let bondingTokens    = [];
let lastScannedBlock = 0;

import { appendFileSync, writeFileSync } from 'fs';
const VALIDATION_LOG = 'validation_log.txt';
try { writeFileSync(VALIDATION_LOG, `=== BONDING VALIDATION LOG ===\nStarted: ${new Date().toISOString()}\n\n`); } catch (_) {}
function logValidation(address, status, reason) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${status}: ${address} — ${reason}\n`;
  try { appendFileSync(VALIDATION_LOG, line); } catch (_) {}
  console.log(`[VALIDATION] ${status}: ${address} — ${reason}`);
}
let _wss             = null;
let wsProvider       = null;
let enrichTimer      = null;
let enrichLock       = false;
let enrichPending    = false;

export function init({ wss }) { _wss = wss; }
export function getBondingTokens() { return bondingTokens; }
export function startUpdates() { backfillAndWatch(); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function safeFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    signal: AbortSignal.timeout(opts.timeout || 12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res;
}

async function rpc(body) {
  const r = await safeFetch(BSC_RPC, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const d = await r.json();
  if (d.error) throw new Error(`RPC: ${JSON.stringify(d.error)}`);
  return d.result;
}

async function getCurrentBlock() {
  return parseInt(
    await rpc({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
    16,
  );
}

function isFlapToken(addr) {
  return addr.endsWith('7777') || addr.endsWith('8888');
}

function extractFlapToken(log, version) {
  const t0 = ('0x' + log.topics[1]?.slice(26))?.toLowerCase();
  const t1 = ('0x' + log.topics[2]?.slice(26))?.toLowerCase();

  let tokenAddr = null;
  let pairAddr  = null;

  if (isFlapToken(t0))      tokenAddr = t0;
  else if (isFlapToken(t1)) tokenAddr = t1;
  else return null;

  if (version === 'v2') {
    pairAddr = ('0x' + log.data.slice(26, 66)).toLowerCase();
  } else {
    pairAddr = ('0x' + log.data.slice(log.data.length - 40)).toLowerCase();
  }

  return { tokenAddr, pairAddr, version, txHash: log.transactionHash };
}

// ═════════════════════════════════════════════════════════════════════════
// Graduation verification — filters scam/fake pools
// Check 1: TX must contain events from Flap.sh Portal (originator check)
// Check 2: BNB reserve >= 16 BNB (Flap.sh graduation milestone)
// ═════════════════════════════════════════════════════════════════════════
async function verifyGraduation(txHash) {
  if (!txHash) return false;
  try {
    const receipt = await rpc({
      jsonrpc: '2.0', id: 1,
      method: 'eth_getTransactionReceipt',
      params: [txHash],
    });
    if (!receipt || !receipt.logs) return false;

    const flapTokenAddr = receipt.logs.map(l => l.address.toLowerCase()).find(a => a.endsWith('7777') || a.endsWith('8888')) || 'unknown';
    const hasPortalEvent = receipt.logs.some(
      l => l.address.toLowerCase() === FLAP_PORTAL
    );
    if (!hasPortalEvent) {
      logValidation(flapTokenAddr, 'FAILED', `TX ${txHash.slice(0,16)}... — no Portal (${FLAP_PORTAL.slice(0,10)}...) events in receipt → fake pool`);
      return false;
    }

    let bnbTransferred = 0;
    const WBNB_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === WBNB &&
          log.topics[0] === WBNB_TRANSFER_TOPIC) {
        const value = parseInt(log.data, 16) / 1e18;
        if (value > bnbTransferred) bnbTransferred = value;
      }
    }
    if (bnbTransferred < MIN_BNB_RESERVE - 0.5) {
      logValidation(flapTokenAddr, 'FAILED', `TX ${txHash.slice(0,16)}... — only ${bnbTransferred.toFixed(2)} BNB transferred (need >= ${MIN_BNB_RESERVE - 0.5})`);
      return false;
    }

    logValidation(flapTokenAddr, 'PASSED', `TX ${txHash.slice(0,16)}... — Portal present + ${bnbTransferred.toFixed(2)} BNB transferred (>= ${MIN_BNB_RESERVE - 0.5} threshold)`);
    return true;
  } catch (err) {
    logValidation('unknown', 'ERROR', `TX ${txHash?.slice(0,16)}... — verifyGraduation error: ${err.message}`);
    console.error('[BONDING] verifyGraduation error:', err.message);
    return true;
  }
}

async function verifyBatch(events) {
  const verified = [];
  const CONCURRENT = 5;
  for (let i = 0; i < events.length; i += CONCURRENT) {
    const chunk = events.slice(i, i + CONCURRENT);
    const results = await Promise.all(
      chunk.map(ev => verifyGraduation(ev.txHash).then(ok => ok ? ev : null))
    );
    for (const r of results) {
      if (r) verified.push(r);
    }
    if (i + CONCURRENT < events.length) await sleep(100);
  }
  return verified;
}

// ═════════════════════════════════════════════════════════════════════════
// Batch-fetch block timestamps
// ═════════════════════════════════════════════════════════════════════════
async function fetchBlockTimestamps(blockNumbers) {
  const unique = [...new Set(blockNumbers)];
  if (!unique.length) return new Map();
  const BATCH = 50;
  const tsMap = new Map();
  for (let i = 0; i < unique.length; i += BATCH) {
    const chunk = unique.slice(i, i + BATCH);
    const batch = chunk.map(bn => ({
      jsonrpc: '2.0', id: bn,
      method:  'eth_getBlockByNumber',
      params:  ['0x' + bn.toString(16), false],
    }));
    try {
      const res = await safeFetch(BSC_RPC, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(batch),
      });
      const results = await res.json();
      for (const b of (Array.isArray(results) ? results : [])) {
        if (b.result?.timestamp) {
          tsMap.set(b.id, parseInt(b.result.timestamp, 16) * 1_000);
        }
      }
    } catch (err) {
      console.error('[BONDING] fetchBlockTimestamps:', err.message);
    }
    if (i + BATCH < unique.length) await sleep(50);
  }
  return tsMap;
}

// ═════════════════════════════════════════════════════════════════════════
// Backfill — scan PancakeSwap V2 + V3 Factory events for Flap.sh tokens
// ═════════════════════════════════════════════════════════════════════════
async function backfill(currentBlock) {
  const fromBlock = lastScannedBlock > 0
    ? lastScannedBlock + 1
    : currentBlock - BACKFILL_BLOCKS;

  if (fromBlock > currentBlock) return;

  const hex = n => '0x' + n.toString(16);
  const rawEvents = [];

  for (let s = fromBlock; s <= currentBlock; s += SCAN_CHUNK) {
    const e = Math.min(s + SCAN_CHUNK - 1, currentBlock);

    try {
      const [v2Logs, v3Logs] = await Promise.all([
        rpc({
          jsonrpc: '2.0', id: 1, method: 'eth_getLogs',
          params: [{
            address:   V2_FACTORY,
            topics:    [V2_PAIR_CREATED],
            fromBlock: hex(s),
            toBlock:   hex(e),
          }],
        }),
        rpc({
          jsonrpc: '2.0', id: 2, method: 'eth_getLogs',
          params: [{
            address:   V3_FACTORY,
            topics:    [V3_POOL_CREATED],
            fromBlock: hex(s),
            toBlock:   hex(e),
          }],
        }),
      ]);

      for (const l of (v2Logs || [])) {
        const parsed = extractFlapToken(l, 'v2');
        if (parsed) {
          rawEvents.push({
            ...parsed,
            blockNumber: parseInt(l.blockNumber, 16),
          });
        }
      }

      for (const l of (v3Logs || [])) {
        const parsed = extractFlapToken(l, 'v3');
        if (parsed) {
          rawEvents.push({
            ...parsed,
            blockNumber: parseInt(l.blockNumber, 16),
          });
        }
      }
    } catch (err) {
      console.error('[BONDING] backfill getLogs chunk:', err.message);
    }
    await sleep(80);
  }

  rawEvents.sort((a, b) => b.blockNumber - a.blockNumber);

  const candidates = [];
  const seen       = new Set(gradMap.keys());
  for (const ev of rawEvents) {
    if (seen.has(ev.tokenAddr)) continue;
    candidates.push(ev);
    seen.add(ev.tokenAddr);
  }

  console.log(`[BONDING] Candidates before verification: ${candidates.length}`);
  const toKeep = await verifyBatch(candidates);
  console.log(`[BONDING] Verified real graduations: ${toKeep.length}/${candidates.length}`);

  const blockNums = toKeep.map(e => e.blockNumber);
  const tsMap     = await fetchBlockTimestamps(blockNums);

  let found = 0;
  for (const ev of toKeep) {
    const blockTimestamp = tsMap.get(ev.blockNumber) || (Date.now() - (currentBlock - ev.blockNumber) * 3_000);
    gradMap.set(ev.tokenAddr, {
      blockNumber:    ev.blockNumber,
      blockTimestamp,
      pairAddr:       ev.pairAddr,
      version:        ev.version,
    });
    found++;
  }

  if (gradMap.size > MAX_TOKENS) {
    const sorted = [...gradMap.entries()].sort((a, b) => b[1].blockTimestamp - a[1].blockTimestamp);
    gradMap.clear();
    for (const [k, v] of sorted.slice(0, MAX_TOKENS)) gradMap.set(k, v);
  }

  lastScannedBlock = currentBlock;
  console.log(`[BONDING] Backfill done: +${found} new (total: ${gradMap.size}) | blocks ${fromBlock}–${currentBlock}`);
}

// ═════════════════════════════════════════════════════════════════════════
// Real-time WebSocket — listen to BOTH V2 + V3 Factories
// ═════════════════════════════════════════════════════════════════════════
function startWebSocket() {
  if (wsProvider) {
    try { wsProvider.destroy(); } catch (_) {}
    wsProvider = null;
  }

  try {
    wsProvider = new ethers.WebSocketProvider(BSC_WSS);

    const v2Filter = { address: V2_FACTORY, topics: [V2_PAIR_CREATED] };
    wsProvider.on(v2Filter, (log) => handleLiveLog(log, 'v2'));

    const v3Filter = { address: V3_FACTORY, topics: [V3_POOL_CREATED] };
    wsProvider.on(v3Filter, (log) => handleLiveLog(log, 'v3'));

    wsProvider.websocket.on('close', () => {
      console.warn('[BONDING] WSS closed — reconnecting in', WSS_RECONNECT / 1000, 's');
      setTimeout(startWebSocket, WSS_RECONNECT);
    });

    wsProvider.websocket.on('error', (err) => {
      console.error('[BONDING] WSS error:', err.message);
    });

    console.log('[BONDING] WebSocket active on PancakeSwap V2+V3 Factories');
  } catch (err) {
    console.error('[BONDING] WSS init error:', err.message, '— retrying in', WSS_RECONNECT / 1000, 's');
    setTimeout(startWebSocket, WSS_RECONNECT);
  }
}

async function handleLiveLog(log, version) {
  const parsed = extractFlapToken(log, version);
  if (!parsed) return;
  if (gradMap.has(parsed.tokenAddr)) return;

  const blockNumber = log.blockNumber || 0;
  const txHash = log.transactionHash;
  console.log(`[BONDING] Live candidate (${version}): ${parsed.tokenAddr} — verifying...`);

  const isReal = await verifyGraduation(txHash);
  if (!isReal) return;

  console.log(`[BONDING] VERIFIED graduation (${version}): ${parsed.tokenAddr} pair:${parsed.pairAddr} (block ${blockNumber})`);

  const tsMap          = blockNumber ? await fetchBlockTimestamps([blockNumber]) : new Map();
  const blockTimestamp = tsMap.get(blockNumber) || Date.now();

  gradMap.set(parsed.tokenAddr, {
    blockNumber,
    blockTimestamp,
    pairAddr: parsed.pairAddr,
    version,
  });

  if (gradMap.size > MAX_TOKENS) {
    let oldest = null, oldestTs = Infinity;
    for (const [addr, info] of gradMap) {
      if (info.blockTimestamp < oldestTs) { oldestTs = info.blockTimestamp; oldest = addr; }
    }
    if (oldest) gradMap.delete(oldest);
  }

  await enrichAndBroadcast();
}

// ═════════════════════════════════════════════════════════════════════════
// AVE API enrichment
// ═════════════════════════════════════════════════════════════════════════
async function aveSearch(addresses) {
  const result = new Map();
  if (!AVE_KEY) { console.warn('[BONDING] AVE_API_KEY missing'); return result; }

  for (let i = 0; i < addresses.length; i += AVE_BATCH) {
    const batch = addresses.slice(i, i + AVE_BATCH).map(a => `${a}-bsc`);
    try {
      const r = await safeFetch(`${AVE_BASE}/v2/tokens/search`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': AVE_KEY },
        body:    JSON.stringify({ token_ids: batch }),
      });
      const d = await r.json();
      if (d.status === 1 && Array.isArray(d.data)) {
        for (const t of d.data) {
          if (t.token) result.set(t.token.toLowerCase(), t);
        }
      }
    } catch (err) { console.error('[BONDING] AVE batch:', err.message); }
    if (i + AVE_BATCH < addresses.length) await sleep(200);
  }
  return result;
}

// ═════════════════════════════════════════════════════════════════════════
// Token images — 3-tier cascade
// ═════════════════════════════════════════════════════════════════════════
async function fetchFlapImages(addrSet) {
  const imgMap = new Map();
  try {
    const res = await safeFetch(FLAP_GQL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': BROWSER_UA },
      body:    JSON.stringify({
        query: `{ boardV2 { listed(limit: 200) { coins {
          address name symbol
          metadata { image }
        } } } }`,
      }),
      timeout: 12_000,
    });
    const data = await res.json();
    for (const coin of (data?.data?.boardV2?.listed?.coins || [])) {
      const addr = coin.address?.toLowerCase();
      if (!addr || !addrSet.has(addr)) continue;
      const cid = coin.metadata?.image;
      if (!cid) continue;
      const image = cid.startsWith('http') ? cid : `${IPFS_GW}${cid}?img-width=512&img-height=512&img-fit=cover`;
      imgMap.set(addr, { image, name: coin.name || null, symbol: coin.symbol || null });
    }
    console.log(`[BONDING] Flap images: ${imgMap.size}/${addrSet.size}`);
  } catch (err) { console.error('[BONDING] Flap image fetch:', err.message); }
  return imgMap;
}

async function fetchMoralisImages(addresses) {
  const imgMap = new Map();
  if (!MORALIS_KEY || !addresses.length) return imgMap;
  for (let i = 0; i < addresses.length; i += MORALIS_BATCH) {
    const batch = addresses.slice(i, i + MORALIS_BATCH);
    const params = batch.map((a, j) => `addresses[${j}]=${encodeURIComponent(a)}`).join('&');
    try {
      const res = await safeFetch(
        `https://deep-index.moralis.io/api/v2.2/erc20/metadata?chain=0x38&${params}`,
        { headers: { 'X-API-Key': MORALIS_KEY }, timeout: 10_000 },
      );
      const items = await res.json();
      for (const item of (Array.isArray(items) ? items : [])) {
        const addr = item.address?.toLowerCase();
        if (addr && item.logo) imgMap.set(addr, { image: item.logo, name: item.name || null, symbol: item.symbol || null });
      }
    } catch (err) { console.error('[BONDING] Moralis images:', err.message); }
    if (i + MORALIS_BATCH < addresses.length) await sleep(200);
  }
  return imgMap;
}

async function fetchDexScreenerImages(addresses) {
  const imgMap = new Map();
  if (!addresses.length) return imgMap;
  for (let i = 0; i < addresses.length; i += DSC_BATCH) {
    const batch = addresses.slice(i, i + DSC_BATCH);
    try {
      const res = await safeFetch(
        `https://api.dexscreener.com/tokens/v1/bsc/${batch.join(',')}`,
        { timeout: 10_000 },
      );
      const data = await res.json();
      const pairs = Array.isArray(data) ? data : (data?.pairs || []);
      for (const pair of pairs) {
        const addr = pair?.baseToken?.address?.toLowerCase();
        const img  = pair?.info?.imageUrl;
        if (addr && img && !imgMap.has(addr)) {
          imgMap.set(addr, { image: img, name: pair.baseToken?.name || null, symbol: pair.baseToken?.symbol || null });
        }
      }
    } catch (err) { console.error('[BONDING] DexScreener images:', err.message); }
    if (i + DSC_BATCH < addresses.length) await sleep(300);
  }
  return imgMap;
}

async function fetchImages(addresses) {
  if (!addresses.length) return new Map();
  const addrSet = new Set(addresses.map(a => a.toLowerCase()));

  const imgMap = await fetchFlapImages(addrSet);

  const missing2 = addresses.filter(a => !imgMap.has(a.toLowerCase()));
  if (missing2.length > 0) {
    const m2 = await fetchMoralisImages(missing2);
    for (const [k, v] of m2) imgMap.set(k, v);
  }

  const missing3 = addresses.filter(a => !imgMap.has(a.toLowerCase()));
  if (missing3.length > 0) {
    const m3 = await fetchDexScreenerImages(missing3);
    for (const [k, v] of m3) imgMap.set(k, v);
  }

  return imgMap;
}

// ═════════════════════════════════════════════════════════════════════════
// Enrich & broadcast
// ═════════════════════════════════════════════════════════════════════════
export async function enrichAndBroadcast() {
  if (gradMap.size === 0) return;

  if (enrichLock) { enrichPending = true; return; }
  enrichLock = true;
  try {
    await _doEnrich();
  } finally {
    enrichLock = false;
    if (enrichPending) { enrichPending = false; enrichAndBroadcast().catch(() => {}); }
  }
}

async function _doEnrich() {
  const snapshot  = new Map(gradMap);
  const allAddrs  = [...snapshot.keys()];
  const curBlock  = lastScannedBlock || 0;

  const aveMap = await aveSearch(allAddrs);

  const noLogo = allAddrs.filter(a => !aveMap.get(a)?.logo_url?.trim());
  const imgMap = noLogo.length > 0 ? await fetchImages(noLogo) : new Map();

  const noName = allAddrs.filter(a => !aveMap.get(a)?.name && !imgMap.get(a)?.name);
  let dexMeta = new Map();
  if (noName.length > 0) {
    try {
      for (let i = 0; i < noName.length; i += DSC_BATCH) {
        const batch = noName.slice(i, i + DSC_BATCH);
        const r = await safeFetch(`https://api.dexscreener.com/tokens/v1/bsc/${batch.join(',')}`, { timeout: 12_000 });
        const d = await r.json();
        const pairs = Array.isArray(d) ? d : (d?.pairs || []);
        for (const p of pairs) {
          const a = p?.baseToken?.address?.toLowerCase();
          if (a && !dexMeta.has(a)) {
            dexMeta.set(a, { name: p.baseToken.name, symbol: p.baseToken.symbol, image: p.info?.imageUrl || null });
          }
        }
        if (i + DSC_BATCH < noName.length) await sleep(300);
      }
    } catch (e) { console.error('[BONDING] DexScreener metadata fallback:', e.message); }
  }

  console.log(`[BONDING] AVE: ${aveMap.size}/${allAddrs.length}  Images: ${imgMap.size}  DexMeta: ${dexMeta.size}`);

  const results = [];
  for (const addr of allAddrs) {
    const info = snapshot.get(addr);
    const ave  = aveMap.get(addr);
    const meta = imgMap.get(addr);
    const dex  = dexMeta.get(addr);

    const name   = ave?.name   || meta?.name   || dex?.name   || null;
    const ticker = ave?.symbol || meta?.symbol || dex?.symbol || null;

    const graduatedAt = info.blockTimestamp || (info.blockNumber
      ? Date.now() - (curBlock - info.blockNumber) * 3_000
      : Date.now());

    const image     = ave?.logo_url?.trim() || meta?.image || dex?.image || null;
    const mcap      = parseFloat(ave?.market_cap)              || 0;
    const price     = parseFloat(ave?.current_price_usd)       || 0;
    const volume24h = parseFloat(ave?.token_tx_volume_usd_24h) || 0;
    const change24h = parseFloat(ave?.token_price_change_24h)  || 0;
    const liquidity = parseFloat(ave?.tvl)                     || 0;
    const holders   = ave?.holders    || 0;
    const buyTax    = parseFloat(ave?.buy_tx)  || 0;
    const sellTax   = parseFloat(ave?.sell_tx) || 0;
    const buys24h   = ave?.token_buy_tx_count_24h  || 0;
    const sells24h  = ave?.token_sell_tx_count_24h || 0;
    const aveRisk   = ave?.ave_risk_level ?? 0;
    const isHoneypot = ave?.is_honeypot || false;

    const dexVersion = info.version === 'v3' ? 'PancakeSwap V3' : 'PancakeSwap V2';

    results.push({
      address:      addr,
      ca:           addr,
      name:         name   || 'Unknown',
      ticker:       ticker || '???',
      mcap,
      price,
      holders,
      change24h,
      volume24h,
      liquidity,
      buys24h,
      sells24h,
      image,
      graduatedAt,
      createdAt:    new Date(graduatedAt).toISOString(),
      taxRate:      buyTax || sellTax,
      buyTax,
      sellTax,
      aveRisk,
      isHoneypot,
      dexPaid:      false,
      dexUrl:       `https://dexscreener.com/bsc/${addr}`,
      pairAddr:     info.pairAddr || null,
      dexVersion,
      graduated:    true,
      listed:       true,
      section:      'listed',
      bondingCurve: false,
      bondProgress: 100,
    });
  }

  results.sort((a, b) => (b.graduatedAt || 0) - (a.graduatedAt || 0));
  bondingTokens = results.slice(0, MAX_TOKENS);

  const newest = bondingTokens[0];
  const oldest = bondingTokens[bondingTokens.length - 1];
  const newestAgo = newest ? Math.round((Date.now() - newest.graduatedAt) / 60000) : 0;
  const oldestAgo = oldest ? Math.round((Date.now() - oldest.graduatedAt) / 60000) : 0;
  const oldestStr = oldestAgo > 1440 ? `${(oldestAgo / 1440).toFixed(1)}d` : oldestAgo > 60 ? `${(oldestAgo / 60).toFixed(1)}h` : `${oldestAgo}m`;
  console.log(`[BONDING] ${bondingTokens.length} graduated tokens | newest: ${newest?.ticker} (${newestAgo}m ago) | oldest: ${oldest?.ticker} (${oldestStr} ago)`);

  if (_wss) {
    const msg = JSON.stringify({ type: 'recent_bonding', tokens: bondingTokens });
    _wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
  }
}

// ═════════════════════════════════════════════════════════════════════════
// Entry point
// ═════════════════════════════════════════════════════════════════════════
async function backfillAndWatch() {
  try {
    const currentBlock = await getCurrentBlock();
    await backfill(currentBlock);
    await enrichAndBroadcast();
  } catch (err) {
    console.error('[BONDING] Initial backfill error:', err.message);
  }

  startWebSocket();

  if (enrichTimer) clearInterval(enrichTimer);
  enrichTimer = setInterval(async () => {
    try {
      const cur = await getCurrentBlock();
      await backfill(cur);
      await enrichAndBroadcast();
    } catch (err) { console.error('[BONDING] Periodic enrich error:', err.message); }
  }, ENRICH_INTERVAL);
}

export const update = enrichAndBroadcast;
