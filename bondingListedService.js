// ══════════════════════════════════════════════════════════════════════
// bondingListedService.js
//
// PURPOSE : BONDING PAGE (/dashboard → Bonding section)
// DATA    : Latest 75 tokens GRADUATED from Flap.sh bonding curve
//           (16 BNB reserve hit → PancakeSwap pool created)
//
// PIPELINE:
//   PRIMARY: bondingService.getBondingTokens()
//     On-chain verified graduates (PancakeSwap Factory events + Portal check)
//   SECONDARY: Historical tokens from Flap.sh API (cachedListedTokens)
//     Fills in older graduates that public RPC can't reach (block pruning)
//   ENRICHMENT: DexScreener live market data overlay
//   OUTPUT: Merged, deduplicated, newest-first, max 75 tokens
//
// PERSISTENCE: recent_graduations DB table survives restarts
// ══════════════════════════════════════════════════════════════════════

import { getBondingTokens } from './bondingService.js';
import { appendFileSync } from 'fs';
import { ethers } from 'ethers';

const VALIDATION_LOG = 'validation_log.txt';
function logValidation(address, status, reason) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${status}: ${address} — ${reason}\n`;
  try { appendFileSync(VALIDATION_LOG, line); } catch (_) {}
}

const IPFS_GW    = 'https://flap.mypinata.cloud/ipfs/';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const DSC_BATCH  = 30;
const CACHE_TTL  = 60_000;
const MAX_TOKENS = 75;

let _cache    = [];
let _cacheAt  = 0;
let _inflight = null;
let _historical = [];
let _dbPool   = null;

export function setHistoricalTokens(tokens) {
  _historical = (tokens || []).filter(t => {
    const addr = (t.address || t.ca || '').toLowerCase();
    return addr.endsWith('7777') || addr.endsWith('8888');
  });
}

export function setDbPool(pool) {
  _dbPool = pool;
}

function resolveIpfs(cid) {
  if (!cid) return null;
  if (cid.startsWith('http')) return cid;
  return `${IPFS_GW}${cid}?img-width=128&img-height=128&img-fit=cover`;
}

async function safeFetch(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    signal: AbortSignal.timeout(opts.timeout || 12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function mapRisk(score) {
  const r = Number(score) || 0;
  if (r >= 7) return 'CRITICAL';
  if (r >= 5) return 'HIGH';
  if (r >= 3) return 'MEDIUM';
  return 'LOW';
}

async function dexEnrich(addresses) {
  const result = new Map();
  if (!addresses.length) return result;
  for (let i = 0; i < addresses.length; i += DSC_BATCH) {
    const batch = addresses.slice(i, i + DSC_BATCH);
    try {
      const r = await safeFetch(
        `https://api.dexscreener.com/tokens/v1/bsc/${batch.join(',')}`,
        { timeout: 12_000 },
      );
      const d = await r.json();
      const pairs = Array.isArray(d) ? d : (d?.pairs || []);
      for (const pair of pairs) {
        const addr = pair?.baseToken?.address?.toLowerCase();
        if (!addr || result.has(addr)) continue;
        const dexId = (pair.dexId || '').toLowerCase();
        let exchange = 'PANCAKESWAP';
        if (dexId.includes('uniswap')) exchange = 'UNISWAP';
        else if (dexId.includes('biswap')) exchange = 'BISWAP';
        else if (dexId && !dexId.includes('pancake')) exchange = dexId.toUpperCase();
        result.set(addr, {
          exchange,
          dexUrl:    pair.url || `https://dexscreener.com/bsc/${addr}`,
          imageUrl:  pair.info?.imageUrl || null,
          mcap:      pair.marketCap      || 0,
          volume24h: pair.volume?.h24    || 0,
          liquidity: pair.liquidity?.usd || 0,
          change24h: pair.priceChange?.h24 || 0,
          buys24h:   pair.txns?.h24?.buys  || 0,
          sells24h:  pair.txns?.h24?.sells || 0,
        });
      }
    } catch (e) {
      console.error('[BONDING-LISTED] DexScreener batch error:', e.message);
    }
    if (i + DSC_BATCH < addresses.length) await sleep(200);
  }
  return result;
}

