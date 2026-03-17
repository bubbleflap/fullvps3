// ═══════════════════════════════════════════════════════════════════════════
// dexPaidService.js — FULLY INDEPENDENT DexPaid token feed
// ───────────────────────────────────────────────────────────────────────────
// Serves /api/dexpaid-tokens
// Own state, own API calls, zero dependency on shared app globals.
// Exposes getDexPaidMap() so other services can read dexPaid status.
// ═══════════════════════════════════════════════════════════════════════════

const BROWSER_UA    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEX_PAID_TTL  = 30_000;
const UPDATE_INTERVAL_MS = 30_000;

// ── Own state ────────────────────────────────────────────────────────────────
const dexPaidDetectedAtMap = new Map(); // addr_lower -> timestamp first seen
let dexPaidCache  = [];
let lastFetchAt   = 0;
let updateTimer   = null;
let _dbPool       = null;

// ── Public API ───────────────────────────────────────────────────────────────
export function init() {}

export function getDexPaidTokens()  { return dexPaidCache; }
export function getDexPaidMap()     { return dexPaidDetectedAtMap; }

export function setDbPool(pool) { _dbPool = pool; }

export function setDetectedMap(map) {
  for (const [k, v] of map) dexPaidDetectedAtMap.set(k, v);
}

/** Called by the chain-event listener when a boost is detected on-chain */
export function markDexPaid(addrLower) {
  if (!dexPaidDetectedAtMap.has(addrLower)) {
    const ts = Date.now();
    dexPaidDetectedAtMap.set(addrLower, ts);
    _saveDexPaidDetected(addrLower, ts);
  }
}

async function _saveDexPaidDetected(address, detectedAt) {
  if (!_dbPool) return;
  try {
    await _dbPool.query(
      "INSERT INTO dex_paid_detected (address, detected_at) VALUES ($1, $2) ON CONFLICT (address) DO NOTHING",
      [address, detectedAt]
    );
  } catch {}
}

