// ═══════════════════════════════════════════════════════════════════════════
// asterService.js — FULLY INDEPENDENT Aster token feed
// ───────────────────────────────────────────────────────────────────────────
// Serves /api/new-tokens-aster and /api/bonding-tokens-aster
// Own state, own API calls, zero dependency on shared app globals.
// ═══════════════════════════════════════════════════════════════════════════

const FLAP_GQL      = 'https://bnb.taxed.fun';
const BROWSER_UA    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const IPFS_GW       = 'https://flap.mypinata.cloud/ipfs/';
const ASTER_CA      = '0x000ae314e2a2172a039b26378814c252734f556a';
const CACHE_TTL_MS  = 10_000;
const UPDATE_INTERVAL_MS = 5 * 60 * 1000;

const COIN_FIELDS = `
  name address symbol listed createdAt
  r(round: 3) h(round: 3) k(round: 3) dexThreshSupply
  marketcap(round: 18) reserve(round: 18) supply(round: 18)
  quoteToken tax beneficiary creator nHolders
  author { name pfp }
  holders { holder amount }
  metadata { description image website twitter telegram }
`;

const BOARD_QUERY = `{
  boardV2 {
    newlyCreated(limit: 80, quoteToken: "${ASTER_CA}") { coins { ${COIN_FIELDS} } }
    graduating(limit: 50, quoteToken: "${ASTER_CA}") { coins { ${COIN_FIELDS} } }
    listed(limit: 50, quoteToken: "${ASTER_CA}") { coins { ${COIN_FIELDS} } }
  }
}`;

// ── Own state ───────────────────────────────────────────────────────────────
let asterNewTokens    = [];
let asterBondingTokens = [];
let asterUsdPrice     = 0;
let lastFetchTime     = 0;
let lastPriceFetchAt  = 0;
let updateTimer       = null;

let _wss = null;

// ── Public API ──────────────────────────────────────────────────────────────
export function init({ wss }) {
  _wss = wss;
}

export function getAsterNewTokens()     { return asterNewTokens; }
export function getAsterBondingTokens() { return asterBondingTokens; }
export function getAsterUsdPrice()      { return asterUsdPrice; }

export function startUpdates() {
  update();
  if (updateTimer) clearInterval(updateTimer);
  updateTimer = setInterval(update, UPDATE_INTERVAL_MS);
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function resolveImage(img) {
  if (!img) return null;
  if (img.startsWith('http')) return img;
  return IPFS_GW + img + '?img-width=512&img-height=512&img-fit=cover';
}

async function fetchAsterPrice() {
  if (asterUsdPrice > 0 && Date.now() - lastPriceFetchAt < 60_000) return asterUsdPrice;
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ASTER_CA}`, {
      headers: { 'User-Agent': BROWSER_UA },
    });
    if (!res.ok) return asterUsdPrice;
    const d = await res.json();
    const pairs = (d.pairs || []).filter(p => p.chainId === 'bsc');
    const best = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    if (best?.priceUsd) {
      asterUsdPrice = parseFloat(best.priceUsd) || 0;
      lastPriceFetchAt = Date.now();
      console.log(`[ASTER] Price: $${asterUsdPrice.toFixed(6)}`);
    }
  } catch (err) {
    console.error('[ASTER] Price fetch error:', err.message);
  }
  return asterUsdPrice;
}

async function queryFlap(query) {
  const res = await fetch(FLAP_GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': BROWSER_UA },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Flap.sh ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.errors) throw new Error(`Flap.sh errors: ${JSON.stringify(data.errors).slice(0, 200)}`);
  return data.data;
}

function mapCoin(coin, price, section) {
  const mcapAster   = parseFloat(coin.marketcap) || 0;
  const mcapUsd     = mcapAster * price;
  const reserveAst  = parseFloat(coin.reserve) || 0;
  const BOND_TARGET = 10_000;
  const bondProgress = Math.min((reserveAst / BOND_TARGET) * 100, 100);
  const isBonding   = !coin.listed && reserveAst >= 0.01;
  const isGraduated = coin.listed || bondProgress >= 100;
  const tokenPrice  = mcapAster > 0 ? (mcapAster * price) / 1_000_000_000 : 0;
  const holders     = typeof coin.nHolders === 'number' ? coin.nHolders
    : Array.isArray(coin.holders) ? coin.holders.length : 0;

  return {
    address:    coin.address,
    name:       coin.name   || 'Unknown',
    ticker:     coin.symbol || '???',
    mcap:       mcapUsd,
    mcapBnb:    mcapAster,
    price:      tokenPrice,
    holders,
    change24h:  0,
    image:      resolveImage(coin.metadata?.image) || null,
    createdAt:  coin.createdAt ? new Date(coin.createdAt * 1000).toISOString() : new Date().toISOString(),
    devHoldPercent: 0, burnPercent: 0, devWallet: coin.creator || null, sniperHoldPercent: 0,
    website:    coin.metadata?.website  || null,
    twitter:    coin.metadata?.twitter  || null,
    telegram:   coin.metadata?.telegram || null,
    bondingCurve: isBonding,
    bondProgress,
    reserveBnb: reserveAst,
    supply:     parseFloat(coin.supply) || 0,
    graduated:  isGraduated,
    listed:     coin.listed || false,
    taxRate:    (parseFloat(coin.tax) || 0) * 100,
    taxEarned:  0,
    beneficiary: coin.beneficiary || null,
    description: coin.metadata?.description || null,
    section,
    dexPaid: false, dexPairCount: 0,
    volume24h: 0, liquidity: 0, priceChange24h: 0,
    buys24h: 0, sells24h: 0, dexUrl: null,
    quoteToken: 'ASTER',
  };
}

// ── Core update ──────────────────────────────────────────────────────────────
export async function update() {
  const now = Date.now();
  if (asterNewTokens.length > 0 && now - lastFetchTime < CACHE_TTL_MS) return;

  try {
    const [data, price] = await Promise.all([
      queryFlap(BOARD_QUERY),
      fetchAsterPrice(),
    ]);

    const board = data?.boardV2;
    if (!board) return;

    const seen = new Set();
    const allCoins = [];
    for (const { data: sectionData, name } of [
      { data: board.newlyCreated, name: 'newlyCreated' },
      { data: board.graduating,   name: 'graduating' },
      { data: board.listed,       name: 'listed' },
    ]) {
      for (const coin of (sectionData?.coins || [])) {
        if (!seen.has(coin.address)) {
          seen.add(coin.address);
          allCoins.push({ coin, name });
        }
      }
    }

    const mapped = allCoins.map(({ coin, name }) => mapCoin(coin, price, name));
    asterNewTokens     = mapped.filter(t => !t.listed);
    asterBondingTokens = mapped.filter(t =>  t.listed);
    lastFetchTime = now;

    console.log(`[ASTER] Fetched ${mapped.length} tokens (new: ${asterNewTokens.length}, bonding: ${asterBondingTokens.length})`);

    if (_wss) {
      const newMsg  = JSON.stringify({ type: 'tokens_update', tokens: asterNewTokens });
      const bondMsg = JSON.stringify({ type: 'tokens_update', tokens: asterBondingTokens });
      _wss.clients.forEach(c => {
        if (c.readyState !== 1 || !c._channel) return;
        if (c._channel === 'new-aster')     c.send(newMsg);
        if (c._channel === 'bonding-aster') c.send(bondMsg);
      });
    }
  } catch (err) {
    console.error('[ASTER] Fetch error:', err.message);
  }
}