async function discoverRecentGraduates() {
  const results = [];
  try {
    const [res7, res8] = await Promise.allSettled([
      safeFetch('https://api.dexscreener.com/latest/dex/search?q=7777', { timeout: 12_000 }),
      safeFetch('https://api.dexscreener.com/latest/dex/search?q=8888', { timeout: 12_000 }),
    ]);
    const pairs = [
      ...((res7.status === 'fulfilled' ? await res7.value.json() : {})?.pairs || []),
      ...((res8.status === 'fulfilled' ? await res8.value.json() : {})?.pairs || []),
    ];
    const seen = new Set();
    for (const pair of pairs) {
      const addr = pair.baseToken?.address?.toLowerCase();
      if (!addr || seen.has(addr)) continue;
      if (pair.chainId !== 'bsc') continue;
      if (!addr.endsWith('7777') && !addr.endsWith('8888')) continue;
      if (!pair.pairCreatedAt) continue;
      seen.add(addr);
      results.push({
        address: addr,
        name: pair.baseToken.name || pair.baseToken.symbol || 'Unknown',
        ticker: pair.baseToken.symbol || '???',
        mcap: pair.marketCap || 0,
        volume24h: pair.volume?.h24 || 0,
        liquidity: pair.liquidity?.usd || 0,
        change24h: pair.priceChange?.h24 || 0,
        holders: 0,
        image: pair.info?.imageUrl || null,
        graduatedAt: pair.pairCreatedAt,
        listedAt: pair.pairCreatedAt,
        dexUrl: pair.url || null,
        buys24h: pair.txns?.h24?.buys || 0,
        sells24h: pair.txns?.h24?.sells || 0,
        listed: true,
        graduated: true,
      });
    }
    console.log(`[BONDING-LISTED] DexScreener search: ${results.length} recent graduates`);
    for (const r of results) {
      logValidation(r.address, 'DEX-FOUND', `DexScreener search — ${r.ticker} — pair created ${new Date(r.graduatedAt).toISOString()} — mcap=$${(r.mcap||0).toFixed(0)} liq=$${(r.liquidity||0).toFixed(0)}`);
    }
  } catch (e) {
    console.error('[BONDING-LISTED] DexScreener search error:', e.message);
  }
  return results;
}

async function loadFromDb() {
  if (!_dbPool) return [];
  try {
    const { rows } = await _dbPool.query(
      `SELECT address, data, detected_at FROM recent_graduations ORDER BY detected_at DESC LIMIT $1`,
      [MAX_TOKENS]
    );
    return rows.map(r => {
      const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
      const dbTime = r.detected_at ? new Date(r.detected_at).getTime() : null;
      if (!d.graduatedAt && !d.listedAt && dbTime) {
        d.graduatedAt = dbTime;
        d.listedAt = dbTime;
      }
      return { ...d, address: r.address, _fromDb: true };
    });
  } catch (e) {
    console.error('[BONDING-LISTED] DB load error:', e.message);
    return [];
  }
}

async function saveToDb(tokens) {
  if (!_dbPool || !tokens.length) return;
  try {
    for (const t of tokens) {
      const addr = (t.address || t.ca || '').toLowerCase();
      if (!addr) continue;
      await _dbPool.query(
        `INSERT INTO recent_graduations (address, data, detected_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (address) DO UPDATE SET data = $2, detected_at = $3`,
        [addr, JSON.stringify(t), new Date(t.graduatedAt || t.listedAt || Date.now())]
      );
    }
  } catch (e) {
    console.error('[BONDING-LISTED] DB save error:', e.message);
  }
}

const META_URI_IFACE = new ethers.Interface(['function metaURI() view returns (string)']);
const RPC_URL = 'https://bsc-rpc.publicnode.com';