export function startUpdates() {
  update();
  if (updateTimer) clearInterval(updateTimer);
  updateTimer = setInterval(update, UPDATE_INTERVAL_MS);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const isFlapAddress = addr => addr.endsWith('7777') || addr.endsWith('8888');

function pairHasDexPaid(pair) {
  if (!pair) return false;
  if ((pair.boosts?.active || 0) > 0) return true;
  if (pair.info?.header)    return true;
  if (pair.info?.openGraph) return true;
  return false;
}

async function fetchBestPairs(addresses) {
  const result = new Map();
  for (let i = 0; i < addresses.length; i += 30) {
    const batch = addresses.slice(i, i + 30);
    try {
      const res = await fetch(
        `https://api.dexscreener.com/tokens/v1/bsc/${batch.join(',')}`,
        { headers: { 'User-Agent': BROWSER_UA } }
      );
      if (res.ok) {
        const pairs = await res.json();
        if (Array.isArray(pairs)) {
          for (const pair of pairs) {
            const addr = pair.baseToken?.address?.toLowerCase();
            if (!addr) continue;
            const existing = result.get(addr);
            if (!existing || (pair.liquidity?.usd || 0) > (existing.liquidity?.usd || 0)) {
              result.set(addr, pair);
            }
          }
        }
      }
    } catch (err) {
      console.error('[DexPaid] fetchBestPairs error:', err.message);
    }
    if (i + 30 < addresses.length) await new Promise(r => setTimeout(r, 300));
  }
  return result;
}

// ── Core update ───────────────────────────────────────────────────────────────
export async function update() {
  const now = Date.now();
  if (dexPaidCache.length > 0 && now - lastFetchAt < DEX_PAID_TTL) return;

  try {
    const candidates = new Map(); // addr_lower -> { boostData, detectedOrder }
    const pairMap    = new Map(); // addr_lower -> best DexScreener pair

    // ── SOURCE A: DexScreener boost endpoints ────────────────────────────────
    try {
      const [latestRes, topRes] = await Promise.all([
        fetch('https://api.dexscreener.com/token-boosts/latest/v1', { headers: { 'User-Agent': BROWSER_UA } }),
        fetch('https://api.dexscreener.com/token-boosts/top/v1',    { headers: { 'User-Agent': BROWSER_UA } }),
      ]);
      const latestBoosts = latestRes.ok ? (await latestRes.json()) : [];
      const topBoosts    = topRes.ok    ? (await topRes.json())    : [];

      let order = 0;
      for (const boost of [...(Array.isArray(latestBoosts) ? latestBoosts : []), ...(Array.isArray(topBoosts) ? topBoosts : [])]) {
        if (boost.chainId !== 'bsc') continue;
        const addr = (boost.tokenAddress || '').toLowerCase();
        if (!addr || !isFlapAddress(addr)) continue;
        if (!candidates.has(addr)) {
          candidates.set(addr, { boostData: boost, detectedOrder: order++ });
          if (!dexPaidDetectedAtMap.has(addr)) {
            dexPaidDetectedAtMap.set(addr, now);
            _saveDexPaidDetected(addr, now);
          }
        }
      }
      console.log(`[DexPaid] Boost endpoints: ${candidates.size} Flap.sh candidates`);
    } catch (err) {
      console.error('[DexPaid] Boost endpoints error:', err.message);
    }

    // ── SOURCE B: DexScreener search 7777 / 8888 ─────────────────────────────
    try {
      const [res7, res8] = await Promise.all([
        fetch('https://api.dexscreener.com/latest/dex/search?q=7777', { headers: { 'User-Agent': BROWSER_UA } }),
        fetch('https://api.dexscreener.com/latest/dex/search?q=8888', { headers: { 'User-Agent': BROWSER_UA } }),
      ]);
      const searchPairs = [
        ...((res7.ok ? await res7.json() : {}).pairs || []),
        ...((res8.ok ? await res8.json() : {}).pairs || []),
      ].filter(p => p.chainId === 'bsc' && isFlapAddress(p.baseToken?.address?.toLowerCase()) && pairHasDexPaid(p));

      for (const pair of searchPairs) {
        const addr = pair.baseToken?.address?.toLowerCase();
        if (!addr) continue;
        const existing = pairMap.get(addr);
        if (!existing || (pair.liquidity?.usd || 0) > (existing.liquidity?.usd || 0)) pairMap.set(addr, pair);
        if (!candidates.has(addr)) {
          candidates.set(addr, { boostData: null, detectedOrder: candidates.size });
          if (!dexPaidDetectedAtMap.has(addr)) {
            dexPaidDetectedAtMap.set(addr, now);
            _saveDexPaidDetected(addr, now);
          }
        }
      }
      console.log(`[DexPaid] Search: ${pairMap.size} Flap.sh paid pairs`);
    } catch (err) {
      console.error('[DexPaid] Search error:', err.message);
    }

    // ── Enrich: fetch pair data for boost-only candidates ────────────────────
    const needsPair = Array.from(candidates.keys()).filter(a => !pairMap.has(a));
    if (needsPair.length > 0) {
      const fetched = await fetchBestPairs(needsPair);
      for (const [addr, pair] of fetched) pairMap.set(addr, pair);
    }

    // ── Build results ─────────────────────────────────────────────────────────
    const results = [];
    for (const [addr, { boostData, detectedOrder }] of candidates) {
      const pair = pairMap.get(addr);
      if (!pair) continue;
      if (!boostData && !pairHasDexPaid(pair)) continue;

      const base = pair.baseToken || {};
      results.push({
        address:     base.address || addr,
        name:        base.name    || 'Unknown',
        ticker:      base.symbol  || '',
        image:       pair.info?.imageUrl || boostData?.icon || null,
        icon:        pair.info?.imageUrl || boostData?.icon || null,
        header:      pair.info?.header   || null,
        description: boostData?.description || null,
        graduated: true, listed: true,
        mcap:        pair.marketCap   || pair.fdv || 0,
        priceUsd:    pair.priceUsd    || null,
        volume24h:   pair.volume?.h24 || 0,
        priceChange24h: pair.priceChange?.h24 || 0,
        liquidity:   pair.liquidity?.usd || 0,
        pairAddress: pair.pairAddress  || null,
        dexUrl:      pair.url || `https://dexscreener.com/bsc/${addr}`,
        boostAmount: pair.boosts?.active || boostData?.amount || 0,
        website:     pair.info?.websites?.[0]?.url || null,
        twitter:     pair.info?.socials?.find(s => s.type === 'twitter')?.url  || null,
        telegram:    pair.info?.socials?.find(s => s.type === 'telegram')?.url || null,
        discord:     pair.info?.socials?.find(s => s.type === 'discord')?.url  || null,
        pairCreatedAt:     pair.pairCreatedAt || null,
        dexPaidDetectedAt: dexPaidDetectedAtMap.get(addr) || now,
        detectedOrder,
      });
    }

    results.sort((a, b) => (b.dexPaidDetectedAt || 0) - (a.dexPaidDetectedAt || 0));

    dexPaidCache = results.slice(0, 75);
    lastFetchAt  = now;
    console.log(`[DexPaid] ${dexPaidCache.length} dex-paid Flap.sh tokens`);
  } catch (err) {
    console.error('[DexPaid] Fetch error:', err.message);
  }
}