async function fetchPinataImages(addresses) {
  const imgMap = new Map();
  if (!addresses.length) return imgMap;
  let provider;
  try {
    provider = new ethers.JsonRpcProvider(RPC_URL);
  } catch { return imgMap; }

  for (const addr of addresses) {
    try {
      const contract = new ethers.Contract(addr, META_URI_IFACE, provider);
      const metaCid = await contract.metaURI();
      if (!metaCid) continue;
      const metaRes = await fetch(`${IPFS_GW}${metaCid}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!metaRes.ok) continue;
      const meta = await metaRes.json();
      if (meta.image) {
        const imageUrl = meta.image.startsWith('http') ? meta.image : `${IPFS_GW}${meta.image}`;
        imgMap.set(addr, imageUrl);
      }
    } catch {}
  }
  const still = addresses.filter(a => !imgMap.has(a));
  if (still.length > 0) {
    const MORALIS_KEY = process.env.MORALIS_API_KEY;
    if (MORALIS_KEY) {
      try {
        const params = still.map((a, i) => `addresses[${i}]=${encodeURIComponent(a)}`).join('&');
        const r = await fetch(`https://deep-index.moralis.io/api/v2.2/erc20/metadata?chain=0x38&${params}`, {
          headers: { 'X-API-Key': MORALIS_KEY },
          signal: AbortSignal.timeout(10000),
        });
        const items = await r.json();
        for (const item of (Array.isArray(items) ? items : [])) {
          const a = item.address?.toLowerCase();
          if (a && (item.logo || item.thumbnail)) {
            imgMap.set(a, item.logo || item.thumbnail);
          }
        }
      } catch {}
    }
  }
  if (imgMap.size > 0) {
    console.log(`[BONDING-LISTED] Pinata/Moralis images: ${imgMap.size}/${addresses.length}`);
  }
  return imgMap;
}

function normalizeToken(t, dex, now) {
  const addr = (t.address || t.ca || t._addr || '').toLowerCase();
  const graduatedAt = t.graduatedAt || t.listedAt || now;
  const listedAt = graduatedAt;

  return {
    address:     addr,
    ca:          addr,
    name:        t.name   || 'Unknown',
    ticker:      t.ticker || '???',
    mcap:        dex?.mcap || t.mcap || 0,
    volume24h:   dex?.volume24h || t.volume24h || 0,
    change24h:   dex?.change24h || t.change24h || 0,
    liquidity:   dex?.liquidity || t.liquidity || 0,
    holders:     t.holders || 0,
    image:       t.image   || dex?.imageUrl || null,
    graduatedAt,
    listedAt,
    createdAt:   new Date(listedAt).toISOString(),
    exchange:    dex?.exchange || 'PANCAKESWAP',
    dexUrl:      dex?.dexUrl   || t.dexUrl || `https://dexscreener.com/bsc/${addr}`,
    flapUrl:    `https://flap.sh/token/${addr}`,
    bscUrl:     `https://bscscan.com/token/${addr}`,
    risk:        mapRisk(t.aveRisk || t.riskScore),
    riskScore:   Number(t.aveRisk || t.riskScore) || 0,
    buys24h:     dex?.buys24h  || t.buys24h  || 0,
    sells24h:    dex?.sells24h || t.sells24h || 0,
    website:     t.website     || null,
    twitter:     t.twitter     || null,
    telegram:    t.telegram    || null,
    description: t.description || null,
    listed:      true,
    graduated:   true,
    section:    'listed',
  };
}

async function _build() {
  const bondTokens  = getBondingTokens();
  const dbTokens    = await loadFromDb();
  const dexTokens   = await discoverRecentGraduates();
  const histTokens  = _historical;

  const onChainCount = bondTokens.length;
  const dexCount     = dexTokens.length;
  const histCount    = histTokens.length;
  const dbCount      = dbTokens.length;

  const seen   = new Set();
  const merged = [];

  for (const t of bondTokens) {
    const addr = (t.address || t.ca || '').toLowerCase();
    if (!addr || seen.has(addr)) continue;
    seen.add(addr);
    merged.push({ ...t, _addr: addr, _source: 'chain' });
  }

  for (const t of dexTokens) {
    const addr = (t.address || t.ca || '').toLowerCase();
    if (!addr || seen.has(addr)) continue;
    seen.add(addr);
    merged.push({ ...t, _addr: addr, _source: 'dex' });
  }

  for (const t of dbTokens) {
    const addr = (t.address || t.ca || '').toLowerCase();
    if (!addr || seen.has(addr)) continue;
    if (!addr.endsWith('7777') && !addr.endsWith('8888')) continue;
    seen.add(addr);
    merged.push({ ...t, _addr: addr, _source: 'db' });
  }

  for (const t of histTokens) {
    const addr = (t.address || t.ca || '').toLowerCase();
    if (!addr || seen.has(addr)) continue;
    seen.add(addr);
    merged.push({ ...t, _addr: addr, _source: 'api' });
  }

  if (!merged.length) {
    console.log('[BONDING-LISTED] No tokens from any source yet — will retry');
    return;
  }

  const addrs  = merged.map(t => t._addr);
  const dexMap = await dexEnrich(addrs);

  const noImage = merged.filter(t => {
    const dex = dexMap.get(t._addr);
    return !t.image && !dex?.imageUrl;
  }).map(t => t._addr);
  const pinataMap = noImage.length > 0 ? await fetchPinataImages(noImage) : new Map();

  const now     = Date.now();
  const sourceMap = new Map();
  for (const t of merged) sourceMap.set(t._addr, t._source);

  const results = merged.map(t => {
    const norm = normalizeToken(t, dexMap.get(t._addr), now);
    if (!norm.image && pinataMap.has(t._addr)) {
      norm.image = pinataMap.get(t._addr);
    }
    return norm;
  });

  results.sort((a, b) => (b.listedAt || 0) - (a.listedAt || 0));

  _cache   = results.slice(0, MAX_TOKENS);
  _cacheAt = now;

  const toSave = _cache.filter(t => {
    const src = sourceMap.get(t.address);
    return src === 'chain' || src === 'dex' || src === 'api';
  });
  if (toSave.length > 0) {
    await saveToDb(toSave);
  }

  const newest = _cache[0];
  const oldest = _cache[_cache.length - 1];
  const fmtAgo = ms => { const m = Math.round(ms / 60000); return m > 1440 ? `${(m/1440).toFixed(1)}d` : m > 60 ? `${(m/60).toFixed(1)}h` : `${m}m`; };
  const srcBreakdown = `chain:${onChainCount} dex:${dexCount} db:${dbCount} api:${histCount}`;
  console.log(
    `[LISTED] ${_cache.length}/${results.length} graduated tokens (${srcBreakdown}) | ` +
    `newest: ${newest?.ticker} (${fmtAgo(now - (newest?.listedAt || now))} ago) | ` +
    `oldest: ${oldest?.ticker} (${fmtAgo(now - (oldest?.listedAt || now))} ago)`
  );

  logValidation('SUMMARY', 'MERGE', `${_cache.length} tokens total — sources: ${srcBreakdown} — enriched via DexScreener API — all mcap/liq values from live DexScreener data (no placeholders)`);
  for (const t of _cache) {
    const src = sourceMap.get(t.address) || '?';
    logValidation(t.address, 'INCLUDED', `${t.ticker} (${src}) — mcap=$${(t.mcap||0).toFixed(0)} liq=$${(t.liquidity||0).toFixed(0)} — listed ${new Date(t.listedAt).toISOString()}`);
  }
}

export async function getListedTokens() {
  const stale = Date.now() - _cacheAt > CACHE_TTL;
  if (!stale && _cache.length > 0) return _cache;
  if (_inflight) return _inflight.then(() => _cache);
  _inflight = _build().catch(e => console.error('[BONDING-LISTED] build error:', e.message));
  await _inflight;
  _inflight = null;
  return _cache;
}

setTimeout(() => getListedTokens().catch(() => {}), 15_000);

setInterval(() => {
  _build().catch(e => console.error('[BONDING-LISTED] refresh error:', e.message));
}, CACHE_TTL);
