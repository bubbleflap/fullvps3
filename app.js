import 'dotenv/config';
import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import pg from "pg";
import crypto from "crypto";
import os from "os";
import { fileURLToPath } from "url";
import { init as bondingInit, getBondingTokens, startUpdates as bondingStartUpdates, update as bondingUpdate } from './bondingService.js';
import { getListedTokens as getBondingListedTokens, setHistoricalTokens, setDbPool } from './bondingListedService.js';
import { init as asterInit, getAsterNewTokens, getAsterBondingTokens, getAsterUsdPrice, startUpdates as asterStartUpdates } from './asterService.js';
import { init as dexPaidInit, getDexPaidTokens, getDexPaidMap, markDexPaid, startUpdates as dexPaidStartUpdates } from './dexPaidService.js';
import { dirname, join } from "path";
import { createRequire } from "module";
import * as ethers from "ethers";

const app = express();
const PORT = process.env.PORT || 3001;

const onlineUsers = new Map();

const reqStats = { count: 0, errors: 0, window: [], startTime: Date.now() };
function trackReq(req, res, next) {
  reqStats.count++;
  const now = Date.now();
  reqStats.window.push(now);
  if (reqStats.window.length > 5000) reqStats.window = reqStats.window.slice(-2000);
  res.on('finish', () => { if (res.statusCode >= 500) reqStats.errors++; });
  next();
}

let activeOpenRouterKey = null;
async function getOpenRouterKey() {
  try {
    const r = await pool.query("SELECT value FROM lottery_settings WHERE key='openrouter_active_key'");
    if (r.rows.length > 0) {
      const active = r.rows[0].value;
      const kr = await pool.query("SELECT value FROM lottery_settings WHERE key=$1", [`openrouter_key_${active}`]);
      if (kr.rows.length > 0 && kr.rows[0].value) return kr.rows[0].value;
    }
  } catch {}
  return process.env.OPENROUTER_API_KEY || null;
}

const FLAP_GQL = "https://bnb.taxed.fun";
const IPFS_GATEWAY = "https://flap.mypinata.cloud/ipfs/";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

let cachedTokens = [];
let lastFetchTime = 0;
const CACHE_TTL = 10000;

const BANNED_TOKEN_ADDRESSES = new Set([
  "0xfccdea4566640a2935aa4b3905eae61f8dec7777",
]);
const isBannedToken = (t) => BANNED_TOKEN_ADDRESSES.has((t?.address || t?.ca || "").toLowerCase());

const moralisLogoCache = new Map();
const moralisLogoCheckedAt = new Map();
const MORALIS_LOGO_NEGATIVE_TTL = 30 * 60 * 1000;

// ── GoPlus Security API ────────────────────────────────────────────────────────
let goplusToken = null;
let goplusTokenExpiry = 0;

async function getGoPlusToken() {
  if (goplusToken && Date.now() < goplusTokenExpiry - 60000) return goplusToken;
  const appId = process.env.GOPLUS_APP_ID;
  const appSecret = process.env.GOPLUS_APP_SECRET;
  if (!appId || !appSecret) return null;
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = crypto.createHmac('sha256', appSecret).update(appId + timestamp).digest('hex');
    const res = await fetch('https://api.gopluslabs.io/api/v1/token/get_access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, sign, time: timestamp }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 1 || !data.result?.access_token) return null;
    goplusToken = data.result.access_token;
    goplusTokenExpiry = Date.now() + (data.result.expires_in || 3600) * 1000;
    console.log('[GOPLUS] Access token refreshed');
    return goplusToken;
  } catch (e) {
    console.error('[GOPLUS] Token fetch error:', e.message);
    return null;
  }
}

// Cache: address -> { honeypot, sellTax, buyTax, hasBlacklist, isMintable, hiddenOwner, canNotSell, isOpenSource, checkedAt }
const goplusCache = new Map();
const GOPLUS_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

async function batchCheckGoPlus(addresses) {
  const now = Date.now();
  const unchecked = addresses.filter(a => {
    const cached = goplusCache.get(a.toLowerCase());
    return !cached || (now - cached.checkedAt) > GOPLUS_CACHE_TTL;
  });
  if (!unchecked.length) return;
  const token = await getGoPlusToken();
  const BATCH = 50;
  for (let i = 0; i < unchecked.length; i += BATCH) {
    const chunk = unchecked.slice(i, i + BATCH);
    try {
      const addrs = chunk.join(',');
      const headers = token ? { Authorization: token } : {};
      const res = await fetch(
        `https://api.gopluslabs.io/api/v1/token_security/56?contract_addresses=${addrs}`,
        { headers }
      );
      if (!res.ok) { console.warn('[GOPLUS] API error', res.status); continue; }
      const data = await res.json();
      if (data.code !== 1 || !data.result) continue;
      for (const addr of chunk) {
        const info = data.result[addr.toLowerCase()] || data.result[addr] || {};
        goplusCache.set(addr.toLowerCase(), {
          honeypot:     info.is_honeypot === '1',
          canNotSell:   info.can_not_sell_all === '1',
          sellTax:      parseFloat(info.sell_tax || 0) * 100,
          buyTax:       parseFloat(info.buy_tax  || 0) * 100,
          hasBlacklist: info.has_blacklist === '1',
          isMintable:   info.is_mintable === '1',
          hiddenOwner:  info.hidden_owner === '1',
          isOpenSource: info.is_open_source === '1',
          checkedAt:    now,
        });
      }
    } catch (e) {
      console.error('[GOPLUS] Batch check error:', e.message);
    }
    if (i + BATCH < unchecked.length) await new Promise(r => setTimeout(r, 400));
  }
}

function goplusRiskLevel(info) {
  if (!info) return null;
  if (info.honeypot || info.canNotSell) return 'danger';
  if (info.sellTax >= 50 || info.buyTax >= 50) return 'danger';
  if (info.sellTax > 10 || info.buyTax > 10 || info.hasBlacklist || info.hiddenOwner) return 'warning';
  if (info.isMintable || !info.isOpenSource) return 'caution';
  return 'safe';
}

async function batchCheckMoralisLogos(addresses) {
  const now = Date.now();
  const toCheck = addresses.filter(a => {
    const key = a.toLowerCase();
    if (moralisLogoCache.get(key) === true) return false;
    const checkedAt = moralisLogoCheckedAt.get(key) || 0;
    return now - checkedAt >= MORALIS_LOGO_NEGATIVE_TTL;
  });
  if (!toCheck.length) return;
  const MORALIS_KEY = process.env.MORALIS_API_KEY;
  if (!MORALIS_KEY) return;
  const BATCH = 25;
  for (let i = 0; i < toCheck.length; i += BATCH) {
    const chunk = toCheck.slice(i, i + BATCH);
    try {
      const params = chunk.map((a, idx) => `addresses[${idx}]=${encodeURIComponent(a)}`).join('&');
      const res = await fetch(`https://deep-index.moralis.io/api/v2.2/erc20/metadata?chain=0x38&${params}`, {
        headers: { 'X-API-Key': MORALIS_KEY, 'Accept': 'application/json' }
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const item of data) {
        const addr = (item.address || '').toLowerCase();
        const hasLogo = !!item.logo;
        moralisLogoCache.set(addr, hasLogo);
        moralisLogoCheckedAt.set(addr, now);
        if (hasLogo) console.log(`[Ave] Logo detected for ${addr}`);
      }
      chunk.forEach(a => {
        const key = a.toLowerCase();
        if (!moralisLogoCheckedAt.has(key)) moralisLogoCheckedAt.set(key, now);
        if (!moralisLogoCache.has(key)) moralisLogoCache.set(key, false);
      });
    } catch {}
    if (i + BATCH < toCheck.length) await new Promise(r => setTimeout(r, 300));
  }
}

let cachedNewTokens = [];
let cachedBondingTokens = [];

let cachedAsterNewTokens = [];
let cachedAsterBondingTokens = [];
let lastAsterFetchTime = 0;
let cachedAsterUsdPrice = 0;
let lastAsterPriceFetch = 0;
let kolsCache = { data: [], ts: 0 };
const ASTER_QUOTE_CA = "0x000ae314e2a2172a039b26378814c252734f556a";

let partnerCAsSet = new Set(['0x69395fceca0d6b6529216df1fec8f3e7f25f7777']);

// Persistent accumulator: address -> token object for ALL graduated tokens ever seen
// across any boardV2 section. Survives individual API polling gaps.
const graduatedCache = new Map();

const knownNewlyCreated = new Set();
const newlyDetectedTimestamps = new Map();
let isFirstFetch = true;

// Tracks tokens seen in the "graduating" section so we can later check if they
// disappeared because they graduated (as opposed to just falling out of the list).
// address -> { coin raw data, firstSeenAt ms }
const graduationWatchList = new Map();

// address -> raw coin data (last seen)
const allKnownFlapAddresses = new Map();

// Top latest migrated/graduated tokens from flap.sh requested by user
const PRESET_GRADUATED_ADDRESSES = [
  "0x1aa9d1df9ec8d5d205f0595612a6ecf0cf017777",
  "0xaf9ba87793a9b4ece4d614ddaf60df44078d7777",
  "0x7a1bc7160f2134b54b4f03f3b2f04ef8bf617777",
  "0x8f69015a1583974b3420c08b00261f84a3297777",
  "0x8eed3c7a021ee25f3283f7711ff5e30e9af97777",
  "0x4b55a41115c47d9daa86e0d9e3c5ff1c937c7777",
  "0x725ec49796610e7b6c3c1d419fa6312191b58888",
  "0xd90e052ad8ebaa4511ec68f975a948633de48888",
  "0x2645cb6bd8cc20374922408d5047cfaf1fef7777",
  "0x6b8a8f75b2086d0902e80e7794685b17ea987777",
  "0xdf2944b0fa30ff85a33d5e3f4fcce0682a8a7777"
].map(a => a.toLowerCase());

const BLACKLISTED_TOKENS = new Set([
  "0xdeae440b6d0c42215279f3b5c230847520457777",
  "0xb1d53c6a031443b08e0321c097e9541f6f437777",
  "0x1f13de9354f206ae300712570ed2975315a87777",
]);

const IMPERSONATION_TICKERS = new Set([
  "usdt", "usdc", "tusd", "busd", "dai", "wbnb", "weth", "btcb", "wbtc", "tbtc", "eth", "bnb", "sol",
  "xrp", "ada", "doge", "shib", "matic", "dot", "avax", "link", "uni", "ltc",
  "trx", "atom", "near", "ftm", "algo", "icp", "egld", "apt", "arb", "op",
  "trump", "maga", "grok", "pepe", "floki", "snek", "wojak", "bonk",
]);
const IMPERSONATION_NAMES = new Set([
  "tether", "tether usd", "true usd", "usd coin", "binance usd", "dai stablecoin",
  "wrapped bnb", "wrapped eth", "wrapped bitcoin", "bitcoin bep2",
  "ethereum", "bitcoin", "bnb", "binance coin", "solana",
  "ripple", "xrp", "cardano", "dogecoin", "shiba inu", "polygon", "polkadot",
  "avalanche", "chainlink", "uniswap", "litecoin", "tron", "cosmos", "near protocol",
  "fantom", "algorand", "arbitrum", "optimism", "aptos",
  "donald trump", "trump coin", "maga coin", "elon musk", "grok ai",
  "pepe coin", "floki inu", "baby doge", "wojak coin", "bonk",
]);

const UNICODE_MAP_APP = {
  '\u0391':'A','\u0410':'A','\u0392':'B','\u0412':'B','\u0421':'C','\u0395':'E','\u0415':'E','\u0397':'H',
  '\u0399':'I','\u0406':'I','\u039a':'K','\u041a':'K','\u039c':'M','\u041c':'M','\u039d':'N','\u039f':'O','\u041e':'O',
  '\u03a1':'P','\u0420':'P','\u03a4':'T','\u0422':'T','\u03a5':'Y','\u03a7':'X','\u0425':'X',
  '\u03b1':'a','\u0430':'a','\u03b2':'b','\u03b5':'e','\u0435':'e','\u03b7':'n','\u03b9':'i','\u03ba':'k',
  '\u03bc':'m','\u03bd':'v','\u03bf':'o','\u043e':'o','\u03c1':'p','\u0440':'p','\u03c3':'s','\u0441':'c',
  '\u03c4':'t','\u03c5':'y','\u03c7':'x','\u0445':'x',
  '\u212e':'e','\u216e':'D','\u216f':'M',
  '\uff21':'A','\uff22':'B','\uff23':'C','\uff24':'D','\uff25':'E','\uff26':'F','\uff27':'G','\uff28':'H',
  '\uff29':'I','\uff2a':'J','\uff2b':'K','\uff2c':'L','\uff2d':'M','\uff2e':'N','\uff2f':'O','\uff30':'P',
  '\uff31':'Q','\uff32':'R','\uff33':'S','\uff34':'T','\uff35':'U','\uff36':'V','\uff37':'W','\uff38':'X',
  '\uff39':'Y','\uff3a':'Z',
};
function normalizeForFilter(s) {
  if (!s) return '';
  const nfkc = s.normalize('NFKC');
  const mapped = [...nfkc].map(c => UNICODE_MAP_APP[c] || c).join('');
  return mapped.replace(/[^\x00-\x7F]/g, '').toLowerCase().trim();
}

const PRESET_TAX_RATES = {
  "0x1aa9d1df9ec8d5d205f0595612a6ecf0cf017777": 3,
  "0xaf9ba87793a9b4ece4d614ddaf60df44078d7777": 3,
  "0x7a1bc7160f2134b54b4f03f3b2f04ef8bf617777": 3,
  "0x8f69015a1583974b3420c08b00261f84a3297777": 1,
  "0x8eed3c7a021ee25f3283f7711ff5e30e9af97777": 3,
  "0x4b55a41115c47d9daa86e0d9e3c5ff1c937c7777": 3,
  "0x2645cb6bd8cc20374922408d5047cfaf1fef7777": 3,
  "0x6b8a8f75b2086d0902e80e7794685b17ea987777": 3,
  "0xdf2944b0fa30ff85a33d5e3f4fcce0682a8a7777": 3,
};

const PINATA_IMAGES = {
  "0x1aa9d1df9ec8d5d205f0595612a6ecf0cf017777": "https://flap.mypinata.cloud/ipfs/bafybeia7yjvqkbiwsx2opugjsaqf6xon4mn5vzrvoj2dbuynoemhnskep4?img-width=512&img-height=512&img-fit=cover",
  "0xaf9ba87793a9b4ece4d614ddaf60df44078d7777": "https://flap.mypinata.cloud/ipfs/bafkreie7tblbbr32bnygxpnqbpigs362bayn4tbdenmhrcokx5cuy6dmpm?img-width=512&img-height=512&img-fit=cover",
  "0x7a1bc7160f2134b54b4f03f3b2f04ef8bf617777": "https://flap.mypinata.cloud/ipfs/bafybeibohiudegkto3tx3oasik4xet4squztdljeabwuo5krssip2cng54?img-width=512&img-height=512&img-fit=cover",
  "0x8f69015a1583974b3420c08b00261f84a3297777": "https://flap.mypinata.cloud/ipfs/bafkreifeh6wluohty32gggsuxayg3or6v6snwaq3oiiocyqgpn647c3tkq?img-width=512&img-height=512&img-fit=cover",
  "0x8eed3c7a021ee25f3283f7711ff5e30e9af97777": "https://flap.mypinata.cloud/ipfs/bafkreido36rvs2x3kwuqqbettinohqst5ka663bwfoidxmbtod25ql4gru?img-width=512&img-height=512&img-fit=cover",
  "0x4b55a41115c47d9daa86e0d9e3c5ff1c937c7777": "https://flap.mypinata.cloud/ipfs/bafybeibp3piv6hkc4m6vhrq2tbackiybojhjalhmsfp45z4v7cqd3avocm?img-width=512&img-height=512&img-fit=cover",
  "0x725ec49796610e7b6c3c1d419fa6312191b58888": "https://flap.mypinata.cloud/ipfs/bafkreidgqf2okucarlpouoy4x4ymbl2sfp75apui67cttycsghof6s63zu?img-width=512&img-height=512&img-fit=cover",
  "0xd90e052ad8ebaa4511ec68f975a948633de48888": "https://flap.mypinata.cloud/ipfs/bafkreidgqf2okucarlpouoy4x4ymbl2sfp75apui67cttycsghof6s63zu?img-width=512&img-height=512&img-fit=cover",
  "0x2645cb6bd8cc20374922408d5047cfaf1fef7777": "https://flap.mypinata.cloud/ipfs/bafybeidzsknulq2jeiys5epiee3do6u236t4rrz4x2deve45t2quc7b7li?img-width=512&img-height=512&img-fit=cover",
  "0x6b8a8f75b2086d0902e80e7794685b17ea987777": "https://flap.mypinata.cloud/ipfs/bafybeiddismfecyivkh4jbz7fwcpfvy7fdkdo4jcz6yo2uxoirv4ah2xci?img-width=512&img-height=512&img-fit=cover",
  "0xdf2944b0fa30ff85a33d5e3f4fcce0682a8a7777": "https://flap.mypinata.cloud/ipfs/bafybeidzsknulq2jeiys5epiee3do6u236t4rrz4x2deve45t2quc7b7li?img-width=512&img-height=512&img-fit=cover",
}; 

let bnbPrice = 600;
let bflapPrice = 0;
let lastPriceFetch = 0;
let lastBflapFetch = 0;

// BSC on-chain graduation detection via Flap.sh Portal LaunchedToDEX events
const BSC_RPC = 'https://bsc.publicnode.com';
// Flap.sh Portal contract on BNB Chain (emits LaunchedToDEX on every graduation)
const FLAP_PORTAL = '0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0';
// keccak256("LaunchedToDEX(address,address,uint256,uint256)") — verified from live events
const LAUNCHED_TO_DEX_TOPIC = '0x71a10912a55f73d3cced0d1515c2b33c396c80342522bad0e295ccbede556f37';
const BSC_BLOCKS_PER_DAY = 28800; // ~3 sec/block
let lastCheckedBlock = 0; // 0 = not initialized yet

// Flap.sh uses a factory pattern where all token addresses end in 7777 or 8888
const isFlapAddress = addr => addr.endsWith('7777') || addr.endsWith('8888');

const dexCache = new Map();
const DEX_CACHE_TTL = 120000;
const dexPaidDetectedAtMap = new Map();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
setDbPool(pool);

// ── Withdraw security ─────────────────────────────────────────────────────────
const withdrawNonces = new Map(); // nonce -> { wallet, currency, message, expiresAt }
const withdrawLocks  = new Set(); // "wallet:currency" keys currently processing
const withdrawTokens = new Map(); // token -> { wallet, expiresAt }  — one-time session proof
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of withdrawNonces) if (v.expiresAt < now) withdrawNonces.delete(k);
  for (const [k, v] of withdrawTokens) if (v.expiresAt < now) withdrawTokens.delete(k);
}, 5 * 60 * 1000);

async function initDb() {
  const runSafe = async (label, fn) => {
    try { await fn(); } catch (e) {
      if (e.message && e.message.includes('must be owner')) return;
      console.error(`DB init (${label}):`, e.message);
    }
  };
  await runSafe('site_settings', () => pool.query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `));
  await runSafe('seed settings', () => pool.query(`
    INSERT INTO site_settings (key, value) VALUES 
      ('ca_address', '0xa2320fff1069ED5b4B02dDb386823E837A7e7777'),
      ('telegram', 'https://t.me/BubbleFlap'),
      ('twitter', 'https://x.com/BubbleFlapFun'),
      ('github', 'https://github.com/bubbleflap'),
      ('email', 'dev@bubbleflap.fun'),
      ('bflap_link', 'https://flap.sh/bnb/0xa2320fff1069ED5b4B02dDb386823E837A7e7777'),
      ('flapsh_link', 'https://flap.sh/bnb/board')
    ON CONFLICT (key) DO NOTHING
  `));
  await runSafe('fix ca_address', () => pool.query(`
    UPDATE site_settings SET value = '0xa2320fff1069ED5b4B02dDb386823E837A7e7777', updated_at = NOW()
    WHERE key = 'ca_address' AND (value = '0x0000000000000000000000000000000000000000' OR value = '0x000000000000000000000000' OR length(value) < 42)
  `));
  await runSafe('drop graduated_tokens', () => pool.query(`DROP TABLE IF EXISTS graduated_tokens`));
  await runSafe('purge cached_new_tokens scam', () => pool.query(`
    DELETE FROM cached_new_tokens
    WHERE REGEXP_REPLACE(LOWER(data->>'ticker'), '^\\$', '') IN ('usdt','usdc','busd','dai','wbnb','weth','btcb','eth','bnb')
       OR LOWER(TRIM(data->>'name')) IN ('tether','tether usd','usd coin','binance usd','dai stablecoin','wrapped bnb','wrapped eth','wrapped bitcoin','bitcoin bep2','ethereum','bitcoin','binance coin')
  `));
  await runSafe('site_visitors', () => pool.query(`
    CREATE TABLE IF NOT EXISTS site_visitors (
      id SERIAL PRIMARY KEY,
      visitor_id VARCHAR(100) NOT NULL,
      ip_hash VARCHAR(100) NOT NULL,
      page VARCHAR(200) NOT NULL DEFAULT '/',
      user_agent TEXT,
      referrer TEXT,
      country VARCHAR(10) DEFAULT NULL,
      last_seen TIMESTAMP NOT NULL DEFAULT now(),
      created_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `));
  await runSafe('idx visitor_id', () => pool.query(`CREATE INDEX IF NOT EXISTS idx_site_visitors_visitor_id ON site_visitors (visitor_id)`));
  await runSafe('idx ip_hash', () => pool.query(`CREATE INDEX IF NOT EXISTS idx_site_visitors_ip_hash ON site_visitors (ip_hash)`));
  await runSafe('idx last_seen', () => pool.query(`CREATE INDEX IF NOT EXISTS idx_site_visitors_last_seen ON site_visitors (last_seen)`));
  await runSafe('idx created_at', () => pool.query(`CREATE INDEX IF NOT EXISTS idx_site_visitors_created_at ON site_visitors (created_at)`));
  await runSafe('idx country', () => pool.query(`CREATE INDEX IF NOT EXISTS idx_site_visitors_country ON site_visitors (country)`));
  await runSafe('dex_paid_detected', () => pool.query(`
    CREATE TABLE IF NOT EXISTS dex_paid_detected (
      address VARCHAR(42) PRIMARY KEY,
      detected_at BIGINT NOT NULL
    )
  `));
  await runSafe('recent_graduations', () => pool.query(`
    CREATE TABLE IF NOT EXISTS recent_graduations (
      address VARCHAR(44) PRIMARY KEY,
      data JSONB NOT NULL,
      detected_at TIMESTAMP DEFAULT NOW()
    )
  `));
  await runSafe('volume_bot_campaigns', () => pool.query(`
    CREATE TABLE IF NOT EXISTS volume_bot_campaigns (
      id SERIAL PRIMARY KEY,
      status VARCHAR(20) DEFAULT 'running',
      settings_json TEXT,
      target_volume NUMERIC DEFAULT 0,
      volume_generated NUMERIC DEFAULT 0,
      tx_count INTEGER DEFAULT 0,
      bnb_spent NUMERIC DEFAULT 0,
      sub_wallet_keys TEXT,
      error TEXT,
      started_at TIMESTAMP DEFAULT now(),
      ended_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT now()
    )
  `));
  await runSafe('volume_bot_wallets', () => pool.query(`
    CREATE TABLE IF NOT EXISTS volume_bot_wallets (
      id SERIAL PRIMARY KEY,
      type VARCHAR(20) NOT NULL,
      address VARCHAR(42) NOT NULL,
      private_key VARCHAR(66) NOT NULL,
      campaign_id INTEGER,
      created_at TIMESTAMP DEFAULT now()
    )
  `));
  await runSafe('volume_bot_campaigns.userbot_address', () => pool.query(`
    ALTER TABLE volume_bot_campaigns ADD COLUMN IF NOT EXISTS userbot_address VARCHAR(42)
  `));
  await runSafe('volume_bot_campaigns.userbot_private_key', () => pool.query(`
    ALTER TABLE volume_bot_campaigns ADD COLUMN IF NOT EXISTS userbot_private_key VARCHAR(66)
  `));
  await runSafe('lottery_spins', () => pool.query(`
    CREATE TABLE IF NOT EXISTS lottery_spins (
      id SERIAL PRIMARY KEY,
      ip_hash VARCHAR(64) NOT NULL,
      segment_id VARCHAR(50) NOT NULL,
      title VARCHAR(100) NOT NULL,
      prize DECIMAL(12,4) NOT NULL DEFAULT 0,
      display TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `));
  await runSafe('idx_lottery_spins', () => pool.query(`
    CREATE INDEX IF NOT EXISTS idx_lottery_spins_ip_hash ON lottery_spins(ip_hash);
  `));
  await runSafe('lottery_wallets', () => pool.query(`
    CREATE TABLE IF NOT EXISTS lottery_wallets (
      ip_hash VARCHAR(64) PRIMARY KEY,
      purchased_spins INTEGER NOT NULL DEFAULT 0,
      total_won DECIMAL(12,4) NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `));
  await runSafe('lottery_wallets_bflap', () => pool.query(`
    ALTER TABLE lottery_wallets ADD COLUMN IF NOT EXISTS total_bflap_won BIGINT NOT NULL DEFAULT 0
  `));
  await runSafe('lottery_wallets_bnb', () => pool.query(`
    ALTER TABLE lottery_wallets ADD COLUMN IF NOT EXISTS total_bnb_won DECIMAL(12,8) NOT NULL DEFAULT 0
  `));
  await runSafe('lottery_wallets_wallet', () => pool.query(`
    ALTER TABLE lottery_wallets ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(42) UNIQUE NULL
  `));
  await runSafe('idx_lottery_wallets_wallet', () => pool.query(`
    CREATE INDEX IF NOT EXISTS idx_lottery_wallets_wallet ON lottery_wallets(wallet_address)
  `));
  await runSafe('lottery_spins_wallet', () => pool.query(`
    ALTER TABLE lottery_spins ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(42) NULL
  `));
  await runSafe('idx_lottery_spins_wallet', () => pool.query(`
    CREATE INDEX IF NOT EXISTS idx_lottery_spins_wallet ON lottery_spins(wallet_address)
  `));
  await runSafe('lottery_spins_tier', () => pool.query(`
    ALTER TABLE lottery_spins ADD COLUMN IF NOT EXISTS tier VARCHAR(3) NOT NULL DEFAULT '099'
  `));
  await runSafe('lottery_spins_is_win', () => pool.query(`
    ALTER TABLE lottery_spins ADD COLUMN IF NOT EXISTS is_win BOOLEAN NOT NULL DEFAULT TRUE
  `));
  await runSafe('lottery_wallets_049', () => pool.query(`
    ALTER TABLE lottery_wallets ADD COLUMN IF NOT EXISTS purchased_spins_049 INTEGER NOT NULL DEFAULT 0
  `));
  await runSafe('lottery_wallets_150', () => pool.query(`
    ALTER TABLE lottery_wallets ADD COLUMN IF NOT EXISTS purchased_spins_150 INTEGER NOT NULL DEFAULT 0
  `));
  await runSafe('lottery_purchases', () => pool.query(`
    CREATE TABLE IF NOT EXISTS lottery_purchases (
      id SERIAL PRIMARY KEY,
      ip_hash VARCHAR(64) NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      price_bnb DECIMAL(12,6) NOT NULL DEFAULT 0.01,
      total_bnb DECIMAL(12,6) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `));
  await runSafe('idx_lottery_purchases', () => pool.query(`
    CREATE INDEX IF NOT EXISTS idx_lottery_purchases_ip_hash ON lottery_purchases(ip_hash)
  `));
  await runSafe('lottery_purchases_wallet', () => pool.query(`
    ALTER TABLE lottery_purchases ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(42) NULL
  `));
  await runSafe('idx_lottery_purchases_wallet', () => pool.query(`
    CREATE INDEX IF NOT EXISTS idx_lottery_purchases_wallet ON lottery_purchases(wallet_address)
  `));
  await runSafe('lottery_wallets_withdrawn_usdt', () => pool.query(`
    ALTER TABLE lottery_wallets ADD COLUMN IF NOT EXISTS withdrawn_usdt DECIMAL(12,4) NOT NULL DEFAULT 0
  `));
  await runSafe('lottery_wallets_withdrawn_bflap', () => pool.query(`
    ALTER TABLE lottery_wallets ADD COLUMN IF NOT EXISTS withdrawn_bflap BIGINT NOT NULL DEFAULT 0
  `));
  await runSafe('lottery_wallets_withdrawn_bnb', () => pool.query(`
    ALTER TABLE lottery_wallets ADD COLUMN IF NOT EXISTS withdrawn_bnb DECIMAL(12,8) NOT NULL DEFAULT 0
  `));
  await runSafe('lottery_wallets_last_withdraw_bnb', () => pool.query(`
    ALTER TABLE lottery_wallets ADD COLUMN IF NOT EXISTS last_withdraw_bnb TIMESTAMPTZ NULL
  `));
  await runSafe('lottery_wallets_last_withdraw_bflap', () => pool.query(`
    ALTER TABLE lottery_wallets ADD COLUMN IF NOT EXISTS last_withdraw_bflap TIMESTAMPTZ NULL
  `));
  await runSafe('lottery_wallets_last_withdraw_usdt', () => pool.query(`
    ALTER TABLE lottery_wallets ADD COLUMN IF NOT EXISTS last_withdraw_usdt TIMESTAMPTZ NULL
  `));
  await runSafe('lottery_bans', () => pool.query(`
    CREATE TABLE IF NOT EXISTS lottery_bans (
      wallet_address VARCHAR(42) PRIMARY KEY,
      wd_banned BOOLEAN NOT NULL DEFAULT FALSE,
      deposit_banned BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `));
  await runSafe('kols', () => pool.query(`
    CREATE TABLE IF NOT EXISTS kols (
      id SERIAL PRIMARY KEY,
      rank INTEGER,
      name VARCHAR(100),
      handle VARCHAR(100),
      avatar VARCHAR(500) DEFAULT '',
      followers INTEGER DEFAULT 0,
      hit_rate NUMERIC(5,2) DEFAULT 0,
      avg_roi NUMERIC(8,2) DEFAULT 0,
      peak_roi NUMERIC(8,2) DEFAULT 0,
      low_roi NUMERIC(8,2) DEFAULT 0,
      mentions INTEGER DEFAULT 0,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      top_token_name VARCHAR(100) DEFAULT '',
      top_token_ticker VARCHAR(20) DEFAULT '',
      top_token_image VARCHAR(500) DEFAULT '',
      top_token_roi NUMERIC(8,2) DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `));
  await runSafe('kols_seed', async () => {
    const { rows } = await pool.query("SELECT COUNT(*) FROM kols");
    if (parseInt(rows[0].count) === 0) {
      await pool.query(`INSERT INTO kols (rank,name,handle,followers,hit_rate,avg_roi,peak_roi,low_roi,mentions,wins,losses,top_token_name,top_token_ticker,top_token_roi) VALUES
        (1,'CryptoWizardd','CryptoWizardd',89400,82.3,312.5,850.0,-12.5,42,33,7,'PepeCoin','PEPE',850.0),
        (2,'AltcoinGuru','AltcoinGuru_X',215000,78.6,267.3,620.0,-8.3,38,31,8,'Floki','FLOKI',620.0),
        (3,'DexSniffer','DexSniffer99',52300,74.1,198.7,480.0,-15.2,31,26,9,'BabyDoge','BABYDOGE',480.0),
        (4,'CryptoPumpMaster','cryptoshillz06',42400,66.7,23.3,45.4,-3.9,3,2,1,'AIXBT by Virtuals','AIXBT',45.4),
        (5,'BNBKingReal','BNBKingreal',76800,63.8,156.4,380.0,-22.1,28,21,12,'CAKE','CAKE',380.0),
        (6,'GemHunterBNB','GemHunterBNB',38500,61.2,134.8,290.0,-18.6,22,19,12,'PinkSale','PINKSALE',290.0),
        (7,'MoonSignalsCrypto','MoonSignals',29700,57.9,87.6,195.0,-31.4,19,16,11,'MoonToken','MOON',195.0),
        (8,'ChartMaster0x','ChartMaster0x',24100,54.6,64.2,142.0,-28.7,15,13,11,'ChartEx','CHART',142.0),
        (9,'WhaleAlert99','WhaleAlert99',18600,51.3,45.8,98.0,-42.3,12,10,9,'BNBPad','BPAD',98.0),
        (10,'CryptoAlphaX','CryptoAlpha99',12400,48.7,28.4,72.0,-55.6,9,8,8,'AlphaToken','ALPHA',72.0)
      `);
    }
  });
  await runSafe('jackpot_counter', () => pool.query(`
    CREATE TABLE IF NOT EXISTS jackpot_counter (
      id INTEGER PRIMARY KEY DEFAULT 1,
      total_spins BIGINT NOT NULL DEFAULT 0
    )
  `));
  await runSafe('jackpot_counter_purchases', () => pool.query(`
    ALTER TABLE jackpot_counter
      ADD COLUMN IF NOT EXISTS total_purchases_049 BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_purchases_099 BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_purchases_150 BIGINT NOT NULL DEFAULT 0
  `));
  await runSafe('jackpot_pool', () => pool.query(`
    CREATE TABLE IF NOT EXISTS jackpot_pool (
      id SERIAL PRIMARY KEY,
      global_spin_number BIGINT NOT NULL,
      wallet_address VARCHAR(42) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `));
  await runSafe('jackpot_purchase_pool', () => pool.query(`
    CREATE TABLE IF NOT EXISTS jackpot_purchase_pool (
      id SERIAL PRIMARY KEY,
      tier VARCHAR(3) NOT NULL DEFAULT '099',
      tier_purchase_number BIGINT NOT NULL,
      wallet_address VARCHAR(42) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `));
  await runSafe('jackpot_winners', () => pool.query(`
    CREATE TABLE IF NOT EXISTS jackpot_winners (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(42) NOT NULL,
      pool_spin_number BIGINT NOT NULL,
      bnb_amount DECIMAL(12,8) NOT NULL DEFAULT 0.1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `));
  await runSafe('lottery_settings', () => pool.query(`
    CREATE TABLE IF NOT EXISTS lottery_settings (
      key VARCHAR(64) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `));
  await runSafe('lottery_settings_rtp_seed', () => pool.query(`
    INSERT INTO lottery_settings (key, value) VALUES ('rtp', '100') ON CONFLICT (key) DO NOTHING
  `));
  await runSafe('partner_tokens', () => pool.query(`
    CREATE TABLE IF NOT EXISTS partner_tokens (
      address VARCHAR(42) PRIMARY KEY,
      name VARCHAR(100) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `));
  await runSafe('partner_tokens_seed', () => pool.query(`
    INSERT INTO partner_tokens (address, name)
    VALUES ('0x69395fceca0d6b6529216df1fec8f3e7f25f7777', 'FlapVault')
    ON CONFLICT (address) DO NOTHING
  `));
}

async function loadPartnerTokens() {
  try {
    const r = await pool.query('SELECT address, name FROM partner_tokens ORDER BY created_at ASC');
    const addrs = r.rows.map(row => row.address.toLowerCase());
    partnerCAsSet = new Set(addrs.length > 0 ? addrs : ['0x69395fceca0d6b6529216df1fec8f3e7f25f7777']);
    console.log(`[PARTNER] Loaded ${partnerCAsSet.size} partner(s): ${[...partnerCAsSet].join(', ')}`);
  } catch (e) {
    console.error('[PARTNER] loadPartnerTokens error:', e.message);
  }
}

function markPartnerTokens(tokens) {
  for (const t of tokens) {
    if (partnerCAsSet.has((t.address || t.ca || '').toLowerCase())) {
      t.isPartner = true;
    }
  }
}

async function loadGraduatedCache() {
  console.log('[GRADUATED] In-memory only (no DB table)');
}

async function saveGraduatedCache() {
}

async function loadDexPaidDetectedMap() {
  try {
    const res = await pool.query("SELECT address, detected_at FROM dex_paid_detected");
    for (const row of res.rows) {
      dexPaidDetectedAtMap.set(row.address.toLowerCase(), Number(row.detected_at));
    }
    console.log(`[DexPaid] Loaded ${res.rows.length} dexPaid timestamps from DB`);
  } catch (e) {
    console.error("loadDexPaidDetectedMap:", e.message);
  }
}

async function saveDexPaidDetected(address, detectedAt) {
  try {
    await pool.query(
      "INSERT INTO dex_paid_detected (address, detected_at) VALUES ($1, $2) ON CONFLICT (address) DO NOTHING",
      [address.toLowerCase(), detectedAt]
    );
  } catch (e) {
    console.error("saveDexPaidDetected:", e.message);
  }
}

// loadRecentGraduations: removed.
// Bonding section is fully live — sourced from Flap.sh listed board +
// DexScreener batch/text-search on every cycle. No DB seed, no old data.
async function loadRecentGraduations() {}

initDb().then(async () => {
  await loadDexPaidDetectedMap();
  await loadGraduatedCache();
  await loadRecentGraduations();
  await loadLotteryRTP();
  await loadPartnerTokens();
});

function hashIp(ip) {
  return crypto.createHash("sha256").update(ip + "bubbleflap-salt").digest("hex").substring(0, 16);
}

async function getCountryFromIp(ip) {
  try {
    if (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) return null;
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`);
    if (res.ok) {
      const data = await res.json();
      return data.countryCode || null;
    }
  } catch {}
  return null;
}

async function fetchBnbPrice() {
  const now = Date.now();
  if (now - lastPriceFetch < 60000) return bnbPrice;
  try {
    const res = await fetch("https://api.binance.com/api/v3/avgPrice?symbol=BNBUSDT");
    if (res.ok) {
      const data = await res.json();
      bnbPrice = parseFloat(data.price) || 600;
      lastPriceFetch = now;
    }
  } catch (err) {
    console.error("BNB price fetch error:", err.message);
  }
  return bnbPrice;
}

async function fetchBflapPrice() {
  const now = Date.now();
  if (now - lastBflapFetch < 60000) return bflapPrice;
  try {
    const res = await fetch("https://api.dexscreener.com/latest/dex/tokens/0xa2320fff1069ED5b4B02dDb386823E837A7e7777");
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data?.pairs?.[0]?.priceUsd || 0);
      if (price > 0) { bflapPrice = price; lastBflapFetch = now; }
    }
  } catch (err) {
    console.error("BFLAP price fetch error:", err.message);
  }
  return bflapPrice;
}

function resolveImage(img) {
  if (!img) return null;
  if (img.startsWith("http")) return img;
  if (img.startsWith("/")) return img;
  return IPFS_GATEWAY + img + "?img-width=512&img-height=512&img-fit=cover";
}

const COIN_FIELDS = `
  name address symbol listed createdAt
  r(round: 3) h(round: 3) k(round: 3)
  dexThreshSupply
  marketcap(round: 18) reserve(round: 18) supply(round: 18)
  quoteToken
  tax(round: 4)
  beneficiary
  creator
  nHolders
  author { name pfp }
  holders { holder amount }
  metadata { description image website twitter telegram }
`;

const BOARD_QUERY = `{
  boardV2 {
    verified(limit: 50) { coins { ${COIN_FIELDS} } }
    newlyCreated(limit: 80) { coins { ${COIN_FIELDS} } }
    graduating(limit: 50) { coins { ${COIN_FIELDS} } }
    listed(limit: 50) { coins { ${COIN_FIELDS} } }
  }
}`;

const RECENT_BONDING_QUERY = `{
  boardV2 {
    verified(limit: 80) { coins { ${COIN_FIELDS} } }
    newlyCreated(limit: 80) { coins { ${COIN_FIELDS} } }
    graduating(limit: 80) { coins { ${COIN_FIELDS} } }
    listed(limit: 200) { coins { ${COIN_FIELDS} } }
  }
}`;

const BOARD_QUERY_ASTER = `{
  boardV2 {
    newlyCreated(limit: 80, quoteToken: "${ASTER_QUOTE_CA}") { coins { ${COIN_FIELDS} } }
    graduating(limit: 50, quoteToken: "${ASTER_QUOTE_CA}") { coins { ${COIN_FIELDS} } }
    listed(limit: 50, quoteToken: "${ASTER_QUOTE_CA}") { coins { ${COIN_FIELDS} } }
  }
}`;

async function fetchAsterUsdPrice() {
  const now = Date.now();
  if (cachedAsterUsdPrice > 0 && now - lastAsterPriceFetch < 60000) return cachedAsterUsdPrice;
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ASTER_QUOTE_CA}`, {
      headers: { "User-Agent": BROWSER_UA },
    });
    const d = await res.json();
    const pairs = (d.pairs || []).filter(p => p.chainId === "bsc");
    const best = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    if (best?.priceUsd) {
      cachedAsterUsdPrice = parseFloat(best.priceUsd) || 0;
      lastAsterPriceFetch = now;
      console.log(`[ASTER] Price: $${cachedAsterUsdPrice.toFixed(6)}`);
    }
  } catch (err) {
    console.error("[ASTER] Price fetch error:", err.message);
  }
  return cachedAsterUsdPrice;
}

function mapAsterCoin(coin, asterUsdPrice, section) {
  const mcapAster = parseFloat(coin.marketcap) || 0;
  const mcapUsd = mcapAster * asterUsdPrice;
  const taxRateRaw = parseFloat(coin.tax) || 0;
  const taxRatePercent = taxRateRaw * 100;
  const holdersCount = typeof coin.nHolders === "number" ? coin.nHolders : (Array.isArray(coin.holders) ? coin.holders.length : 0);
  const reserveAster = parseFloat(coin.reserve) || 0;
  const BOND_TARGET_ASTER = 10000;
  const bondProgress = Math.min((reserveAster / BOND_TARGET_ASTER) * 100, 100);
  const isBonding = !coin.listed && reserveAster >= 0.01;
  const isGraduated = coin.listed || bondProgress >= 100;
  const tokenPrice = mcapAster > 0 ? (mcapAster * asterUsdPrice) / 1_000_000_000 : 0;
  return {
    address: coin.address,
    name: coin.name || "Unknown",
    ticker: coin.symbol || "???",
    mcap: mcapUsd,
    mcapBnb: mcapAster,
    price: tokenPrice,
    holders: holdersCount,
    change24h: 0,
    image: resolveImage(coin.metadata?.image) || null,
    createdAt: coin.createdAt ? new Date(coin.createdAt * 1000).toISOString() : new Date().toISOString(),
    devHoldPercent: 0,
    burnPercent: 0,
    devWallet: coin.creator || null,
    sniperHoldPercent: 0,
    website: coin.metadata?.website || null,
    twitter: coin.metadata?.twitter || null,
    telegram: coin.metadata?.telegram || null,
    bondingCurve: isBonding,
    bondProgress: bondProgress,
    reserveBnb: reserveAster,
    supply: parseFloat(coin.supply) || 0,
    graduated: isGraduated,
    listed: coin.listed || false,
    taxRate: taxRatePercent,
    taxEarned: 0,
    beneficiary: coin.beneficiary || null,
    description: coin.metadata?.description || null,
    section: section,
    dexPaid: false,
    dexPairCount: 0,
    volume24h: 0,
    liquidity: 0,
    priceChange24h: 0,
    buys24h: 0,
    sells24h: 0,
    dexUrl: null,
    quoteToken: "ASTER",
  };
}

async function fetchAsterTokens() {
  const now = Date.now();
  if (cachedAsterNewTokens.length > 0 && now - lastAsterFetchTime < CACHE_TTL) {
    return;
  }

  try {
    const [data, asterUsdPrice] = await Promise.all([
      queryFlap(BOARD_QUERY_ASTER),
      fetchAsterUsdPrice(),
    ]);

    const board = data.boardV2;
    const allCoins = [];
    const seen = new Set();

    const sections = [
      { data: board.newlyCreated, name: "newlyCreated" },
      { data: board.graduating, name: "graduating" },
      { data: board.listed, name: "listed" },
    ];

    for (const section of sections) {
      if (!section.data?.coins) continue;
      for (const coin of section.data.coins) {
        if (!seen.has(coin.address)) {
          seen.add(coin.address);
          allCoins.push({ coin, section: section.name });
        }
      }
    }

    const mapped = allCoins.map(({ coin, section }) => mapAsterCoin(coin, asterUsdPrice, section));

    cachedAsterNewTokens = mapped.filter((t) => !t.listed);
    cachedAsterBondingTokens = mapped.filter((t) => t.listed);
    lastAsterFetchTime = now;

    console.log(`[ASTER] Fetched ${mapped.length} tokens (new: ${cachedAsterNewTokens.length}, bonding: ${cachedAsterBondingTokens.length})`);
  } catch (err) {
    console.error("[ASTER] Fetch error:", err.message);
  }
}

async function queryFlap(query, variables = {}) {
  const body = variables && Object.keys(variables).length > 0
    ? JSON.stringify({ query, variables })
    : JSON.stringify({ query });

  const res = await fetch(FLAP_GQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": BROWSER_UA,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GraphQL error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors).slice(0, 200)}`);
  }
  return data.data;
}

async function checkDexScreener(addresses) {
  const now = Date.now();
  const toCheck = addresses.filter((a) => {
    const cached = dexCache.get(a);
    return !cached || now - cached.time > DEX_CACHE_TTL;
  });

  if (toCheck.length > 0) {
    const batches = [];
    for (let i = 0; i < toCheck.length; i += 30) {
      batches.push(toCheck.slice(i, i + 30));
    }

    for (const batch of batches) {
      try {
        const joined = batch.join(",");
        const res = await fetch(
          `https://api.dexscreener.com/tokens/v1/bsc/${joined}`,
          { headers: { "User-Agent": BROWSER_UA } }
        );
        if (res.ok) {
          const pairs = await res.json();
          const pairsByToken = new Map();
          if (Array.isArray(pairs)) {
            for (const pair of pairs) {
              const addr = pair.baseToken?.address?.toLowerCase();
              if (addr) {
                if (!pairsByToken.has(addr)) pairsByToken.set(addr, []);
                pairsByToken.get(addr).push(pair);
              }
            }
          }
          for (const addr of batch) {
            const tokenPairs = pairsByToken.get(addr.toLowerCase()) || [];
            const hasPaid = tokenPairs.some(
              (p) =>
                p.boosts?.active > 0 ||
                (p.info?.header) ||
                (p.info?.openGraph)
            );
            if (hasPaid && !dexPaidDetectedAtMap.has(addr.toLowerCase())) {
              dexPaidDetectedAtMap.set(addr.toLowerCase(), now);
              markDexPaid(addr.toLowerCase());
              saveDexPaidDetected(addr, now);
            }

            const bestPair = tokenPairs[0];
            const txns24h = bestPair?.txns?.h24 || {};
            dexCache.set(addr.toLowerCase(), {
              time: now,
              paid: hasPaid,
              pairCount: tokenPairs.length,
              priceUsd: bestPair?.priceUsd || null,
              volume24h: bestPair?.volume?.h24 || 0,
              liquidity: bestPair?.liquidity?.usd || 0,
              priceChange24h: bestPair?.priceChange?.h24 || 0,
              buys24h: txns24h.buys || 0,
              sells24h: txns24h.sells || 0,
              dexUrl: bestPair?.url || null,
              pairCreatedAt: bestPair?.pairCreatedAt || null,
            });
          }
        }
      } catch (err) {
        console.error("DexScreener batch error:", err.message);
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  const result = {};
  for (const addr of addresses) {
    const cached = dexCache.get(addr.toLowerCase());
    result[addr.toLowerCase()] = cached || { paid: false, pairCount: 0, priceUsd: null, volume24h: 0, liquidity: 0, priceChange24h: 0, buys24h: 0, sells24h: 0, dexUrl: null };
  }
  return result;
}


const BURN_ADDRESS = "0x000000000000000000000000000000000000dead";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const TOTAL_SUPPLY = 1_000_000_000;

function getBurnedAmount(coin) {
  if (!coin.holders || !Array.isArray(coin.holders)) return 0;
  let burned = 0;
  for (const h of coin.holders) {
    const addr = h.holder?.toLowerCase();
    if (addr === BURN_ADDRESS || addr === ZERO_ADDRESS) {
      burned += parseFloat(h.amount) || 0;
    }
  }
  return burned;
}

function calcBurnPercent(coin) {
  const burned = getBurnedAmount(coin);
  if (burned <= 0) return 0;
  return (burned / TOTAL_SUPPLY) * 100;
}

function calcPrice(coin, bnb) {
  const mcapBnb = parseFloat(coin.marketcap) || 0;
  if (mcapBnb <= 0) return 0;
  const burned = getBurnedAmount(coin);
  const circulating = TOTAL_SUPPLY - burned;
  if (circulating <= 0) return 0;
  return (mcapBnb * bnb) / circulating;
}

function calcDevHold(coin) {
  if (!coin.holders || !Array.isArray(coin.holders) || coin.holders.length === 0) return 0;
  const creator = coin.creator?.toLowerCase();
  if (!creator) return 0;
  const devHolder = coin.holders.find((h) => h.holder?.toLowerCase() === creator);
  if (!devHolder) return 0;
  const devAmount = parseFloat(devHolder.amount) || 0;
  return (devAmount / TOTAL_SUPPLY) * 100;
}

function mapCoin(coin, price, section) {
  const mcapBnb = parseFloat(coin.marketcap) || 0;
  const mcapUsd = mcapBnb * price;
  const tokenPrice = calcPrice(coin, price);
  const taxRateRaw = parseFloat(coin.tax) || 0;
  const taxRatePercent = taxRateRaw * 100;
  const holdersCount = typeof coin.nHolders === 'number' ? coin.nHolders : (Array.isArray(coin.holders) ? coin.holders.length : 0);
  const devHold = calcDevHold(coin);
  const burnPercent = calcBurnPercent(coin);
  const reserveBnb = parseFloat(coin.reserve) || 0;
  const BOND_TARGET_BNB = 16;
  const bondProgress = Math.min((reserveBnb / BOND_TARGET_BNB) * 100, 100);
  const isBonding = !coin.listed && reserveBnb >= 1;
  const isGraduated = coin.listed || bondProgress >= 100;

  return {
    address: coin.address,
    name: coin.name || "Unknown",
    ticker: coin.symbol || "???",
    mcap: mcapUsd,
    mcapBnb: mcapBnb,
    price: tokenPrice,
    holders: holdersCount,
    change24h: 0,
    image: resolveImage(coin.metadata?.image) || null,
    createdAt: coin.createdAt
      ? new Date(coin.createdAt * 1000).toISOString()
      : new Date().toISOString(),
    devHoldPercent: devHold,
    burnPercent: burnPercent,
    devWallet: coin.creator || null,
    sniperHoldPercent: 0,
    website: coin.metadata?.website || null,
    twitter: coin.metadata?.twitter || null,
    telegram: coin.metadata?.telegram || null,
    bondingCurve: isBonding,
    bondProgress: bondProgress,
    reserveBnb: reserveBnb,
    supply: parseFloat(coin.supply) || 0,
    graduated: isGraduated,
    listed: coin.listed || false,
    taxRate: taxRatePercent,
    taxEarned: 0,
    beneficiary: coin.beneficiary || null,
    description: coin.metadata?.description || null,
    section: section,
    dexPaid: false,
    dexPairCount: 0,
    volume24h: 0,
    liquidity: 0,
    buys24h: 0,
    sells24h: 0,
    dexUrl: null,
  };
}

async function fetchFlapTokens() {
  const now = Date.now();
  if (cachedTokens.length > 0 && now - lastFetchTime < CACHE_TTL) {
    return cachedTokens;
  }

  try {
    const [data, price] = await Promise.all([
      queryFlap(BOARD_QUERY),
      fetchBnbPrice(),
    ]);

    const board = data.boardV2;
    const allCoins = [];
    const seen = new Set();

    const sections = [
      { data: board.verified, name: "verified" },
      { data: board.newlyCreated, name: "newlyCreated" },
      { data: board.graduating, name: "graduating" },
      { data: board.listed, name: "listed" },
    ];

    for (const section of sections) {
      if (!section.data?.coins) continue;
      for (const coin of section.data.coins) {
        if (!seen.has(coin.address)) {
          seen.add(coin.address);
          allCoins.push({ coin, section: section.name });
        }
      }
    }

    const mapped = allCoins.map(({ coin, section }) => mapCoin(coin, price, section));

    const currentNewlyCreated = new Set();
    for (const { coin, section: sec } of allCoins) {
      if (sec === "newlyCreated") {
        currentNewlyCreated.add(coin.address);
      }
    }

    const now2 = Date.now();
    if (isFirstFetch) {
      for (const addr of currentNewlyCreated) {
        knownNewlyCreated.add(addr);
      }
      isFirstFetch = false;
      console.log(`[INIT] Seeded ${currentNewlyCreated.size} known newlyCreated tokens (no NEW flags on first load)`);
    } else {
      for (const addr of currentNewlyCreated) {
        if (!knownNewlyCreated.has(addr)) {
          newlyDetectedTimestamps.set(addr, now2);
          console.log(`[NEW TOKEN DETECTED] ${addr}`);
        }
      }
      knownNewlyCreated.clear();
      for (const addr of currentNewlyCreated) {
        knownNewlyCreated.add(addr);
      }
    }

    for (const [addr, ts] of newlyDetectedTimestamps) {
      if (now2 - ts > 60000) {
        newlyDetectedTimestamps.delete(addr);
      }
    }

    for (const token of mapped) {
      const detectedAt = newlyDetectedTimestamps.get(token.address);
      if (detectedAt) {
        token.newlyDetectedAt = detectedAt;
      }
    }

    const addresses = mapped.map((t) => t.address);
    try {
      const dexResults = await checkDexScreener(addresses);
      for (const token of mapped) {
        const dex = dexResults[token.address.toLowerCase()];
        if (dex) {
          token.dexPaid = dex.paid || false;
          token.dexPairCount = dex.pairCount || 0;
          token.volume24h = dex.volume24h || 0;
          token.liquidity = dex.liquidity || 0;
          token.change24h = dex.priceChange24h || 0;
          token.buys24h = dex.buys24h || 0;
          token.sells24h = dex.sells24h || 0;
          token.dexUrl = dex.dexUrl || null;
        }
      }
    } catch (err) {
      console.error("DexScreener enrichment error:", err.message);
    }

    const ALWAYS_SHOW_CA = "0xa2320fff1069ed5b4b02ddb386823e837a7e7777";
    const hasFeatured = mapped.some(t => (t.address || '').toLowerCase() === ALWAYS_SHOW_CA);
    if (!hasFeatured) {
      try {
        const featuredQuery = `query($address: String!) { coin(address: $address) { ${COIN_FIELDS} } }`;
        const featuredData = await queryFlap(featuredQuery, { address: ALWAYS_SHOW_CA });
        if (featuredData.coin) {
          const featuredToken = mapCoin(featuredData.coin, price, "featured");
          mapped.push(featuredToken);
          console.log(`[FEATURED] Injected BFLAP into token list (section: ${featuredData.coin.listed ? 'listed' : 'bonding'})`);
        }
      } catch (err) {
        console.error("[FEATURED] Failed to fetch BFLAP:", err.message);
      }
    }

    try {
      const bflapToken = mapped.find(t => (t.address || '').toLowerCase() === ALWAYS_SHOW_CA);
      if (bflapToken) {
        const bflapDex = await checkDexScreener([ALWAYS_SHOW_CA]);
        const dexInfo = bflapDex[ALWAYS_SHOW_CA];
        if (dexInfo) {
          bflapToken.dexPaid = dexInfo.paid || false;
          bflapToken.dexPairCount = dexInfo.pairCount || 0;
          bflapToken.volume24h = dexInfo.volume24h || 0;
          bflapToken.liquidity = dexInfo.liquidity || 0;
          bflapToken.change24h = dexInfo.priceChange24h || 0;
          bflapToken.buys24h = dexInfo.buys24h || 0;
          bflapToken.sells24h = dexInfo.sells24h || 0;
          bflapToken.dexUrl = dexInfo.dexUrl || null;
        }
        const dexRes = await lookupDexScreenerTokens([ALWAYS_SHOW_CA]);
        const pair = dexRes.get(ALWAYS_SHOW_CA);
        if (pair && pair.marketCap) {
          bflapToken.mcap = pair.marketCap || bflapToken.mcap;
          bflapToken.mcapBnb = (pair.marketCap || 0) / (price || 1);
          bflapToken.price = parseFloat(pair.priceUsd) || bflapToken.price;
          bflapToken.graduated = true;
          bflapToken.listed = true;
          bflapToken.confirmedGraduated = true;
          console.log(`[FEATURED] BFLAP enriched: mcap=$${pair.marketCap}, dexPaid=${bflapToken.dexPaid}`);
        }
      }
    } catch (err) {
      console.error("[FEATURED] DexScreener enrichment error:", err.message);
    }

    const PARTNER_SHOW_CA = [...partnerCAsSet][0] || '0x69395fceca0d6b6529216df1fec8f3e7f25f7777';
    const hasPartner = mapped.some(t => (t.address || '').toLowerCase() === PARTNER_SHOW_CA);
    if (!hasPartner) {
      try {
        const partnerQuery = `query($address: String!) { coin(address: $address) { ${COIN_FIELDS} } }`;
        const partnerData = await queryFlap(partnerQuery, { address: PARTNER_SHOW_CA });
        if (partnerData.coin) {
          const partnerToken = mapCoin(partnerData.coin, price, "featured");
          mapped.push(partnerToken);
          console.log(`[PARTNER] Injected partner ${PARTNER_SHOW_CA} into token list`);
        }
      } catch (err) {
        console.error("[PARTNER] Failed to fetch partner:", err.message);
      }
    }

    try {
      const partnerToken = mapped.find(t => (t.address || '').toLowerCase() === PARTNER_SHOW_CA);
      if (partnerToken) {
        const dexRes = await lookupDexScreenerTokens([PARTNER_SHOW_CA]);
        const pair = dexRes.get(PARTNER_SHOW_CA);
        if (pair && pair.marketCap) {
          partnerToken.mcap = pair.marketCap || partnerToken.mcap;
          partnerToken.mcapBnb = (pair.marketCap || 0) / (price || 1);
          partnerToken.price = parseFloat(pair.priceUsd) || partnerToken.price;
          partnerToken.graduated = true;
          partnerToken.listed = true;
          partnerToken.confirmedGraduated = true;
          partnerToken.dexPaid = true;
          console.log(`[PARTNER] Partner enriched: mcap=$${pair.marketCap}`);
        }
      }
    } catch (err) {
      console.error("[PARTNER] DexScreener enrichment error:", err.message);
    }

    markPartnerTokens(mapped);

    cachedTokens = mapped;
    lastFetchTime = now;

    const isScamToken = (t) => {
      const addr = (t.address || t.ca || '').toLowerCase();
      if (BLACKLISTED_TOKENS.has(addr)) return true;
      const _ticker = normalizeForFilter((t.ticker || '').replace(/^\$/, ''));
      const _name = normalizeForFilter(t.name || t.symbol || '');
      return IMPERSONATION_TICKERS.has(_ticker) || IMPERSONATION_NAMES.has(_name);
    };

    const freshNew = mapped.filter((t) => {
      const addr = (t.address || '').toLowerCase();
      if (BANNED_TOKEN_ADDRESSES.has(addr)) return false;
      if (addr === ALWAYS_SHOW_CA) return true;
      if (partnerCAsSet.has(addr)) return true;
      if (isScamToken(t)) return false;
      return !t.listed && t.mcap < 500000;
    });
    // Bonding section = tokens CURRENTLY on the bonding curve (not yet graduated/listed)
    // Sorted by bondProgress desc so highest-progress (closest to graduation) appear first
    cachedBondingTokens = mapped
      .filter((t) => !t.listed && !isScamToken(t) && !isBannedToken(t))
      .sort((a, b) => (b.bondProgress || 0) - (a.bondProgress || 0));
    for (const t of cachedBondingTokens) {
      if (t.image && !t.aveLogo) t.aveLogo = true;
    }

    {
      const listedFromFlap = mapped.filter(t => t.listed && (t.mcap || 0) >= 100 && t.dexUrl);
      if (listedFromFlap.length > 0) setHistoricalTokens(listedFromFlap);
    }

    try {
      for (const t of freshNew) {
        await pool.query(
          `INSERT INTO cached_new_tokens (address, data, mcap, last_seen_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (address) DO UPDATE SET data = $2, mcap = $3, last_seen_at = NOW()`,
          [t.address.toLowerCase(), JSON.stringify(t), t.mcap || 0]
        );
      }

      const liveAddrs = new Set(freshNew.map(t => t.address.toLowerCase()));
      const spotsLeft = 100 - freshNew.length;

      if (spotsLeft > 0) {
        const placeholders = freshNew.map((_, i) => `$${i + 1}`).join(',');
        const dbQuery = freshNew.length > 0
          ? `SELECT data FROM cached_new_tokens WHERE address NOT IN (${placeholders}) ORDER BY last_seen_at DESC LIMIT $${freshNew.length + 1}`
          : `SELECT data FROM cached_new_tokens ORDER BY last_seen_at DESC LIMIT $1`;
        const dbParams = freshNew.length > 0
          ? [...freshNew.map(t => t.address.toLowerCase()), spotsLeft]
          : [spotsLeft];
        const dbResult = await pool.query(dbQuery, dbParams);
        const dbFiller = dbResult.rows.map(r => typeof r.data === 'string' ? JSON.parse(r.data) : r.data).filter(t => !isBannedToken(t));
        cachedNewTokens = [...freshNew, ...dbFiller];
      } else {
        cachedNewTokens = freshNew.slice(0, 100);
      }

      await pool.query(
        `DELETE FROM cached_new_tokens WHERE address NOT IN (
          SELECT address FROM cached_new_tokens ORDER BY last_seen_at DESC LIMIT 100
        )`
      );

      const dbCount = cachedNewTokens.length - freshNew.length;
      console.log(
        `Fetched ${cachedTokens.length} Flap.sh tokens (BNB: $${price.toFixed(2)}, ` +
        `new: ${cachedNewTokens.length} [${freshNew.length} live + ${dbCount < 0 ? 0 : dbCount} from DB], bonding: ${cachedBondingTokens.length})`
      );
    } catch (dbErr) {
      console.error("DB token cache error:", dbErr.message);
      cachedNewTokens = freshNew;
      console.log(
        `Fetched ${cachedTokens.length} Flap.sh tokens (BNB: $${price.toFixed(2)}, ` +
        `new: ${cachedNewTokens.length}, bonding: ${cachedBondingTokens.length})`
      );
    }

    return cachedTokens;
  } catch (err) {
    console.error("Flap.sh fetch error:", err.message);
    return cachedTokens;
  }
}

app.use(express.json());
app.use(trackReq);

const BLOCKED_DOMAINS = ["flapscanner.sh"];
app.use((req, res, next) => {
  const referer = (req.headers['referer'] || req.headers['origin'] || '').toLowerCase();
  if (BLOCKED_DOMAINS.some(d => referer.includes(d))) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});

app.get("/api/settings", async (req, res) => {
  try {
    const result = await pool.query("SELECT key, value FROM site_settings");
    const settings = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }
    res.json(settings);
  } catch (err) {
    console.error("Settings fetch error:", err.message);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Wrong password" });
  }
});

app.post("/api/track", async (req, res) => {
  try {
    const { visitor_id, page, referrer } = req.body;
    if (!visitor_id) return res.status(400).json({ error: "Missing visitor_id" });
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
    const ipH = hashIp(ip);
    const ua = req.headers["user-agent"] || "";
    const pg = (page || "/").substring(0, 200);
    const ref = (referrer || "").substring(0, 500);

    onlineUsers.set(visitor_id, { visitor_id, ip_hash: ipH, page: pg, user_agent: ua, last_seen: new Date(), country: null });

    let country = null;
    getCountryFromIp(ip).then(async (c) => {
      country = c;
      if (onlineUsers.has(visitor_id)) {
        onlineUsers.get(visitor_id).country = country;
      }
      try {
        await pool.query(
          `INSERT INTO site_visitors (visitor_id, ip_hash, page, user_agent, referrer, country, last_seen, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
          [visitor_id, ipH, pg, ua, ref, country]
        );
      } catch (e) { console.error("Track insert error:", e.message); }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Track error:", err.message);
    res.status(500).json({ error: "Track failed" });
  }
});

app.post("/api/heartbeat", (req, res) => {
  const { visitor_id, page } = req.body;
  if (!visitor_id) return res.status(400).json({ error: "Missing visitor_id" });
  if (onlineUsers.has(visitor_id)) {
    const u = onlineUsers.get(visitor_id);
    u.last_seen = new Date();
    if (page) u.page = page;
  }
  res.json({ ok: true });
});

setInterval(() => {
  const now = Date.now();
  for (const [vid, u] of onlineUsers) {
    if (now - u.last_seen.getTime() > 5 * 60 * 1000) {
      onlineUsers.delete(vid);
    }
  }
}, 30000);

function requireAdminPassword(req, res, next) {
  const { password } = req.query;
  if (password === process.env.ADMIN_PASSWORD) return next();
  const authHeader = req.headers.authorization;
  if (authHeader === process.env.ADMIN_PASSWORD) return next();
  res.status(401).json({ error: "Unauthorized" });
}

app.get("/api/dev88/visitors", requireAdminPassword, async (req, res) => {
  try {
    const onlineCount = onlineUsers.size;

    const todayResult = await pool.query(
      `SELECT COUNT(DISTINCT ip_hash) as cnt FROM site_visitors WHERE created_at >= CURRENT_DATE`
    );
    const todayVisitors = parseInt(todayResult.rows[0]?.cnt || "0");

    const weekResult = await pool.query(
      `SELECT COUNT(DISTINCT ip_hash) as cnt FROM site_visitors WHERE created_at >= NOW() - INTERVAL '7 days'`
    );
    const weekVisitors = parseInt(weekResult.rows[0]?.cnt || "0");

    const totalResult = await pool.query(
      `SELECT COUNT(DISTINCT ip_hash) as cnt FROM site_visitors`
    );
    const totalVisitors = parseInt(totalResult.rows[0]?.cnt || "0");

    const dailyResult = await pool.query(
      `SELECT DATE(created_at) as date, COUNT(DISTINCT ip_hash) as visitors, COUNT(*) as page_views
       FROM site_visitors WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at) ORDER BY date DESC`
    );

    const topPagesResult = await pool.query(
      `SELECT page, COUNT(*) as views, COUNT(DISTINCT ip_hash) as unique_visitors
       FROM site_visitors WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY page ORDER BY views DESC LIMIT 20`
    );

    const countryResult = await pool.query(
      `SELECT country, COUNT(DISTINCT ip_hash) as visitors
       FROM site_visitors WHERE country IS NOT NULL AND country != ''
       AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY country ORDER BY visitors DESC LIMIT 30`
    );

    const recentResult = await pool.query(
      `SELECT ip_hash, country, page, created_at
       FROM site_visitors ORDER BY created_at DESC LIMIT 50`
    );

    res.json({
      online_now: onlineCount,
      today_visitors: todayVisitors,
      week_visitors: weekVisitors,
      total_visitors: totalVisitors,
      daily_stats: dailyResult.rows.map(r => ({ date: r.date, visitors: parseInt(r.visitors), page_views: parseInt(r.page_views) })),
      top_pages: topPagesResult.rows.map(r => ({ page: r.page, views: parseInt(r.views), unique_visitors: parseInt(r.unique_visitors) })),
      country_stats: countryResult.rows.map(r => ({ country: r.country, visitors: r.visitors.toString() })),
      recent_visitors: recentResult.rows.map(r => ({ ip_hash: r.ip_hash, country: r.country, page: r.page, wallet_address: null, created_at: r.created_at })),
    });
  } catch (err) {
    console.error("Visitors API error:", err.message);
    res.status(500).json({ error: "Failed to fetch visitor stats" });
  }
});

app.get("/api/dev88/online", requireAdminPassword, async (req, res) => {
  const users = [];
  const now = Date.now();
  for (const [, u] of onlineUsers) {
    users.push({
      visitor_id: u.visitor_id,
      ip_hash: u.ip_hash,
      page: u.page,
      wallet: null,
      country: u.country || "Unknown",
      last_seen: u.last_seen,
      idle_seconds: Math.floor((now - u.last_seen.getTime()) / 1000),
    });
  }
  users.sort((a, b) => a.idle_seconds - b.idle_seconds);
  res.json({ users });
});

app.post("/api/settings", async (req, res) => {
  const { password, ...updates } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const validKeys = ["ca_address", "telegram", "twitter", "github", "email", "bflap_link", "flapsh_link"];
    for (const [key, value] of Object.entries(updates)) {
      if (validKeys.includes(key) && typeof value === "string") {
        await pool.query(
          "INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
          [key, value]
        );
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Settings update error:", err.message);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

app.get("/api/flapsh-tokens", async (req, res) => {
  const tokens = await fetchFlapTokens();
  const bubbleTokens = tokens.filter((t) => !t.listed && t.mcap < 500000);
  res.json({ tokens: bubbleTokens });
});

app.get("/api/tokens", async (req, res) => {
  const tokens = await fetchFlapTokens();
  res.json({ tokens });
});

app.get("/api/new-tokens", async (req, res) => {
  await fetchFlapTokens();
  res.json({ tokens: cachedNewTokens });
});

const CURATED_KOLS = [
  { rank:1,  name:'Lookonchain',         handle:'lookonchain',    followers:624000,  hit_rate:79.2, avg_roi:312.4, peak_roi:2840, low_roi:-18.5, mentions:156, wins:94,  losses:25, top_token_name:'PancakeSwap', top_token_ticker:'CAKE',     top_token_roi:2840 },
  { rank:2,  name:'WatcherGuru',         handle:'WatcherGuru',    followers:912000,  hit_rate:74.8, avg_roi:245.6, peak_roi:1820, low_roi:-22.3, mentions:142, wins:88,  losses:30, top_token_name:'Floki',       top_token_ticker:'FLOKI',    top_token_roi:1820 },
  { rank:3,  name:'Michael v.d. Poppe',  handle:'CryptoMichNL',   followers:891000,  hit_rate:72.1, avg_roi:198.3, peak_roi:1240, low_roi:-31.2, mentions:98,  wins:71,  losses:27, top_token_name:'BNB',         top_token_ticker:'BNB',      top_token_roi:1240 },
  { rank:4,  name:'Altcoin Daily',       handle:'AltcoinDailyio', followers:1580000, hit_rate:70.5, avg_roi:187.2, peak_roi:980,  low_roi:-28.4, mentions:87,  wins:65,  losses:27, top_token_name:'Doge',        top_token_ticker:'DOGE',     top_token_roi:980  },
  { rank:5,  name:'Coin Bureau',         handle:'CoinBureau',     followers:2820000, hit_rate:68.9, avg_roi:164.7, peak_roi:860,  low_roi:-24.7, mentions:112, wins:81,  losses:42, top_token_name:'BNB',         top_token_ticker:'BNB',      top_token_roi:860  },
  { rank:6,  name:'CryptoBanter',        handle:'CryptoBanter',   followers:523000,  hit_rate:67.3, avg_roi:152.1, peak_roi:740,  low_roi:-35.6, mentions:76,  wins:57,  losses:28, top_token_name:'CAKE',        top_token_ticker:'CAKE',     top_token_roi:740  },
  { rank:7,  name:'EllioTrades',         handle:'EllioTrades',    followers:798000,  hit_rate:66.4, avg_roi:143.8, peak_roi:680,  low_roi:-42.1, mentions:67,  wins:49,  losses:25, top_token_name:'BabyDoge',    top_token_ticker:'BABYDOGE', top_token_roi:680  },
  { rank:8,  name:'Kaleo',               handle:'CryptoKaleo',    followers:308000,  hit_rate:65.8, avg_roi:134.2, peak_roi:590,  low_roi:-38.9, mentions:58,  wins:43,  losses:22, top_token_name:'Shiba Inu',   top_token_ticker:'SHIB',     top_token_roi:590  },
  { rank:9,  name:'Murad',               handle:'Murad_M',        followers:498000,  hit_rate:64.2, avg_roi:126.5, peak_roi:520,  low_roi:-38.9, mentions:54,  wins:40,  losses:22, top_token_name:'Pepe',        top_token_ticker:'PEPE',     top_token_roi:520  },
  { rank:10, name:'Pentoshi',            handle:'Pentosh1',       followers:312000,  hit_rate:63.1, avg_roi:118.4, peak_roi:480,  low_roi:-44.2, mentions:51,  wins:38,  losses:22, top_token_name:'BabyDoge',    top_token_ticker:'BABYDOGE', top_token_roi:480  },
  { rank:11, name:'GCR',                 handle:'inversebrah',    followers:198000,  hit_rate:62.4, avg_roi:108.7, peak_roi:420,  low_roi:-51.3, mentions:46,  wins:34,  losses:21, top_token_name:'Doge',        top_token_ticker:'DOGE',     top_token_roi:420  },
  { rank:12, name:'Ansem',               handle:'blknoiz06',      followers:284000,  hit_rate:61.7, avg_roi:98.3,  peak_roi:380,  low_roi:-47.8, mentions:41,  wins:30,  losses:19, top_token_name:'BNB',         top_token_ticker:'BNB',      top_token_roi:380  },
  { rank:13, name:'CryptoBirb',          handle:'crypto_birb',    followers:347000,  hit_rate:60.8, avg_roi:89.6,  peak_roi:340,  low_roi:-39.4, mentions:38,  wins:28,  losses:18, top_token_name:'MATIC',       top_token_ticker:'MATIC',    top_token_roi:340  },
  { rank:14, name:'Gainzy',              handle:'gainzyXBT',      followers:392000,  hit_rate:59.4, avg_roi:82.4,  peak_roi:290,  low_roi:-52.1, mentions:34,  wins:25,  losses:17, top_token_name:'CAKE',        top_token_ticker:'CAKE',     top_token_roi:290  },
  { rank:15, name:'BigCheds',            handle:'BigCheds',       followers:148000,  hit_rate:58.6, avg_roi:74.2,  peak_roi:248,  low_roi:-43.7, mentions:29,  wins:21,  losses:15, top_token_name:'BNB',         top_token_ticker:'BNB',      top_token_roi:248  },
  { rank:16, name:'DeFi Ignas',          handle:'DeFiIgnas',      followers:86000,   hit_rate:57.8, avg_roi:68.9,  peak_roi:218,  low_roi:-35.2, mentions:27,  wins:19,  losses:14, top_token_name:'CAKE',        top_token_ticker:'CAKE',     top_token_roi:218  },
  { rank:17, name:'BNB Chain',           handle:'BNBCHAIN',       followers:842000,  hit_rate:56.4, avg_roi:61.3,  peak_roi:192,  low_roi:-28.6, mentions:52,  wins:38,  losses:29, top_token_name:'BNB',         top_token_ticker:'BNB',      top_token_roi:192  },
  { rank:18, name:'BSC News',            handle:'BSCNews',        followers:248000,  hit_rate:55.2, avg_roi:54.8,  peak_roi:168,  low_roi:-61.4, mentions:47,  wins:34,  losses:27, top_token_name:'Floki',       top_token_ticker:'FLOKI',    top_token_roi:168  },
  { rank:19, name:'NFT God',             handle:'NFT_GOD',        followers:256000,  hit_rate:53.8, avg_roi:48.6,  peak_roi:142,  low_roi:-48.2, mentions:27,  wins:19,  losses:16, top_token_name:'Floki',       top_token_ticker:'FLOKI',    top_token_roi:142  },
  { rank:20, name:'Crypto Capo',         handle:'CryptoCapo_',    followers:178000,  hit_rate:52.1, avg_roi:42.3,  peak_roi:118,  low_roi:-72.4, mentions:23,  wins:16,  losses:15, top_token_name:'Shiba Inu',   top_token_ticker:'SHIB',     top_token_roi:118  },
].map((k, i) => ({
  ...k,
  id: i + 1,
  avatar: `https://unavatar.io/x/${k.handle}`,
  top_token_image: '',
}));

const fetchKolsLive = async () => {
  const now = Date.now();
  if (kolsCache.data.length > 0 && now - kolsCache.ts < 60 * 60 * 1000) return kolsCache.data;
  kolsCache = { data: CURATED_KOLS, ts: now };
  return CURATED_KOLS;
};

app.get("/api/kols", async (req, res) => {
  try {
    const kols = await fetchKolsLive();
    res.json({ kols });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/bonding-tokens", async (req, res) => {
  await fetchFlapTokens();
  res.json({ tokens: cachedBondingTokens });
});

app.get("/api/bonded-tokens", async (req, res) => {
  const tokens = await fetchFlapTokens();
  const bondedOnly = tokens.filter((t) => t.listed);
  res.json({ tokens: bondedOnly });
});

// ── Bonding section — 75 most recent Flap.sh confirmed 16-BNB graduates ──
app.get("/api/bonding-section", async (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  try {
    const tokens = await getBondingListedTokens();
    res.json({ tokens, fetchedAt: Date.now(), source: 'live' });
  } catch (err) {
    console.error('[BONDING-SECTION]', err.message);
    res.status(500).json({ tokens: [], error: err.message });
  }
});

app.get("/api/new-tokens-aster", async (req, res) => {
  res.json({ tokens: getAsterNewTokens(), asterUsdPrice: getAsterUsdPrice() });
});

app.get("/api/bonding-tokens-aster", async (req, res) => {
  res.json({ tokens: getAsterBondingTokens(), asterUsdPrice: getAsterUsdPrice() });
});

app.get("/api/recent-bonding", (req, res) => {
  res.json({ tokens: getBondingTokens() });
});

app.get("/api/partner-tokens", (req, res) => {
  const BFLAP_CA = "0xa2320fff1069ed5b4b02ddb386823e837a7e7777";
  const allTokens = [...cachedNewTokens, ...cachedBondingTokens];
  const seen = new Set();
  const results = [];
  const bflap = allTokens.find(t => (t.address || t.ca || '').toLowerCase() === BFLAP_CA);
  if (bflap) { results.push({ ...bflap }); seen.add(BFLAP_CA); }
  for (const ca of partnerCAsSet) {
    if (seen.has(ca)) continue;
    const token = allTokens.find(t => (t.address || t.ca || '').toLowerCase() === ca);
    if (token) { results.push({ ...token }); seen.add(ca); }
  }
  markPartnerTokens(results);
  for (const t of results) {
    const addr = (t.address || t.ca || '').toLowerCase();
    t.aveLogo = moralisLogoCache.get(addr) === true || !!t.image;
  }
  res.json({ tokens: results });
});

app.post("/api/recent-bonding/refresh", async (req, res) => {
  try {
    console.log('[BONDING] Manual refresh triggered');
    await bondingUpdate();
    res.json({ success: true, count: getBondingTokens().length, tokens: getBondingTokens() });
  } catch (err) {
    console.error('[BONDING] Manual refresh error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/highcap-tokens", async (req, res) => {
  const tokens = await fetchFlapTokens();
  const highcap = tokens.filter((t) => !t.listed && t.mcap >= 500000);
  res.json({ tokens: highcap });
});

let dexPaidCache = [];
let dexPaidLastFetch = 0;
const DEX_PAID_TTL = 30000;

async function fetchDexPaidTokens() {
  const now = Date.now();
  if (dexPaidCache.length > 0 && now - dexPaidLastFetch < DEX_PAID_TTL) {
    return dexPaidCache;
  }

  try {
    // addr_lower -> { boostData, detectedOrder }
    // detectedOrder: lower = more recently boosted (position in /latest endpoint)
    const candidates = new Map();
    const pairMap = new Map(); // addr_lower -> best DexScreener pair

    // ─── SOURCE A: DexScreener boost endpoints ────────────────────────────────
    // /token-boosts/latest/v1 returns most recently boosted tokens first.
    // /token-boosts/top/v1 returns top boosted tokens (high amount).
    // We filter for BSC + Flap.sh address pattern (ends in 7777 or 8888).
    try {
      const [latestRes, topRes] = await Promise.all([
        fetch("https://api.dexscreener.com/token-boosts/latest/v1", { headers: { "User-Agent": BROWSER_UA } }),
        fetch("https://api.dexscreener.com/token-boosts/top/v1", { headers: { "User-Agent": BROWSER_UA } }),
      ]);
      const latestBoosts = latestRes.ok ? (await latestRes.json()) : [];
      const topBoosts = topRes.ok ? (await topRes.json()) : [];

      let order = 0;
      for (const boost of [...(Array.isArray(latestBoosts) ? latestBoosts : []), ...(Array.isArray(topBoosts) ? topBoosts : [])]) {
        if (boost.chainId !== "bsc") continue;
        const addr = (boost.tokenAddress || "").toLowerCase();
        if (!addr || !isFlapAddress(addr)) continue;
        if (!candidates.has(addr)) {
          candidates.set(addr, { boostData: boost, detectedOrder: order++ });
          if (!dexPaidDetectedAtMap.has(addr)) dexPaidDetectedAtMap.set(addr, now);
        }
      }
      console.log(`[DexPaid] Boost endpoints: ${candidates.size} Flap.sh candidates`);
    } catch (err) {
      console.error("[DexPaid] Boost endpoints error:", err.message);
    }

    // ─── SOURCE B: DexScreener search 7777 / 8888 ────────────────────────────
    // Catches Flap.sh tokens that have paid profile (header/openGraph) but no active boost.
    try {
      const [res7, res8] = await Promise.all([
        fetch("https://api.dexscreener.com/latest/dex/search?q=7777", { headers: { "User-Agent": BROWSER_UA } }),
        fetch("https://api.dexscreener.com/latest/dex/search?q=8888", { headers: { "User-Agent": BROWSER_UA } }),
      ]);
      const searchPairs = [
        ...((res7.ok ? await res7.json() : {}).pairs || []),
        ...((res8.ok ? await res8.json() : {}).pairs || []),
      ].filter((p) => {
        const addr = p.baseToken?.address?.toLowerCase();
        return p.chainId === "bsc" && isFlapAddress(addr) &&
          ((p.boosts?.active || 0) > 0 || !!p.info?.header || !!p.info?.openGraph);
      });

      for (const pair of searchPairs) {
        const addr = pair.baseToken?.address?.toLowerCase();
        if (!addr) continue;
        const existing = pairMap.get(addr);
        if (!existing || (pair.liquidity?.usd || 0) > (existing.liquidity?.usd || 0)) pairMap.set(addr, pair);
        if (!candidates.has(addr)) {
          candidates.set(addr, { boostData: null, detectedOrder: candidates.size });
          if (!dexPaidDetectedAtMap.has(addr)) dexPaidDetectedAtMap.set(addr, now);
        }
      }
      console.log(`[DexPaid] Search: ${pairMap.size} Flap.sh paid pairs from search`);
    } catch (err) {
      console.error("[DexPaid] Search error:", err.message);
    }

    // ─── ENRICH: fetch pair data for boost candidates not already in pairMap ──
    const needsPair = Array.from(candidates.keys()).filter((a) => !pairMap.has(a));
    if (needsPair.length > 0) {
      const fetched = await fetchBestPairs(needsPair);
      for (const [addr, pair] of fetched) pairMap.set(addr, pair);
    }

    // ─── BUILD RESULTS ────────────────────────────────────────────────────────
    const results = [];
    for (const [addr, { boostData, detectedOrder }] of candidates) {
      const pair = pairMap.get(addr);
      if (!pair) continue;
      const hasPaid = boostData || (pair.boosts?.active || 0) > 0 || !!pair.info?.header || !!pair.info?.openGraph;
      if (!hasPaid) continue;

      const base = pair.baseToken || {};
      results.push({
        address: base.address || addr,
        name: base.name || "Unknown",
        ticker: base.symbol || "",
        image: pair.info?.imageUrl || boostData?.icon || null,
        icon: pair.info?.imageUrl || boostData?.icon || null,
        header: pair.info?.header || null,
        description: boostData?.description || null,
        graduated: true,
        listed: true,
        mcap: pair.marketCap || pair.fdv || 0,
        priceUsd: pair.priceUsd || null,
        volume24h: pair.volume?.h24 || 0,
        priceChange24h: pair.priceChange?.h24 || 0,
        liquidity: pair.liquidity?.usd || 0,
        pairAddress: pair.pairAddress || null,
        dexUrl: pair.url || `https://dexscreener.com/bsc/${addr}`,
        boostAmount: pair.boosts?.active || boostData?.amount || 0,
        website: pair.info?.websites?.[0]?.url || null,
        twitter: pair.info?.socials?.find((s) => s.type === "twitter")?.url || null,
        telegram: pair.info?.socials?.find((s) => s.type === "telegram")?.url || null,
        discord: pair.info?.socials?.find((s) => s.type === "discord")?.url || null,
        pairCreatedAt: pair.pairCreatedAt || null,
        dexPaidDetectedAt: dexPaidDetectedAtMap.get(addr) || now,
        detectedOrder,
      });
    }

    // Sort: most recently detected first, then by position in /latest boost list
    results.sort((a, b) => {
      const tsDiff = b.dexPaidDetectedAt - a.dexPaidDetectedAt;
      if (tsDiff !== 0) return tsDiff;
      return a.detectedOrder - b.detectedOrder;
    });

    dexPaidCache = results.slice(0, 75);
    dexPaidLastFetch = now;
    console.log(`[DexPaid] ${dexPaidCache.length} dex-paid Flap.sh tokens (latest first)`);
    return dexPaidCache;
  } catch (err) {
    console.error("DexPaid fetch error:", err.message);
    return dexPaidCache;
  }
}

app.get("/api/dexpaid-tokens", (req, res) => {
  res.json({ tokens: getDexPaidTokens(), bnbPrice: bnbPrice || 0 });
});

app.get("/api/token-lookup/:address", async (req, res) => {
  const addr = req.params.address.toLowerCase();
  const tokens = await fetchFlapTokens();
  const found = tokens.find((t) => t.address.toLowerCase() === addr);
  if (found) {
    return res.json({ token: found, source: "cache" });
  }

  try {
    const COIN_QUERY = `query($address: String!) {
      coin(address: $address) {
        ${COIN_FIELDS}
      }
    }`;
    const data = await queryFlap(COIN_QUERY, { address: req.params.address });
    if (data.coin) {
      const price = await fetchBnbPrice();
      const mapped = mapCoin(data.coin, price, "lookup");
      return res.json({ token: mapped, source: "live" });
    }
    res.json({ token: null });
  } catch (err) {
    console.error("Token lookup error:", err.message);
    res.json({ token: null, error: err.message });
  }
});

const FAQ_RESPONSES = {
  bonding: {
    patterns: [/how\s+does\s+bonding\s+work/i, /what\s+is\s+bonding/i, /bonding\s+curve/i, /bonding\s+on\s+flap/i, /how\s+bonding/i, /explain\s+bonding/i],
    reply: `Bonding on Flap.sh is a unique token launch mechanism that creates a fair and gradual price discovery process! Here's how it works:

🔗 **Bonding Curve Mechanism:**
- Tokens start at a very low price and increase algorithmically as more are bought
- The more tokens purchased, the higher the price goes
- Creates natural price appreciation based on demand

📈 **Graduation System:**
- Tokens "graduate" from bonding when they reach a certain market cap threshold
- Once graduated, they get listed on DEXs with liquidity
- This prevents rug pulls since liquidity is locked automatically

💧 **Liquidity Protection:**
- During bonding, there's no traditional liquidity pool that can be pulled
- Liquidity is only created upon graduation
- This makes launches much safer for investors

⚡ **Benefits:**
- Fair launch - no presales or insider advantages
- Anti-rug mechanism built-in
- Gradual price discovery
- Community-driven growth

The bonding percentage shows how close a token is to graduating. Once it hits 100%, it automatically graduates to full DEX trading with locked liquidity!

Want to see how a specific token is doing in its bonding phase? Just paste its contract address! 🚀`
  },
  flap: {
    patterns: [/what\s+is\s+flap/i, /what'?s\s+flap/i, /about\s+flap/i, /tell\s+me\s+about\s+flap/i, /explain\s+flap/i, /flap\.sh\s*\?/i],
    reply: `Flap.sh is a decentralized launchpad on the BNB Smart Chain (BSC) that allows users to create and trade tokens through a bonding curve mechanism.

Here's how it works:

🚀 **Token Creation:** Anyone can launch a token with just a few clicks
📈 **Bonding Curve:** Tokens start with a bonding curve pricing model where price increases as more tokens are bought
🎓 **Graduation:** When a token reaches a certain market cap threshold, it "graduates" and gets listed on PancakeSwap with liquidity
💧 **Liquidity:** Graduated tokens have their liquidity burned, making them safer investments
🔍 **Transparency:** All token data is on-chain and visible, including holder distribution and dev allocations

**Key Features:**
- Fair launch mechanism
- Anti-rug protection through bonding curves
- Automatic PancakeSwap listing for successful projects
- Built-in token explorer and analytics
- Social features and community building tools

The platform is designed to make token creation accessible while providing safety mechanisms to protect investors from common crypto scams like rug pulls.

Want to explore a specific token? Just paste its contract address and I'll show you all the details! 🫧`
  },
  graduation: {
    patterns: [/what\s+is\s+graduat/i, /how\s+does\s+graduat/i, /when\s+does?\s+.*graduat/i, /explain\s+graduat/i],
    reply: `**Graduation** is when a token on Flap.sh reaches its bonding target and "levels up" to full DEX trading!

📊 **How it works:**
- Each token starts with a bonding curve on Flap.sh
- As people buy, the reserve grows toward the **16 BNB target**
- The bonding percentage shows progress (e.g., "73%" means 73% of the way)
- At **100%**, the token automatically graduates!

🎓 **What happens at graduation:**
- Liquidity is automatically created on PancakeSwap
- The liquidity is **burned** (locked forever) — no rug pull possible
- Token becomes freely tradable on DEXs
- Price discovery moves to the open market

✅ **Why it matters:**
- Graduated tokens are generally safer — they have real liquidity
- The bonding phase acts as a filter for genuine community interest
- No team can pull liquidity after graduation

On Bubble Flap, graduated tokens appear on the **Bonding** page with a "Graduated" badge! 🏆`
  },
  help: {
    patterns: [/^help$/i, /what\s+can\s+you\s+do/i, /how\s+to\s+use/i, /^commands$/i],
    reply: `I'm **Bot Bubble Flap** 🫧 — your AI assistant for exploring BSC tokens on Flap.sh!

Here's what I can do:

🔍 **Token Analysis** — Paste any BSC contract address (0x...) and I'll show you detailed info including market cap, price, holders, dev hold %, tax, bonding status, and more

❓ **FAQ Answers** — Ask me about:
- "What is Flap.sh?"
- "How does bonding work?"
- "What is graduation?"

💬 **General Crypto Chat** — Ask me anything about DeFi, BSC, token mechanics, or trading concepts

**Quick tip:** Just paste a contract address like \`0x...\` to get started!`
  }
};

function matchFAQ(text) {
  for (const [, faq] of Object.entries(FAQ_RESPONSES)) {
    for (const pattern of faq.patterns) {
      if (pattern.test(text)) return faq.reply;
    }
  }
  return null;
}

app.post("/api/chat", async (req, res) => {
  const { messages, langInstruction } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array required" });
  }

  const lastMsg = messages[messages.length - 1]?.content || "";

  const faqReply = matchFAQ(lastMsg.trim());
  if (faqReply && !lastMsg.match(/0x[a-fA-F0-9]{40}/)) {
    return res.json({ reply: faqReply, model: "faq-cache", tokenData: null });
  }

  const caMatch = lastMsg.match(/0x[a-fA-F0-9]{40}/);
  let found = null;

  if (caMatch) {
    const addr = caMatch[0].toLowerCase();
    const tokens = await fetchFlapTokens();
    found = tokens.find((t) => t.address.toLowerCase() === addr);

    if (!found) {
      // Check graduated cache (covers listed/bonded tokens from Recent Bonding)
      found = graduatedCache.get(addr) || null;
    }

    if (!found) {
      try {
        const COIN_QUERY = `query($address: String!) {
          coin(address: $address) {
            ${COIN_FIELDS}
          }
        }`;
        const data = await queryFlap(COIN_QUERY, { address: caMatch[0] });
        if (data.coin) {
          const price = await fetchBnbPrice();
          found = mapCoin(data.coin, price, "lookup");
        }
      } catch (err) {
        console.error("Chat Flap.sh lookup error:", err.message);
      }
    }

    // Fallback to DexScreener if Flap.sh API fails or token not found
    if (!found) {
      try {
        const dexRes = await fetch(`https://api.dexscreener.com/tokens/v1/bsc/${caMatch[0]}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (dexRes.ok) {
          const dexData = await dexRes.json();
          const pairs = Array.isArray(dexData) ? dexData : dexData?.pairs || [];
          const pair = pairs.find(p => p.baseToken?.address?.toLowerCase() === addr) || pairs[0];
          if (pair) {
            const price = await fetchBnbPrice();
            found = {
              address: pair.baseToken?.address || caMatch[0],
              name: pair.baseToken?.name || '???',
              ticker: pair.baseToken?.symbol || '???',
              mcap: pair.marketCap || 0,
              mcapBnb: (pair.marketCap || 0) / (price || 1),
              price: parseFloat(pair.priceUsd) || 0,
              holders: 0,
              devHoldPercent: 0, burnPercent: 0, sniperHoldPercent: 0,
              taxRate: 0, beneficiary: null,
              bondingCurve: false, bondProgress: 100, reserveBnb: 0,
              graduated: true, listed: true,
              image: pair.info?.imageUrl || null,
              website: null, twitter: null, telegram: null,
              createdAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : null,
              description: null, dexPaid: pair.boosts?.active > 0,
              volume24h: pair.volume?.h24 || 0,
              liquidity: pair.liquidity?.usd || 0,
              change24h: pair.priceChange?.h24 || 0,
              dexUrl: pair.url || null,
            };
            console.log(`[CHAT] Found token via DexScreener: ${found.name}`);
          }
        }
      } catch (err) {
        console.error("Chat DexScreener lookup error:", err.message);
      }
    }
  }

  const wantsAnalysis = /analy[zs]/i.test(lastMsg);
  const isJustCA = caMatch && lastMsg.trim().replace(/0x[a-fA-F0-9]{40}/, '').trim().length < 5;

  if (caMatch && found && !wantsAnalysis && isJustCA) {
    const tokenData = {
      address: found.address, name: found.name, ticker: found.ticker,
      mcap: found.mcap, price: found.price, holders: found.holders,
      devHoldPercent: found.devHoldPercent, burnPercent: found.burnPercent,
      sniperHoldPercent: found.sniperHoldPercent,
      taxRate: found.taxRate, beneficiary: found.beneficiary,
      bondingCurve: found.bondingCurve, bondProgress: found.bondProgress,
      reserveBnb: found.reserveBnb, graduated: found.graduated, listed: found.listed,
      image: found.image, website: found.website, twitter: found.twitter,
      telegram: found.telegram, createdAt: found.createdAt,
      description: found.description, dexPaid: found.dexPaid,
    };
    const status = found.listed ? "Graduated" : found.bondingCurve ? `Bonding ${Math.round(found.bondProgress)}%` : "New";
    const reply = `**${found.name}** $${found.ticker}\n${status}${found.taxRate > 0 ? ` | ${found.taxRate}% Tax` : ""}`;
    return res.json({ reply, model: "direct-lookup", tokenData });
  }

  if (caMatch && !found) {
    return res.json({ reply: `Token not found for address \`${caMatch[0]}\`. It may not be on Flap.sh/BSC.`, model: "direct-lookup", tokenData: null });
  }

  const apiKey = await getOpenRouterKey();
  if (!apiKey) {
    return res.status(500).json({ error: "OpenRouter API key not configured" });
  }

  let tokenContext = "";
  if (found) {
    let ageStr = "Unknown";
    if (found.createdAt) {
      const diff = Date.now() - new Date(found.createdAt).getTime();
      if (diff > 0) {
        const secs = Math.floor(diff / 1000);
        if (secs < 60) ageStr = `${secs}s ago`;
        else if (secs < 3600) ageStr = `${Math.floor(secs / 60)}m ago`;
        else if (secs < 86400) ageStr = `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m ago`;
        else ageStr = `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h ago`;
      } else {
        ageStr = "Just now";
      }
    }
    tokenContext = `\n\nTOKEN DATA FOUND for ${caMatch[0]}:\n` +
      JSON.stringify({
        name: found.name, ticker: found.ticker, address: found.address,
        mcap: found.mcap, price: found.price, holders: found.holders,
        devHoldPercent: found.devHoldPercent, burnPercent: found.burnPercent,
        sniperHoldPercent: found.sniperHoldPercent,
        taxRate: found.taxRate, beneficiary: found.beneficiary,
        bondingCurve: found.bondingCurve, bondProgress: found.bondProgress,
        reserveBnb: found.reserveBnb, graduated: found.graduated, listed: found.listed,
        image: found.image, website: found.website, twitter: found.twitter,
        telegram: found.telegram, age: ageStr,
        description: found.description, dexPaid: found.dexPaid,
      }, null, 2) +
      `\nBuy link: https://flap.sh/bnb/${found.address}`;
  }

  const langRule = langInstruction ? langInstruction : "\nRespond in the same language the user uses.";

  const systemPrompt = `You are Bot Bubble Flap, an AI assistant for the Bubble Flap token visualizer on the BSC/BNB blockchain (Flap.sh launchpad).

Your job is to help users understand tokens on the Flap.sh platform.

When a user pastes a contract address (CA), you will receive token data. Present it in this EXACT format using this template:

**[TOKEN_NAME]** $[TICKER]
[BONDING_STATUS] | [TAX_INFO]

| Field | Value |
|-------|-------|
| MCap | $XX.XK |
| Price | $0.0000XXXX |
| Holders | XXX |
| Age | Use the pre-calculated "age" field exactly |
| Dev Hold | X.X% |
| Sniper | X.X% |
| Tax | X% |

**CA:** \`0x...full address\`
**Buy:** [Buy on Flap.sh](https://flap.sh/bnb/CONTRACT_ADDRESS)

[Show social links if available: Web, Twitter, TG]

Rules:
- Always show the buy link to flap.sh
- For bonding status: show "Bonding XX%" if bonding, "Graduated" if graduated/listed, "New" if neither
- Show tax rate and beneficiary if tax > 0
- Format mcap: use K for thousands, M for millions
- Format price with appropriate decimals
- IMPORTANT: Use the "age" field from the token data directly. Do NOT calculate age yourself.
- If dev hold > 20%, warn the user
- If sniper hold > 15%, warn the user
- Be friendly, concise, and helpful
- You can answer general crypto/DeFi questions too
- IMPORTANT: ${langRule}${tokenContext}`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://bubbleflap.com",
        "X-Title": "Bubble Flap Bot",
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.slice(-10),
        ],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenRouter error:", response.status, errText.slice(0, 300));
      return res.status(502).json({ error: "AI service error" });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Sorry, I couldn't process that.";
    const tokenData = (caMatch && found) ? {
      address: found.address,
      name: found.name,
      ticker: found.ticker,
      mcap: found.mcap,
      price: found.price,
      holders: found.holders,
      devHoldPercent: found.devHoldPercent,
      burnPercent: found.burnPercent,
      sniperHoldPercent: found.sniperHoldPercent,
      taxRate: found.taxRate,
      beneficiary: found.beneficiary,
      bondingCurve: found.bondingCurve,
      bondProgress: found.bondProgress,
      reserveBnb: found.reserveBnb,
      graduated: found.graduated,
      listed: found.listed,
      image: found.image,
      website: found.website,
      twitter: found.twitter,
      telegram: found.telegram,
      createdAt: found.createdAt,
      description: found.description,
      dexPaid: found.dexPaid,
    } : null;
    res.json({ reply, model: data.model, tokenData });
  } catch (err) {
    console.error("Chat error:", err.message);
    res.status(500).json({ error: "Failed to get AI response" });
  }
});

const FLAP_PORTAL_BSC = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const PANCAKE_V2_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const PANCAKE_V3_ROUTER = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4";
const WBNB_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";

const BSC_CURVE_R = 6.14;
const BSC_CURVE_H = 107036752;
const BSC_CURVE_K = 6797205657.28;
const BILLION = 1e9;

function flapQuoteBuy(inputBnb, reserveBnb, circulatingSupply) {
  const x = BILLION + BSC_CURVE_H - circulatingSupply;
  const y = reserveBnb;
  const k = BSC_CURVE_K;
  const r = BSC_CURVE_R;
  const newY = y + inputBnb;
  const newX = k / (newY + r);
  const tokensOut = x - newX;
  return Math.max(0, tokensOut);
}

function flapQuoteSell(tokenAmount, reserveBnb, circulatingSupply) {
  const x = BILLION + BSC_CURVE_H - circulatingSupply;
  const y = reserveBnb;
  const k = BSC_CURVE_K;
  const r = BSC_CURVE_R;
  const newX = x + tokenAmount;
  const newY = k / (newX) - r;
  const bnbOut = y - newY;
  return Math.max(0, bnbOut);
}

function flapGetPrice(reserveBnb, circulatingSupply) {
  const x = BILLION + BSC_CURVE_H - circulatingSupply;
  const r = BSC_CURVE_R;
  const k = BSC_CURVE_K;
  return k / ((x) * (x)) * (1);
}

app.get("/api/swap/quote", async (req, res) => {
  try {
    const { tokenAddress, inputAmount, direction } = req.query;
    if (!tokenAddress || !inputAmount || !direction) {
      return res.status(400).json({ error: "Missing tokenAddress, inputAmount, or direction (buy/sell)" });
    }

    const amount = parseFloat(inputAmount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Invalid inputAmount" });
    }

    await fetchBnbPrice();

    const allTokens = [...cachedNewTokens, ...cachedBondingTokens];
    const token = allTokens.find(t => t.address?.toLowerCase() === tokenAddress.toLowerCase());

    if (!token) {
      try {
        const WBNB_ADDR = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
        const PANCAKE_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
        const RPC_URL = "https://bsc-dataseed.binance.org/";

        const amountWei = BigInt(Math.floor(amount * 1e18));
        const path = direction === "buy"
          ? [WBNB_ADDR, tokenAddress]
          : [tokenAddress, WBNB_ADDR];

        const pathEncoded = path.map(a => a.replace("0x", "").padStart(64, "0")).join("");
        const callData = "0xd06ca61f" +
          amountWei.toString(16).padStart(64, "0") +
          "0000000000000000000000000000000000000000000000000000000000000040" +
          "0000000000000000000000000000000000000000000000000000000000000002" +
          pathEncoded;

        const rpcResp = await fetch(RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 1, method: "eth_call",
            params: [{ to: PANCAKE_ROUTER, data: callData }, "latest"]
          }),
        });
        const rpcData = await rpcResp.json();

        if (rpcData.result && rpcData.result !== "0x") {
          const hex = rpcData.result.slice(2);
          const outputHex = hex.slice(192, 256);
          const outputWei = BigInt("0x" + outputHex);
          const outputAmount = Number(outputWei) / 1e18;

          const currentPrice = direction === "buy"
            ? amount * bnbPrice / outputAmount
            : outputAmount * bnbPrice / amount;

          return res.json({
            router: "pancakeswap",
            routerName: "PancakeSwap V2",
            routerAddress: PANCAKE_ROUTER,
            tokenAddress,
            tokenName: tokenAddress,
            tokenTicker: "",
            tokenImage: "",
            direction,
            inputAmount: amount,
            outputAmount,
            currentPrice,
            currentPriceUsd: currentPrice,
            priceImpact: 0.5,
            fee: "0.25%",
            taxRate: "0%",
            bondProgress: 100,
            graduated: true,
            bnbPrice,
            mcap: 0,
          });
        }
      } catch (e) {
        console.error("PancakeSwap quote error:", e.message);
      }

      return res.json({
        router: "unknown",
        error: "Token not found. Try refreshing.",
        tokenAddress,
      });
    }

    const isGraduated = token.graduated || token.listed;
    const taxRate = token.taxRate || 0;

    if (!isGraduated) {
      const reserveBnb = token.reserveBnb || 0;
      const totalSupply = BILLION;
      const circulatingSupply = token.supply || (token.bondProgress ? (token.bondProgress / 100) * 800000000 : 0);

      let outputAmount, priceImpact, currentPrice;
      currentPrice = flapGetPrice(reserveBnb, circulatingSupply);

      if (direction === "buy") {
        const feeAmount = amount * 0.01;
        const netInput = amount - feeAmount;
        outputAmount = flapQuoteBuy(netInput, reserveBnb, circulatingSupply);
        const avgPrice = amount / outputAmount;
        priceImpact = Math.abs((avgPrice - currentPrice) / currentPrice) * 100;
      } else {
        outputAmount = flapQuoteSell(amount, reserveBnb, circulatingSupply);
        const feeAmount = outputAmount * 0.01;
        outputAmount = outputAmount - feeAmount;
        if (taxRate > 0) {
          outputAmount = outputAmount * (1 - taxRate / 10000);
        }
        const avgPrice = outputAmount / amount;
        priceImpact = Math.abs((currentPrice - avgPrice) / currentPrice) * 100;
      }

      return res.json({
        router: "flap",
        routerName: "Flap.sh Bonding Curve",
        routerAddress: FLAP_PORTAL_BSC,
        tokenAddress,
        tokenName: token.name || token.ticker,
        tokenTicker: token.ticker,
        tokenImage: token.image,
        direction,
        inputAmount: amount,
        outputAmount: Math.max(0, outputAmount),
        currentPrice,
        currentPriceUsd: currentPrice * bnbPrice,
        priceImpact: Math.min(priceImpact, 100),
        fee: "1%",
        taxRate: taxRate > 0 ? `${taxRate / 100}%` : "0%",
        bondProgress: token.bondProgress || 0,
        reserveBnb,
        graduated: false,
        bnbPrice,
        mcap: token.mcap,
      });
    } else {
      const WBNB_ADDR = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
      const PANCAKE_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
      const RPC_URL = "https://bsc-dataseed.binance.org/";

      let outputAmount;
      let routerUsed = taxRate > 0 ? "pancakeswap_v2" : "pancakeswap_v3";
      let routerAddress = taxRate > 0 ? PANCAKE_V2_ROUTER : PANCAKE_V3_ROUTER;
      let routerName = taxRate > 0 ? "PancakeSwap V2" : "PancakeSwap V3";

      try {
        const amountWei = BigInt(Math.floor(amount * 1e18));
        const path = direction === "buy"
          ? [WBNB_ADDR, tokenAddress]
          : [tokenAddress, WBNB_ADDR];
        const pathEncoded = path.map(a => a.replace("0x", "").padStart(64, "0")).join("");
        const callData = "0xd06ca61f" +
          amountWei.toString(16).padStart(64, "0") +
          "0000000000000000000000000000000000000000000000000000000000000040" +
          "0000000000000000000000000000000000000000000000000000000000000002" +
          pathEncoded;

        const rpcResp = await fetch(RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 1, method: "eth_call",
            params: [{ to: PANCAKE_ROUTER, data: callData }, "latest"]
          }),
        });
        const rpcData = await rpcResp.json();

        if (rpcData.result && rpcData.result !== "0x") {
          const hex = rpcData.result.slice(2);
          const outputHex = hex.slice(192, 256);
          const outputWei = BigInt("0x" + outputHex);
          outputAmount = Number(outputWei) / 1e18;
          routerUsed = "pancakeswap";
          routerAddress = PANCAKE_ROUTER;
          routerName = "PancakeSwap V2";
        }
      } catch (e) {
        console.error("PancakeSwap on-chain quote error:", e.message);
      }

      if (!outputAmount) {
        const tokenPrice = token.price || 0;
        if (direction === "buy") {
          outputAmount = tokenPrice > 0 ? (amount * bnbPrice) / tokenPrice : 0;
        } else {
          outputAmount = tokenPrice > 0 ? (amount * tokenPrice) / bnbPrice : 0;
        }
      }

      const tokenPrice = token.price || 0;

      return res.json({
        router: routerUsed,
        routerName,
        routerAddress,
        tokenAddress,
        tokenName: token.name || token.ticker,
        tokenTicker: token.ticker,
        tokenImage: token.image,
        direction,
        inputAmount: amount,
        outputAmount,
        currentPrice: tokenPrice,
        currentPriceUsd: tokenPrice,
        priceImpact: amount > 1 ? 0.5 : 0.1,
        fee: "0.25%",
        taxRate: taxRate > 0 ? `${taxRate / 100}%` : "0%",
        bondProgress: 100,
        graduated: true,
        bnbPrice,
        mcap: token.mcap,
      });
    }
  } catch (err) {
    console.error("Swap quote error:", err.message);
    res.status(500).json({ error: "Failed to get swap quote" });
  }
});

const LOTTERY_SEGMENTS = [
  { id: "try_again",   title: "Try Again",    dropRate: 30, prize: 0,     bnbPrize: 0 },
  { id: "bnb_002",     title: "0.02 BNB",     dropRate: 2,  prize: 0,     bnbPrize: 0.02 },
  { id: "bflap_500",   title: "500 BFLAP",    dropRate: 8,  prize: 500,   bnbPrize: 0 },
  { id: "usd_010",     title: "$0.10",         dropRate: 20, prize: 0.1,   bnbPrize: 0 },
  { id: "bnb_001",     title: "0.01 BNB",     dropRate: 3,  prize: 0,     bnbPrize: 0.01 },
  { id: "bflap_3k",    title: "3000 BFLAP",   dropRate: 5,  prize: 3000,  bnbPrize: 0 },
  { id: "try_again_2", title: "Try Again",    dropRate: 15, prize: 0,     bnbPrize: 0 },
  { id: "bnb_0005",    title: "0.005 BNB",    dropRate: 5,  prize: 0,     bnbPrize: 0.005 },
  { id: "usd_050",     title: "$0.50",         dropRate: 12, prize: 0.5,   bnbPrize: 0 },
  { id: "bflap_1k",    title: "1000 BFLAP",   dropRate: 7,  prize: 1000,  bnbPrize: 0 },
  { id: "bnb_0003",    title: "0.003 BNB",    dropRate: 8,  prize: 0,     bnbPrize: 0.003 },
  { id: "try_again_3", title: "Try Again",    dropRate: 15, prize: 0,     bnbPrize: 0 },
  { id: "bflap_10k",   title: "10000 BFLAP",  dropRate: 5,  prize: 10000, bnbPrize: 0 },
  { id: "usd_100",     title: "$1.00",         dropRate: 8,  prize: 1,     bnbPrize: 0 },
  { id: "bnb_01",      title: "0.1 BNB",      dropRate: 0.4,  prize: 0,     bnbPrize: 0.1 },
  { id: "bflap_50k",   title: "50000 BFLAP",  dropRate: 5,  prize: 50000, bnbPrize: 0 },
  { id: "usd_1000",    title: "$10.00",        dropRate: 6,  prize: 10,    bnbPrize: 0 },
  { id: "free_spin",   title: "Free Spin 2x", dropRate: 12, prize: -2,    bnbPrize: 0 },
];

const TIER_CONFIG = {
  '049': { price: 0.49, multiplier: 0.5,  jackpotBnb: 0.05, jackpotUsd: 5,  col: 'purchased_spins_049' },
  '099': { price: 0.99, multiplier: 1.0,  jackpotBnb: 0.10, jackpotUsd: 10, col: 'purchased_spins' },
  '150': { price: 1.50, multiplier: 1.5,  jackpotBnb: 0.15, jackpotUsd: 15, col: 'purchased_spins_150' },
};

let lotteryRTP = 60;
async function loadLotteryRTP() {
  try {
    const r = await pool.query("SELECT value FROM lottery_settings WHERE key='rtp'");
    if (r.rows.length > 0) lotteryRTP = Math.max(1, Math.min(100, parseFloat(r.rows[0].value) || 100));
    console.log(`[Lottery] RTP loaded: ${lotteryRTP}%`);
  } catch (e) { console.error('[Lottery] RTP load error:', e.message); }
}

function getLotteryIpHash(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || "unknown";
  return crypto.createHash('sha256').update(ip).digest('hex');
}

app.get("/api/lottery/stats", async (req, res) => {
  try {
    const wallet = (req.query.wallet || '').toLowerCase().trim();
    if (!wallet || !wallet.startsWith('0x') || wallet.length !== 42) {
      return res.json({ spinsLeft: 0, spinsLeft049: 0, spinsLeft099: 0, spinsLeft150: 0, totalWon: 0, bflapWon: 0, bnbWon: 0, spinsToday: 0, freeLeft: 0, purchasedRemaining: 0, withdrawnUsdt: 0, withdrawnBflap: 0, withdrawnBnb: 0, totalPurchasedSpins: 0, totalSpentBnb: 0 });
    }
    const [spinsRow, walletRow, purchaseRow] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM lottery_spins WHERE wallet_address=$1 AND created_at::date=CURRENT_DATE", [wallet]),
      pool.query("SELECT purchased_spins, purchased_spins_049, purchased_spins_150, total_won, total_bflap_won, total_bnb_won, withdrawn_usdt, withdrawn_bflap, withdrawn_bnb FROM lottery_wallets WHERE wallet_address=$1", [wallet]),
      pool.query(`SELECT
        COALESCE(SUM(quantity),0) as total_spins,
        COALESCE(SUM(CASE WHEN currency='bnb' THEN CAST(amount_paid AS NUMERIC)/1e18 ELSE 0 END),0) as spent_bnb,
        COALESCE(SUM(CASE WHEN currency='usdt' THEN CAST(amount_paid AS NUMERIC)/1e18 ELSE 0 END),0) as spent_usdt,
        COALESCE(SUM(CASE WHEN currency='bflap' THEN CAST(amount_paid AS NUMERIC)/1e18 ELSE 0 END),0) as spent_bflap
        FROM lottery_purchases WHERE wallet_address=$1`, [wallet]),
    ]);
    const spinsToday = parseInt(spinsRow.rows[0].count, 10);
    const spinsLeft099 = parseInt(walletRow.rows[0]?.purchased_spins || 0, 10);
    const spinsLeft049 = parseInt(walletRow.rows[0]?.purchased_spins_049 || 0, 10);
    const spinsLeft150 = parseInt(walletRow.rows[0]?.purchased_spins_150 || 0, 10);
    const totalWon = parseFloat(walletRow.rows[0]?.total_won || 0);
    const bflapWon = parseInt(walletRow.rows[0]?.total_bflap_won || 0, 10);
    const bnbWon = parseFloat(walletRow.rows[0]?.total_bnb_won || 0);
    const withdrawnUsdt = parseFloat(walletRow.rows[0]?.withdrawn_usdt || 0);
    const withdrawnBflap = parseInt(walletRow.rows[0]?.withdrawn_bflap || 0, 10);
    const withdrawnBnb = parseFloat(walletRow.rows[0]?.withdrawn_bnb || 0);
    const totalPurchasedSpins = parseInt(purchaseRow.rows[0]?.total_spins || 0, 10);
    const totalSpentBnb = parseFloat(purchaseRow.rows[0]?.spent_bnb || 0);
    const totalSpentUsdt = parseFloat(purchaseRow.rows[0]?.spent_usdt || 0);
    const totalSpentBflap = parseFloat(purchaseRow.rows[0]?.spent_bflap || 0);
    const wToken = crypto.randomBytes(20).toString('hex');
    withdrawTokens.set(wToken, { wallet, expiresAt: Date.now() + 10 * 60 * 1000 });
    res.json({ spinsLeft: spinsLeft099, spinsLeft049, spinsLeft099, spinsLeft150, totalWon, bflapWon, bnbWon, spinsToday, freeLeft: 0, purchasedRemaining: spinsLeft099, withdrawnUsdt, withdrawnBflap, withdrawnBnb, totalPurchasedSpins, totalSpentBnb, totalSpentUsdt, totalSpentBflap, withdrawToken: wToken });
  } catch (e) { console.error("Lottery stats:", e.message); res.status(500).json({ error: "Stats failed" }); }
});

app.post("/api/lottery/spin", async (req, res) => {
  try {
    const wallet = (req.body?.wallet || '').toLowerCase().trim();
    if (!wallet || !wallet.startsWith('0x') || wallet.length !== 42) {
      return res.status(401).json({ error: "Wallet not connected" });
    }
    const tierKey = ['049','099','150'].includes(req.body?.tier) ? req.body.tier : '099';
    const tierCfg = TIER_CONFIG[tierKey];
    const walletRow = await pool.query(
      `SELECT purchased_spins, purchased_spins_049, purchased_spins_150, total_won, total_bflap_won, total_bnb_won FROM lottery_wallets WHERE wallet_address=$1`,
      [wallet]
    );
    const purchased = parseInt(walletRow.rows[0]?.[tierCfg.col] || 0, 10);
    if (purchased === 0) return res.status(429).json({ error: "No spins left. Purchase spins to continue." });

    const ZONK_IDS = new Set(['try_again', 'try_again_2', 'try_again_3']);

    // ── STEP 1: Budget gates (global + per-player) ──────────────────────────
    let globalBudgetUsed = 0;
    let playerBudgetUsed = 0;
    try {
      const [revRow, paidRow, playerRevRow] = await Promise.all([
        pool.query(`SELECT COALESCE(SUM(CASE tier WHEN '049' THEN quantity*0.49 WHEN '150' THEN quantity*1.50 ELSE quantity*0.99 END),0) as rev FROM lottery_purchases`),
        pool.query(`SELECT COALESCE(SUM(total_won),0) as usd, COALESCE(SUM(total_bnb_won),0) as bnb, COALESCE(SUM(total_bflap_won),0) as bflap FROM lottery_wallets`),
        pool.query(`SELECT COALESCE(SUM(CASE tier WHEN '049' THEN quantity*0.49 WHEN '150' THEN quantity*1.50 ELSE quantity*0.99 END),0) as rev FROM lottery_purchases WHERE wallet_address=$1`, [wallet]),
      ]);
      const [liveBnb, liveBflap] = await Promise.all([fetchBnbPrice(), fetchBflapPrice()]);

      const totalRevenue = parseFloat(revRow.rows[0].rev) || 0;
      if (totalRevenue > 0) {
        const totalPaid = parseFloat(paidRow.rows[0].usd)
          + parseFloat(paidRow.rows[0].bnb) * liveBnb
          + parseFloat(paidRow.rows[0].bflap) * liveBflap;
        globalBudgetUsed = lotteryRTP > 0 ? (totalPaid / totalRevenue * 100) / lotteryRTP : 1;
      }

      const playerRevenue = parseFloat(playerRevRow.rows[0].rev) || 0;
      if (playerRevenue > 0) {
        const playerPaid = parseFloat(walletRow.rows[0]?.total_won || 0)
          + parseFloat(walletRow.rows[0]?.total_bnb_won || 0) * liveBnb
          + parseInt(walletRow.rows[0]?.total_bflap_won || 0, 10) * liveBflap;
        playerBudgetUsed = lotteryRTP > 0 ? (playerPaid / playerRevenue * 100) / lotteryRTP : 1;
      }

      console.log(`[Lottery] Budget: global=${(globalBudgetUsed*100).toFixed(0)}% player=${(playerBudgetUsed*100).toFixed(0)}% RTP=${lotteryRTP}%`);
    } catch(e) { console.error('[Lottery] P&L error:', e.message); }

    const budgetUsed = Math.max(globalBudgetUsed, playerBudgetUsed);

    // ── STEP 2: 3-category spin outcome ────────────────────────────────────
    // WIN_NORMAL → any prize including high prizes & jackpot
    // WIN_SMALL  → small consolation prizes only
    // ZONK       → no prize
    //
    // Total win probability = exactly lotteryRTP/100.
    // As budget fills: WIN_NORMAL → WIN_SMALL → ZONK.
    const base = lotteryRTP / 100;
    let normalChance = 0;
    let smallChance  = 0;

    if (budgetUsed < 0.75) {
      const normalFraction = 1 - budgetUsed / 0.75;
      normalChance = base * normalFraction;
      smallChance  = base * (1 - normalFraction);
    } else if (budgetUsed < 1.0) {
      normalChance = 0;
      smallChance  = base * (1.0 - budgetUsed) / 0.25;
    }

    let spinOutcome;
    const r = Math.random();
    if (r < normalChance) spinOutcome = 'WIN_NORMAL';
    else if (r < normalChance + smallChance) spinOutcome = 'WIN_SMALL';
    else spinOutcome = 'ZONK';

    console.log(`[Lottery] Decision: ${spinOutcome} normalC=${(normalChance*100).toFixed(1)}% smallC=${(smallChance*100).toFixed(1)}% budget=${(budgetUsed*100).toFixed(0)}% RTP=${lotteryRTP}%`);

    // ── STEP 3: Anti-zonk + global spin count gate ─────────────────────────
    // Anti-zonk: forces WIN_SMALL if last 2 spins for this player were ZONKs
    // Big-prize gate: prizes ≥$10 locked until 150 global spins have been played
    const [recentRows, globalCountRow] = await Promise.all([
      pool.query(
        "SELECT segment_id FROM lottery_spins WHERE wallet_address=$1 AND tier=$2 ORDER BY created_at DESC LIMIT 2",
        [wallet, tierKey]
      ),
      pool.query("SELECT COUNT(*) as cnt FROM lottery_spins")
    ]);
    const globalSpins       = parseInt(globalCountRow.rows[0].cnt, 10) || 0;
    const bigPrizesUnlocked = globalSpins >= 150;

    const recentHadZonk = recentRows.rows.some(r => ZONK_IDS.has(r.segment_id));
    if (spinOutcome === 'ZONK' && recentHadZonk) {
      spinOutcome = 'WIN_SMALL';
      console.log(`[Lottery] Anti-zonk: forced WIN_SMALL for ${wallet.slice(0,8)} tier=${tierKey}`);
    }
    if (spinOutcome === 'WIN_NORMAL' && !bigPrizesUnlocked) {
      spinOutcome = 'WIN_SMALL';
      console.log(`[Lottery] Big-prize gate: ${globalSpins}/150 global spins — forced WIN_SMALL`);
    }

    // ── STEP 4: Pick segment from the correct pool ─────────────────────────
    // NORMAL pool → all non-zonk prizes including $10+ (unlocked after 150 global spins)
    // SMALL pool  → small consolation prizes only (< ~$1)
    // ZONK pool   → try-again segments only
    const SMALL_IDS = new Set(['usd_010', 'usd_050', 'bflap_500', 'bflap_1k', 'bnb_0003', 'bnb_0005', 'free_spin']);
    const indexed = LOTTERY_SEGMENTS.map((s, i) => ({ s, i }));
    const normalPool = indexed.filter(({ s }) => !ZONK_IDS.has(s.id));
    const smallPool  = indexed.filter(({ s }) => SMALL_IDS.has(s.id));
    const zonkPool   = indexed.filter(({ s }) => ZONK_IDS.has(s.id));

    let pool2;
    if (spinOutcome === 'WIN_NORMAL') pool2 = normalPool;
    else if (spinOutcome === 'WIN_SMALL') pool2 = smallPool;
    else pool2 = zonkPool;

    const isWinSpin = spinOutcome !== 'ZONK';
    console.log(`[Lottery] ${spinOutcome} pool(${pool2.length}) globalSpins=${globalSpins} bigUnlocked=${bigPrizesUnlocked} wallet=${wallet.slice(0,8)} budget=${(budgetUsed*100).toFixed(0)}%`);
    const totalWeight = pool2.reduce((acc, { s }) => acc + s.dropRate, 0);
    let rand = Math.random() * totalWeight;
    let chosen = pool2[pool2.length - 1];
    for (const entry of pool2) { rand -= entry.s.dropRate; if (rand <= 0) { chosen = entry; break; } }
    let winIdx = chosen.i;
    let winner = chosen.s;

    const m = tierCfg.multiplier;
    const usdWon = (winner.prize > 0 && winner.prize <= 100) ? parseFloat((winner.prize * m).toFixed(4)) : 0;
    const bflapWon = (winner.prize > 100) ? Math.floor(winner.prize * m) : 0;
    let bnbWon = winner.bnbPrize > 0 ? parseFloat((winner.bnbPrize * m).toFixed(8)) : 0;
    const isFreeSpinBonus = winner.prize === -2;
    const ipHash = 'w:' + wallet;

    await pool.query("INSERT INTO lottery_spins (ip_hash, wallet_address, segment_id, title, prize, display, tier, is_win) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [ipHash, wallet, winner.id, winner.title, winner.prize, winner.title, tierKey, isWinSpin]);

    const afterDeduct = purchased - 1;
    const bonusPurchased = isFreeSpinBonus ? afterDeduct + 2 : afterDeduct;
    const prevWon = parseFloat(walletRow.rows[0]?.total_won || 0);
    const newWon = (prevWon + usdWon).toFixed(4);
    const newBflap = parseInt(walletRow.rows[0]?.total_bflap_won || 0, 10) + bflapWon;
    const newBnb = (parseFloat(walletRow.rows[0]?.total_bnb_won || 0) + bnbWon).toFixed(8);

    await pool.query(
      `INSERT INTO lottery_wallets (ip_hash, wallet_address, ${tierCfg.col}, total_won, total_bflap_won, total_bnb_won)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (wallet_address) DO UPDATE SET ${tierCfg.col}=$3, total_won=$4, total_bflap_won=$5, total_bnb_won=$6, updated_at=NOW()`,
      [ipHash, wallet, bonusPurchased, newWon, newBflap, newBnb]);

    console.log(`[Lottery] ${winner.id} tier=${tierKey} wallet=${wallet} spinsLeft=${bonusPurchased}`);
    res.json({ segmentIndex: winIdx, id: winner.id, title: winner.title, prize: winner.prize, tier: tierKey, spinsLeft: bonusPurchased, freeLeft: 0, purchasedRemaining: bonusPurchased, totalWon: parseFloat(newWon), bflapWon: newBflap, bnbWon: parseFloat(newBnb), jackpotWin: false });
  } catch (e) { console.error("Lottery spin:", e.message); res.status(500).json({ error: "Spin failed" }); }
});

app.get("/api/lottery/history", async (req, res) => {
  try {
    const wallet = (req.query.wallet || '').toLowerCase().trim();
    if (!wallet || !wallet.startsWith('0x') || wallet.length !== 42) return res.json([]);
    const r = await pool.query("SELECT title, prize, created_at FROM lottery_spins WHERE wallet_address=$1 ORDER BY created_at DESC LIMIT 20", [wallet]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: "History failed" }); }
});


app.get("/api/lottery/winners", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT w.ip_hash, w.total_won, w.total_bflap_won, w.total_bnb_won,
        (SELECT ls.title FROM lottery_spins ls WHERE ls.ip_hash=w.ip_hash
          AND ls.segment_id NOT IN ('try_again','try_again_2','try_again_3','free_spin')
          ORDER BY CASE WHEN ls.segment_id='bnb_01'   THEN 999999
                        WHEN ls.segment_id='bnb_002'  THEN 200000
                        WHEN ls.segment_id='bnb_001'  THEN 100000
                        WHEN ls.segment_id='bnb_0005' THEN 50000
                        WHEN ls.segment_id='bnb_0003' THEN 30000
                        WHEN ls.prize > 100 THEN ls.prize
                        ELSE ls.prize * 10000 END DESC LIMIT 1) as best_prize
      FROM lottery_wallets w
      WHERE w.total_won > 0 OR w.total_bflap_won > 0 OR w.total_bnb_won > 0
      ORDER BY w.total_won DESC, w.total_bflap_won DESC LIMIT 10
    `);
    res.json(r.rows.map(row => ({
      user: '...' + row.ip_hash.slice(-6),
      totalWon: parseFloat(row.total_won),
      totalBflap: parseInt(row.total_bflap_won || 0, 10),
      totalBnb: parseFloat(row.total_bnb_won || 0),
      bestPrize: row.best_prize,
    })));
  } catch (e) { res.status(500).json({ error: "Winners failed" }); }
});

app.get("/api/lottery/jackpot-pool", async (req, res) => {
  try {
    const JACKPOT_THRESHOLD = 150;
    const counterRes = await pool.query("SELECT total_purchases_049, total_purchases_099, total_purchases_150 FROM jackpot_counter WHERE id=1");
    const row = counterRes.rows[0] || {};
    const buys049 = parseInt(row.total_purchases_049 || 0, 10);
    const buys099 = parseInt(row.total_purchases_099 || 0, 10);
    const buys150 = parseInt(row.total_purchases_150 || 0, 10);
    const until049 = JACKPOT_THRESHOLD - (buys049 % JACKPOT_THRESHOLD || JACKPOT_THRESHOLD);
    const until099 = JACKPOT_THRESHOLD - (buys099 % JACKPOT_THRESHOLD || JACKPOT_THRESHOLD);
    const until150 = JACKPOT_THRESHOLD - (buys150 % JACKPOT_THRESHOLD || JACKPOT_THRESHOLD);
    const lastWinner = await pool.query(`SELECT wallet_address, bnb_amount, created_at FROM jackpot_winners ORDER BY created_at DESC LIMIT 1`);
    res.json({ poolSize: JACKPOT_THRESHOLD, tiers: { '049': { buys: buys049, until: until049, jackpotBnb: 0.05, jackpotUsd: 5 }, '099': { buys: buys099, until: until099, jackpotBnb: 0.10, jackpotUsd: 10 }, '150': { buys: buys150, until: until150, jackpotBnb: 0.15, jackpotUsd: 15 } }, highRtp: lotteryRTP >= 75, lastWinner: lastWinner.rows[0] || null });
  } catch (e) { res.status(500).json({ error: "Jackpot pool fetch failed" }); }
});

app.get("/api/dev88/rtp", requireAdminPassword, (req, res) => {
  res.json({ rtp: lotteryRTP });
});

app.post("/api/dev88/rtp", requireAdminPassword, async (req, res) => {
  try {
    const rtp = Math.max(1, Math.min(100, parseFloat(req.body?.rtp) || 100));
    await pool.query(`INSERT INTO lottery_settings (key, value, updated_at) VALUES ('rtp', $1, NOW()) ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`, [String(rtp)]);
    lotteryRTP = rtp;
    console.log(`[Lottery] RTP updated to ${rtp}%`);
    res.json({ ok: true, rtp });
  } catch (e) { res.status(500).json({ error: "RTP save failed" }); }
});

app.post("/api/dev88/add-spins", requireAdminPassword, async (req, res) => {
  try {
    const wallet = (req.body?.wallet || '').toLowerCase().trim();
    const tierKey = ['049','099','150'].includes(req.body?.tier) ? req.body.tier : '099';
    const qty = Math.max(1, Math.min(500, parseInt(req.body?.qty) || 1));
    if (!wallet || !wallet.startsWith('0x') || wallet.length !== 42)
      return res.status(400).json({ error: 'Invalid wallet address' });
    const tierCfg = TIER_CONFIG[tierKey];
    const ipHash = 'admin:manual';
    await pool.query(
      `INSERT INTO lottery_wallets (ip_hash, wallet_address, ${tierCfg.col}, total_won, total_bflap_won, total_bnb_won)
       VALUES ($1,$2,$3,0,0,0)
       ON CONFLICT (wallet_address) DO UPDATE SET ${tierCfg.col}=lottery_wallets.${tierCfg.col}+$3, updated_at=NOW()`,
      [ipHash, wallet, qty]
    );
    const row = await pool.query(`SELECT ${tierCfg.col} as bal FROM lottery_wallets WHERE wallet_address=$1`, [wallet]);
    const newBal = parseInt(row.rows[0]?.bal || qty, 10);
    console.log(`[Admin] Added ${qty} spins (tier=${tierKey}) to ${wallet} → balance=${newBal}`);
    res.json({ ok: true, wallet, tier: tierKey, qty, newBalance: newBal });
  } catch (e) { res.status(500).json({ error: 'Add spins failed: ' + e.message }); }
});

app.post("/api/dev88/add-spins-bulk", requireAdminPassword, async (req, res) => {
  try {
    const raw = (req.body?.wallets || '');
    const wallets = (Array.isArray(raw) ? raw : raw.split(/[\n,]+/))
      .map(w => w.trim().toLowerCase())
      .filter(w => w.startsWith('0x') && w.length === 42);
    const tierKey = ['049','099','150'].includes(req.body?.tier) ? req.body.tier : '099';
    const qty = Math.max(1, Math.min(500, parseInt(req.body?.qty) || 1));
    if (!wallets.length) return res.status(400).json({ error: 'No valid wallet addresses found' });
    const tierCfg = TIER_CONFIG[tierKey];
    const results = [];
    for (const wallet of wallets) {
      await pool.query(
        `INSERT INTO lottery_wallets (ip_hash, wallet_address, ${tierCfg.col}, total_won, total_bflap_won, total_bnb_won)
         VALUES ($1,$2,$3,0,0,0)
         ON CONFLICT (wallet_address) DO UPDATE SET ${tierCfg.col}=lottery_wallets.${tierCfg.col}+$3, updated_at=NOW()`,
        ['admin:bulk', wallet, qty]
      );
      results.push(wallet);
    }
    console.log(`[Admin] Bulk added ${qty} spins (tier=${tierKey}) to ${results.length} wallets`);
    res.json({ ok: true, tier: tierKey, qty, count: results.length, wallets: results });
  } catch (e) { res.status(500).json({ error: 'Bulk add spins failed: ' + e.message }); }
});

app.post("/api/dev88/lottery-ban", requireAdminPassword, async (req, res) => {
  try {
    const wallet = (req.body?.wallet || '').toLowerCase().trim();
    const field  = req.body?.field === 'deposit_banned' ? 'deposit_banned' : 'wd_banned';
    const ban    = req.body?.ban !== false;
    if (!wallet || !wallet.startsWith('0x') || wallet.length !== 42)
      return res.status(400).json({ error: 'Invalid wallet address' });
    await pool.query(
      `INSERT INTO lottery_bans (wallet_address, ${field})
       VALUES ($1, $2)
       ON CONFLICT (wallet_address) DO UPDATE SET ${field}=$2, updated_at=NOW()`,
      [wallet, ban]
    );
    console.log(`[Admin] Lottery ${field} ${ban ? 'BANNED' : 'UNBANNED'}: ${wallet}`);
    res.json({ ok: true, wallet, field, banned: ban });
  } catch (e) { res.status(500).json({ error: 'Ban failed: ' + e.message }); }
});

app.get("/api/dev88/lottery-users", requireAdminPassword, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        w.wallet_address,
        COALESCE(w.purchased_spins_049, 0) as spins_left_049,
        COALESCE(w.purchased_spins, 0)     as spins_left_099,
        COALESCE(w.purchased_spins_150, 0) as spins_left_150,
        (COALESCE(w.purchased_spins_049,0) + COALESCE(w.purchased_spins,0) + COALESCE(w.purchased_spins_150,0)) as total_spins_left,
        w.total_won as total_won_usd,
        w.total_bflap_won,
        w.total_bnb_won,
        COALESCE(w.withdrawn_usdt, 0) as withdrawn_usdt,
        COALESCE(w.withdrawn_bflap, 0) as withdrawn_bflap,
        COALESCE(w.withdrawn_bnb, 0) as withdrawn_bnb,
        w.updated_at as last_active,
        COALESCE(p049.qty, 0) as bought_049,
        COALESCE(p099.qty, 0) as bought_099,
        COALESCE(p150.qty, 0) as bought_150,
        (COALESCE(p049.qty,0) + COALESCE(p099.qty,0) + COALESCE(p150.qty,0)) as total_spins_bought,
        (COALESCE(p049.qty,0)*0.49 + COALESCE(p099.qty,0)*0.99 + COALESCE(p150.qty,0)*1.50) as total_spent_usd,
        COALESCE(b.wd_banned, FALSE) as wd_banned,
        COALESCE(b.deposit_banned, FALSE) as deposit_banned
      FROM lottery_wallets w
      LEFT JOIN lottery_bans b ON b.wallet_address=w.wallet_address
      LEFT JOIN (SELECT wallet_address, SUM(quantity) as qty FROM lottery_purchases WHERE tier='049' GROUP BY wallet_address) p049 ON p049.wallet_address=w.wallet_address
      LEFT JOIN (SELECT wallet_address, SUM(quantity) as qty FROM lottery_purchases WHERE tier='099' OR tier IS NULL GROUP BY wallet_address) p099 ON p099.wallet_address=w.wallet_address
      LEFT JOIN (SELECT wallet_address, SUM(quantity) as qty FROM lottery_purchases WHERE tier='150' GROUP BY wallet_address) p150 ON p150.wallet_address=w.wallet_address
      ORDER BY w.updated_at DESC LIMIT 200
    `);
    const [liveBnb, liveBflap] = await Promise.all([fetchBnbPrice(), fetchBflapPrice()]);

    // Platform-level P&L summary
    const [depRow, wonRow, wdRow] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(CASE tier WHEN '049' THEN quantity*0.49 WHEN '150' THEN quantity*1.50 ELSE quantity*0.99 END),0) as total FROM lottery_purchases`),
      pool.query(`SELECT COALESCE(SUM(total_won),0) as usd, COALESCE(SUM(total_bnb_won),0) as bnb, COALESCE(SUM(total_bflap_won),0) as bflap FROM lottery_wallets`),
      pool.query(`SELECT COALESCE(SUM(withdrawn_usdt),0) as usd, COALESCE(SUM(withdrawn_bnb),0) as bnb, COALESCE(SUM(withdrawn_bflap),0) as bflap FROM lottery_wallets`)
    ]);
    const totalDeposits  = parseFloat(depRow.rows[0].total) || 0;
    const wonUsd         = parseFloat(wonRow.rows[0].usd)   || 0;
    const wonBnb         = parseFloat(wonRow.rows[0].bnb)   || 0;
    const wonBflap       = parseInt(wonRow.rows[0].bflap, 10) || 0;
    const totalWonInUsd  = wonUsd + wonBnb * liveBnb + wonBflap * liveBflap;
    const wdUsd          = parseFloat(wdRow.rows[0].usd)    || 0;
    const wdBnb          = parseFloat(wdRow.rows[0].bnb)    || 0;
    const wdBflap        = parseInt(wdRow.rows[0].bflap, 10) || 0;
    const totalWdInUsd   = wdUsd + wdBnb * liveBnb + wdBflap * liveBflap;

    const platform = {
      totalDeposits,
      totalWonInUsd,
      totalWonUsd:    wonUsd,
      totalWonBnb:    wonBnb,
      totalWonBflap:  wonBflap,
      totalWdInUsd,
      totalWdUsd:     wdUsd,
      totalWdBnb:     wdBnb,
      totalWdBflap:   wdBflap,
      platformPnl:    totalDeposits - totalWonInUsd,
      platformCashPnl: totalDeposits - totalWdInUsd,
    };

    res.json({ users: r.rows, bnbPrice: liveBnb, bflapPrice: liveBflap, platform });
  } catch (e) { res.status(500).json({ error: "Lottery users failed" }); }
});

app.get("/api/dev88/partners", requireAdminPassword, async (req, res) => {
  try {
    const r = await pool.query('SELECT address, name, created_at FROM partner_tokens ORDER BY created_at ASC');
    res.json({ partners: r.rows });
  } catch (e) { res.status(500).json({ error: "Failed to load partners" }); }
});

app.post("/api/dev88/partners", requireAdminPassword, async (req, res) => {
  try {
    const address = (req.body?.address || '').toLowerCase().trim();
    const name = (req.body?.name || '').trim().slice(0, 100);
    if (!address || !address.startsWith('0x') || address.length !== 42) {
      return res.status(400).json({ error: "Invalid address" });
    }
    await pool.query(
      'INSERT INTO partner_tokens (address, name) VALUES ($1, $2) ON CONFLICT (address) DO UPDATE SET name=$2',
      [address, name]
    );
    await loadPartnerTokens();
    const r = await pool.query('SELECT address, name, created_at FROM partner_tokens ORDER BY created_at ASC');
    res.json({ ok: true, partners: r.rows });
  } catch (e) { res.status(500).json({ error: "Failed to add partner" }); }
});

app.delete("/api/dev88/partners/:address", requireAdminPassword, async (req, res) => {
  try {
    const address = (req.params.address || '').toLowerCase().trim();
    await pool.query('DELETE FROM partner_tokens WHERE address=$1', [address]);
    await loadPartnerTokens();
    const r = await pool.query('SELECT address, name, created_at FROM partner_tokens ORDER BY created_at ASC');
    res.json({ ok: true, partners: r.rows });
  } catch (e) { res.status(500).json({ error: "Failed to remove partner" }); }
});

// ── PAGE VISIBILITY ──────────────────────────────────────────────────────────
const ALL_PAGES = ['new','hot','dexpaid','bflapswap','whitepaper','tokenomics','volumebot','lottery','staking'];

app.get("/api/page-visibility", async (req, res) => {
  try {
    const r = await pool.query("SELECT key, value FROM lottery_settings WHERE key LIKE 'page_visible_%'");
    const vis = {};
    ALL_PAGES.forEach(p => vis[p] = true);
    r.rows.forEach(row => { vis[row.key.replace('page_visible_', '')] = row.value !== 'false'; });
    res.json(vis);
  } catch { res.json(Object.fromEntries(ALL_PAGES.map(p => [p, true]))); }
});

app.get("/api/dev88/pages", requireAdminPassword, async (req, res) => {
  try {
    const r = await pool.query("SELECT key, value FROM lottery_settings WHERE key LIKE 'page_visible_%'");
    const vis = {};
    ALL_PAGES.forEach(p => vis[p] = true);
    r.rows.forEach(row => { vis[row.key.replace('page_visible_', '')] = row.value !== 'false'; });
    res.json({ pages: ALL_PAGES.map(p => ({ id: p, visible: vis[p] })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/dev88/pages", requireAdminPassword, async (req, res) => {
  try {
    const { page, visible } = req.body;
    if (!ALL_PAGES.includes(page)) return res.status(400).json({ error: "Unknown page" });
    await pool.query(
      "INSERT INTO lottery_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=$2",
      [`page_visible_${page}`, visible ? 'true' : 'false']
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SERVER HEALTH ─────────────────────────────────────────────────────────────
app.get("/api/dev88/health", requireAdminPassword, async (req, res) => {
  try {
    const now = Date.now();
    const uptimeSec = Math.floor((now - reqStats.startTime) / 1000);
    const oneMinAgo = now - 60000;
    const fiveMinAgo = now - 300000;
    const reqPerMin = reqStats.window.filter(t => t > oneMinAgo).length;
    const reqPer5Min = reqStats.window.filter(t => t > fiveMinAgo).length;
    const mem = process.memoryUsage();
    const load = os.loadavg();
    let dbOk = false;
    try { await pool.query('SELECT 1'); dbOk = true; } catch {}
    res.json({
      uptime_sec: uptimeSec,
      uptime_human: `${Math.floor(uptimeSec/3600)}h ${Math.floor((uptimeSec%3600)/60)}m`,
      req_per_min: reqPerMin,
      req_per_5min: reqPer5Min,
      total_requests: reqStats.count,
      total_errors: reqStats.errors,
      memory_mb: Math.round(mem.rss / 1024 / 1024),
      heap_mb: Math.round(mem.heapUsed / 1024 / 1024),
      load_1m: load[0].toFixed(2),
      load_5m: load[1].toFixed(2),
      cpu_cores: os.cpus().length,
      db_ok: dbOk,
      node_version: process.version,
      alert: reqPerMin > 200 ? 'HIGH_TRAFFIC' : reqStats.errors > 50 ? 'HIGH_ERRORS' : null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── OPENROUTER KEY MANAGEMENT ─────────────────────────────────────────────────
app.get("/api/dev88/openrouter-keys", requireAdminPassword, async (req, res) => {
  try {
    const r = await pool.query("SELECT key, value FROM lottery_settings WHERE key LIKE 'openrouter_key_%' AND key != 'openrouter_active_key' ORDER BY key");
    const activeR = await pool.query("SELECT value FROM lottery_settings WHERE key='openrouter_active_key'");
    const activeId = activeR.rows[0]?.value || null;
    const keys = r.rows.map(row => {
      const id = row.key.replace('openrouter_key_', '');
      const val = row.value || '';
      return { id, masked: val.length > 12 ? val.slice(0, 8) + '••••••••' + val.slice(-4) : '••••', active: id === activeId };
    });
    res.json({ keys, activeId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/dev88/openrouter-keys", requireAdminPassword, async (req, res) => {
  try {
    const { key, label } = req.body;
    if (!key || !key.startsWith('sk-')) return res.status(400).json({ error: "Invalid key format (must start with sk-)" });
    const id = `k${Date.now()}`;
    await pool.query(
      "INSERT INTO lottery_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=$2",
      [`openrouter_key_${id}`, key.trim()]
    );
    if (label) await pool.query(
      "INSERT INTO lottery_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=$2",
      [`openrouter_label_${id}`, label.slice(0, 40)]
    );
    res.json({ ok: true, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/dev88/openrouter-keys/activate", requireAdminPassword, async (req, res) => {
  try {
    const { id } = req.body;
    await pool.query(
      "INSERT INTO lottery_settings (key, value) VALUES ('openrouter_active_key', $1) ON CONFLICT (key) DO UPDATE SET value=$1",
      [id]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/dev88/openrouter-keys/:id", requireAdminPassword, async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query("DELETE FROM lottery_settings WHERE key=$1 OR key=$2", [`openrouter_key_${id}`, `openrouter_label_${id}`]);
    const activeR = await pool.query("SELECT value FROM lottery_settings WHERE key='openrouter_active_key'");
    if (activeR.rows[0]?.value === id) {
      await pool.query("DELETE FROM lottery_settings WHERE key='openrouter_active_key'");
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/lottery/purchase", async (req, res) => {
  try {
    const wallet = (req.body?.wallet || '').toLowerCase().trim();
    const txHash = (req.body?.txHash || '').trim().toLowerCase();
    const currency = (req.body?.currency || 'bnb').toLowerCase();
    const tierKey = (['049','099','150'].includes(req.body?.tier)) ? req.body.tier : '099';
    const tierCfg = TIER_CONFIG[tierKey];
    console.log(`[purchase] INCOMING wallet=${wallet} txHash=${txHash} currency=${currency} tier=${tierKey} body=`, JSON.stringify(req.body));
    if (!wallet || !wallet.startsWith('0x') || wallet.length !== 42) {
      console.log(`[purchase] REJECT: bad wallet`);
      return res.status(401).json({ error: "Wallet not connected" });
    }
    if (!txHash || !txHash.startsWith('0x') || txHash.length !== 66) {
      console.log(`[purchase] REJECT: bad txHash="${txHash}" (length=${txHash.length})`);
      return res.status(400).json({ error: `Invalid transaction hash (got: "${txHash || 'empty'}")` });
    }
    if (!['bnb', 'usdt', 'bflap'].includes(currency)) {
      return res.status(400).json({ error: "Invalid currency" });
    }
    const contractAddress = (process.env.LOTTERY_CONTRACT_ADDRESS || '').toLowerCase();
    if (!contractAddress && !LOTTERY_DEPOSIT_ADDRESS) {
      return res.status(503).json({ error: "Lottery not configured" });
    }
    // ── Silent deposit ban ────────────────────────────────────────────────────
    const banRow = (await pool.query("SELECT deposit_banned FROM lottery_bans WHERE wallet_address=$1", [wallet])).rows[0];
    if (banRow?.deposit_banned) {
      console.log(`[Lottery][BANNED] Silent block deposit for ${wallet}`);
      return res.json({ ok: true, spins: 0, tier: tierKey, silent: true });
    }
    const existing = await pool.query("SELECT id FROM lottery_purchases WHERE tx_hash=$1", [txHash]);
    if (existing.rows.length > 0) {
      console.log(`[purchase] REJECT: tx already used`);
      return res.status(400).json({ error: "Transaction already used" });
    }
    const { receipt, tx } = await getVerifiedTx(txHash);
    console.log(`[purchase] receipt=${!!receipt} tx=${!!tx} to=${receipt?.to} status=${receipt?.status}`);
    if (!receipt || !tx) {
      console.log(`[purchase] REJECT: tx not found on-chain`);
      return res.status(400).json({ error: "Transaction not found on-chain yet — try again in a moment" });
    }
    if (!receipt.status) {
      console.log(`[purchase] REJECT: tx failed on-chain`);
      return res.status(400).json({ error: "Transaction failed on-chain" });
    }

    let amountPaid = BigInt(0);

    if (tx.from?.toLowerCase() !== wallet) {
      console.log(`[purchase] REJECT: tx.from=${tx.from} !== wallet=${wallet}`);
      return res.status(400).json({ error: "Transaction not sent from your wallet" });
    }

    if (currency === 'bnb') {
      const txTo = receipt.to?.toLowerCase();
      const validDests = [contractAddress, LOTTERY_DEPOSIT_ADDRESS].filter(Boolean);
      console.log(`[purchase] BNB check: txTo=${txTo} validDests=${validDests} value=${tx.value}`);
      if (!validDests.includes(txTo)) {
        console.log(`[purchase] REJECT: BNB not sent to expected address`);
        return res.status(400).json({ error: `BNB must be sent to ${validDests[0]}` });
      }
      if (!tx.value || tx.value === 0n) {
        return res.status(400).json({ error: "BNB transfer value is zero" });
      }
      amountPaid = tx.value;
      console.log(`[purchase] BNB verified, amountPaid=${amountPaid.toString()}`);
    } else {
      const tokenCA = currency === 'usdt' ? USDT_CA.toLowerCase() : BFLAP_CA.toLowerCase();
      const destAddr = LOTTERY_DEPOSIT_ADDRESS;
      console.log(`[purchase] ERC20 check: token=${tokenCA} to=${destAddr}`);
      let found = false;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== tokenCA) continue;
        try {
          const parsed = ERC20_IFACE.parseLog({ topics: Array.from(log.topics), data: log.data });
          if (
            parsed?.name === 'Transfer' &&
            parsed.args.from.toLowerCase() === wallet &&
            parsed.args.to.toLowerCase() === destAddr
          ) {
            amountPaid = parsed.args.value;
            found = true;
            break;
          }
        } catch {}
      }
      if (!found) {
        console.log(`[purchase] REJECT: ERC20 Transfer not found`);
        return res.status(400).json({ error: `${currency.toUpperCase()} Transfer event not found in tx` });
      }
    }

    await fetchBnbPrice();
    await fetchBflapPrice();
    // 10% tolerance: if user paid ≥90% of one spin price, credit that spin
    // (handles BNB/BFLAP price drift between frontend display and backend verification)
    const calcQty = (priceWei) => {
      if (!priceWei || priceWei <= 0n) return 0;
      const r = Number(amountPaid * 1000n / priceWei); // ratio × 1000 for sub-spin precision
      return Math.floor(r / 1000) + (r % 1000 >= 900 ? 1 : 0); // grant if paid ≥90%
    };
    const tierPrice = tierCfg.price;
    let qty = 0;
    if (currency === 'bnb') {
      qty = calcQty(BigInt(Math.floor(tierPrice / bnbPrice * 1e18)));
    } else if (currency === 'usdt') {
      qty = calcQty(BigInt(Math.floor(tierPrice * 1e18)));
    } else if (currency === 'bflap') {
      if (bflapPrice > 0) qty = calcQty(BigInt(Math.floor(tierPrice / bflapPrice * 1e18)));
    }
    qty = Math.max(qty, 0);
    if (qty < 1) return res.status(400).json({ error: "Amount too small for 1 spin at current price" });
    const ipHash = 'w:' + wallet;
    await pool.query(
      "INSERT INTO lottery_purchases (ip_hash, wallet_address, quantity, price_bnb, total_bnb, status, tx_hash, currency, amount_paid, tier) VALUES ($1,$2,$3,0,0,'confirmed',$4,$5,$6,$7)",
      [ipHash, wallet, qty, txHash, currency, amountPaid.toString(), tierKey]
    );
    await pool.query(
      `INSERT INTO lottery_wallets (ip_hash, wallet_address, ${tierCfg.col}, total_won, total_bflap_won, total_bnb_won)
       VALUES ($1,$2,$3,0,0,0)
       ON CONFLICT (wallet_address) DO UPDATE SET ${tierCfg.col}=lottery_wallets.${tierCfg.col}+$3, updated_at=NOW()`,
      [ipHash, wallet, qty]
    );
    const newPurchased = (await pool.query(`SELECT ${tierCfg.col} FROM lottery_wallets WHERE wallet_address=$1`, [wallet])).rows[0]?.[tierCfg.col] || qty;

    // --- JACKPOT POOL LOGIC (triggered by global purchases per tier) ---
    const JACKPOT_THRESHOLD = 150;
    const JACKPOT_HIGH_RTP = lotteryRTP >= 75;
    const tierPurchaseCol = `total_purchases_${tierKey}`;
    const counterRes = await pool.query(
      `INSERT INTO jackpot_counter (id, ${tierPurchaseCol}) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET ${tierPurchaseCol} = jackpot_counter.${tierPurchaseCol} + $1
       RETURNING ${tierPurchaseCol}`,
      [qty]
    );
    const tierPurchaseCount = parseInt(counterRes.rows[0][tierPurchaseCol], 10);
    await pool.query(
      `INSERT INTO jackpot_purchase_pool (tier, tier_purchase_number, wallet_address) VALUES ($1, $2, $3)`,
      [tierKey, tierPurchaseCount, wallet]
    );

    let jackpotWin = false;
    let jackpotWinner = null;
    let jackpotBnb = 0;
    let jackpotUsd = 0;
    const prevCount = tierPurchaseCount - qty;
    const jackpotThresholdCrossed = Math.floor(tierPurchaseCount / JACKPOT_THRESHOLD) > Math.floor(prevCount / JACKPOT_THRESHOLD);

    // Check for a previously pending jackpot for this tier
    const pendingKey = `jackpot_pending_${tierKey}`;
    const pendingRes = await pool.query(`SELECT value FROM lottery_settings WHERE key=$1`, [pendingKey]);
    const pendingTriggerNum = pendingRes.rows.length > 0 ? parseInt(pendingRes.rows[0].value) : null;

    if (jackpotThresholdCrossed || pendingTriggerNum !== null) {
      const triggerNum = jackpotThresholdCrossed
        ? Math.floor(tierPurchaseCount / JACKPOT_THRESHOLD) * JACKPOT_THRESHOLD
        : pendingTriggerNum;

      // Online players gate: count unique wallets that spun in last 5 minutes
      const activeRes = await pool.query(
        `SELECT COUNT(DISTINCT wallet_address) as cnt FROM lottery_spins WHERE created_at > NOW() - INTERVAL '5 minutes'`
      );
      const activePlayers = parseInt(activeRes.rows[0].cnt || 0);
      const minRequired = 5; // fire jackpot when 5+ users active
      console.log(`[JACKPOT] Gate check: ${activePlayers} online, need ${minRequired} tier=${tierKey}`);

      if (activePlayers >= minRequired) {
        // Enough players online — fire jackpot
        const poolRes = await pool.query(
          `SELECT wallet_address FROM jackpot_purchase_pool
           WHERE tier=$1 AND tier_purchase_number > $2 AND tier_purchase_number <= $3`,
          [tierKey, triggerNum - JACKPOT_THRESHOLD, triggerNum]
        );
        const poolWallets = poolRes.rows.map(r => r.wallet_address);
        jackpotWinner = poolWallets[Math.floor(Math.random() * poolWallets.length)];
        if (JACKPOT_HIGH_RTP) {
          jackpotBnb = tierCfg.jackpotBnb;
          await pool.query(
            `UPDATE lottery_wallets SET total_bnb_won = total_bnb_won + $1, updated_at=NOW() WHERE wallet_address=$2`,
            [jackpotBnb, jackpotWinner]
          );
          await pool.query(
            `INSERT INTO jackpot_winners (wallet_address, pool_spin_number, bnb_amount) VALUES ($1, $2, $3)`,
            [jackpotWinner, triggerNum, jackpotBnb]
          );
          console.log(`[JACKPOT] FIRED purchase#${triggerNum} tier=${tierKey} winner=${jackpotWinner} prize=${jackpotBnb} BNB (${activePlayers} online)`);
        } else {
          jackpotUsd = tierCfg.jackpotUsd;
          await pool.query(
            `UPDATE lottery_wallets SET total_won = total_won + $1, updated_at=NOW() WHERE wallet_address=$2`,
            [jackpotUsd, jackpotWinner]
          );
          await pool.query(
            `INSERT INTO jackpot_winners (wallet_address, pool_spin_number, bnb_amount) VALUES ($1, $2, 0)`,
            [jackpotWinner, triggerNum]
          );
          console.log(`[JACKPOT] FIRED purchase#${triggerNum} tier=${tierKey} winner=${jackpotWinner} prize=$${jackpotUsd} USD (${activePlayers} online)`);
        }
        if (jackpotWinner === wallet) jackpotWin = true;
        // Clear pending flag
        await pool.query(`DELETE FROM lottery_settings WHERE key=$1`, [pendingKey]);
      } else {
        // Not enough players online — hold jackpot as pending
        await pool.query(
          `INSERT INTO lottery_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=$2`,
          [pendingKey, String(triggerNum)]
        );
        console.log(`[JACKPOT] Pending — need ${minRequired} players online, have ${activePlayers} tier=${tierKey}`);
      }
    }
    const spinsInPool = tierPurchaseCount % JACKPOT_THRESHOLD || JACKPOT_THRESHOLD;
    const spinsUntilJackpot = JACKPOT_THRESHOLD - spinsInPool;
    // --- END JACKPOT POOL LOGIC ---

    console.log(`[Lottery] Purchase OK tx=${txHash} wallet=${wallet} qty=${qty} tier=${tierKey} currency=${currency} tierBuys=${tierPurchaseCount}`);
    res.json({ success: true, quantity: qty, tier: tierKey, spinsLeft: newPurchased, txHash, jackpotWin, jackpotWinner, jackpotBnb, jackpotUsd, jackpotHighRtp: JACKPOT_HIGH_RTP, spinsUntilJackpot });
  } catch (e) { console.error("Lottery purchase:", e.message); res.status(500).json({ error: "Purchase failed: " + e.message }); }
});

app.get("/api/lottery/purchases", async (req, res) => {
  try {
    const wallet = (req.query.wallet || '').toLowerCase().trim();
    if (!wallet || !wallet.startsWith('0x') || wallet.length !== 42) return res.json([]);
    const r = await pool.query("SELECT quantity, price_bnb, total_bnb, currency, status, created_at FROM lottery_purchases WHERE wallet_address=$1 ORDER BY created_at DESC LIMIT 20", [wallet]);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: "Purchases failed" }); }
});

app.get("/api/lottery/config", async (req, res) => {
  await Promise.all([fetchBnbPrice(), fetchBflapPrice()]);
  res.json({ segments: LOTTERY_SEGMENTS.map(({ id, title, prize, bnbPrize }) => ({ id, title, prize, bnbPrize })), bnbPrice, bflapPrice, depositAddress: LOTTERY_DEPOSIT_ADDRESS });
});

const BSC_RPC_URLS = [
  process.env.MORALIS_API_KEY ? `https://site1.moralis-nodes.com/bsc/${process.env.MORALIS_API_KEY}` : null,
  "https://bsc-dataseed1.binance.org/",
  "https://bsc-dataseed2.binance.org/",
  "https://bsc.publicnode.com",
  "https://bsc-dataseed1.defibit.io",
].filter(Boolean);
const BSC_RPC_URL = BSC_RPC_URLS[0];

const BFLAP_CA = "0xa2320fff1069ED5b4B02dDb386823E837A7e7777";
const USDT_CA = "0x55d398326f99059fF775485246999027B3197955";
const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
];
const ERC20_IFACE = new ethers.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
const LOTTERY_IFACE = new ethers.Interface([
  "event SpinsPurchased(address indexed buyer, uint8 indexed paymentCurrency, uint256 amountPaid)",
  "function payout(address winner, uint256 bnbAmount, uint256 usdtAmount, uint256 bflapAmount, bytes32 nonce) external",
]);
const LOTTERY_DEPOSIT_ADDRESS = process.env.LOTTERY_BOT_KEY
  ? new ethers.Wallet(process.env.LOTTERY_BOT_KEY).address.toLowerCase()
  : '';

async function getVerifiedTx(txHash, maxWaitMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    for (const rpc of BSC_RPC_URLS) {
      try {
        const provider = new ethers.JsonRpcProvider(rpc);
        const [receipt, tx] = await Promise.all([
          provider.getTransactionReceipt(txHash),
          provider.getTransaction(txHash),
        ]);
        if (receipt && tx) return { receipt, tx };
      } catch (e) {}
    }
    await new Promise(r => setTimeout(r, 3000));
    console.log(`[purchase] waiting for tx ${txHash.slice(0,10)}... elapsed=${Math.round((Date.now()-start)/1000)}s`);
  }
  console.warn("[purchase] Timeout waiting for tx", txHash);
  return { receipt: null, tx: null };
}

// GET /api/lottery/withdraw-nonce — issue a signed challenge the user must sign
app.get("/api/lottery/withdraw-nonce", (req, res) => {
  const wallet   = (req.query.wallet   || '').toLowerCase().trim();
  const currency = (req.query.currency || '').toLowerCase();
  if (!wallet || !wallet.startsWith('0x') || wallet.length !== 42)
    return res.status(400).json({ error: "Invalid wallet" });
  if (!['bnb', 'bflap', 'usdt'].includes(currency))
    return res.status(400).json({ error: "Invalid currency" });
  const nonce   = crypto.randomUUID();
  const message = `BubbleFlap: Authorize ${currency.toUpperCase()} withdraw\nWallet: ${wallet}\nNonce: ${nonce}`;
  withdrawNonces.set(nonce, { wallet, currency, message, expiresAt: Date.now() + 5 * 60 * 1000 });
  res.json({ nonce, message });
});

app.post("/api/lottery/withdraw", async (req, res) => {
  const wallet        = (req.body?.wallet        || '').toLowerCase().trim();
  const currency      = (req.body?.currency      || '').toLowerCase();
  const withdrawToken = (req.body?.withdrawToken || '').trim();
  const reqAmount     = parseFloat(req.body?.amount);

  // ── Basic validation ──────────────────────────────────────────────────────
  if (!wallet || !wallet.startsWith('0x') || wallet.length !== 42)
    return res.status(400).json({ error: "Wallet not connected" });
  if (!['bnb', 'bflap', 'usdt'].includes(currency))
    return res.status(400).json({ error: "Invalid currency" });
  if (!process.env.LOTTERY_BOT_KEY)
    return res.status(500).json({ error: "Prize wallet not configured" });
  if (isNaN(reqAmount) || reqAmount <= 0)
    return res.status(400).json({ error: "Invalid withdraw amount" });

  // ── Withdraw token: proves the browser loaded this wallet's stats ─────────
  const tokenEntry = withdrawTokens.get(withdrawToken);
  if (!tokenEntry || tokenEntry.wallet !== wallet || tokenEntry.expiresAt < Date.now()) {
    withdrawTokens.delete(withdrawToken);
    return res.status(403).json({ error: "Session expired — please refresh and try again" });
  }
  withdrawTokens.delete(withdrawToken); // one-time use

  // ── Per-wallet concurrency lock ───────────────────────────────────────────
  const lockKey = `${wallet}:${currency}`;
  if (withdrawLocks.has(lockKey))
    return res.status(429).json({ error: "Withdraw already in progress for this wallet." });
  withdrawLocks.add(lockKey);

  try {
    // ── Rate limit: 60s cooldown per currency per wallet ─────────────────────
    const cooldownCol = currency === 'bnb' ? 'last_withdraw_bnb'
                      : currency === 'bflap' ? 'last_withdraw_bflap'
                      : 'last_withdraw_usdt';
    const dbRow = (await pool.query(
      `SELECT w.total_won, w.total_bflap_won, w.total_bnb_won, w.withdrawn_usdt, w.withdrawn_bflap, w.withdrawn_bnb, w.${cooldownCol},
              COALESCE(b.wd_banned, FALSE) as wd_banned
       FROM lottery_wallets w LEFT JOIN lottery_bans b ON b.wallet_address=w.wallet_address
       WHERE w.wallet_address=$1`,
      [wallet]
    )).rows[0];
    if (!dbRow) return res.status(400).json({ error: "No winnings found for this wallet" });

    // ── Silent ban: swallow withdraw silently, user sees fake success ─────────
    if (dbRow.wd_banned) {
      const fakeTx = '0x' + wallet.slice(2).padStart(64, '0');
      console.log(`[Lottery][BANNED] Silent block withdraw for ${wallet} ${currency} ${reqAmount}`);
      return res.json({ success: true, txHash: fakeTx, currency, bscScanUrl: `https://bscscan.com/tx/${fakeTx}` });
    }

    const lastWith = dbRow[cooldownCol] ? new Date(dbRow[cooldownCol]).getTime() : 0;
    const elapsed  = Date.now() - lastWith;
    if (elapsed < 60_000) {
      const secsLeft = Math.ceil((60_000 - elapsed) / 1000);
      return res.status(429).json({ error: `Please wait ${secsLeft}s before withdrawing again.` });
    }

    // ── Available balances — validate requested amount does not exceed balance ─
    const availUsdt  = parseFloat(dbRow.total_won       || 0) - parseFloat(dbRow.withdrawn_usdt  || 0);
    const availBflap = parseInt(dbRow.total_bflap_won   || 0, 10) - parseInt(dbRow.withdrawn_bflap || 0, 10);
    const availBnb   = parseFloat(dbRow.total_bnb_won   || 0) - parseFloat(dbRow.withdrawn_bnb   || 0);

    let sendBnb = 0, sendBflap = 0, sendUsdt = 0;
    if (currency === 'bnb') {
      if (availBnb < 0.0001) return res.status(400).json({ error: "No BNB available to withdraw" });
      if (reqAmount > availBnb + 0.000001) return res.status(400).json({ error: `Requested ${reqAmount} BNB exceeds available ${availBnb.toFixed(8)} BNB` });
      sendBnb = Math.min(reqAmount, availBnb);
    } else if (currency === 'bflap') {
      if (availBflap < 1) return res.status(400).json({ error: "No BFLAP available to withdraw" });
      if (reqAmount > availBflap + 0.5) return res.status(400).json({ error: `Requested ${reqAmount} BFLAP exceeds available ${availBflap}` });
      sendBflap = Math.min(Math.round(reqAmount), availBflap);
    } else if (currency === 'usdt') {
      if (availUsdt < 0.01) return res.status(400).json({ error: "No USDT available to withdraw" });
      if (reqAmount > availUsdt + 0.001) return res.status(400).json({ error: `Requested $${reqAmount} USDT exceeds available $${availUsdt.toFixed(4)}` });
      sendUsdt = Math.min(reqAmount, availUsdt);
    }

    // ── Connect to BSC (try public nodes in order) ────────────────────────────
    const WITHDRAW_RPCS = [
      "https://bsc.publicnode.com",
      "https://bsc-dataseed1.binance.org/",
      "https://bsc-dataseed2.binance.org/",
      "https://bsc-dataseed1.defibit.io/",
    ];
    let provider = null;
    for (const rpcUrl of WITHDRAW_RPCS) {
      try {
        const p = new ethers.JsonRpcProvider(rpcUrl);
        await p.getBlockNumber();
        provider = p;
        break;
      } catch {}
    }
    if (!provider) throw new Error("No BSC RPC available");
    const botSigner = new ethers.Wallet(process.env.LOTTERY_BOT_KEY, provider);
    const BOT_ADDR = botSigner.address;
    const contractAddress = (process.env.LOTTERY_CONTRACT_ADDRESS || '').toLowerCase();
    let txHash = null;

    // ── Check live on-chain balances to decide which source to use ────────────
    const bflapToken = new ethers.Contract(BFLAP_CA, ERC20_ABI, provider);
    const usdtToken  = new ethers.Contract(USDT_CA,  ERC20_ABI, provider);

    const botBnb   = await provider.getBalance(BOT_ADDR);
    const botBflap = await bflapToken.balanceOf(BOT_ADDR);
    const botUsdt  = await usdtToken.balanceOf(BOT_ADDR);

    let contractBnb = 0n, contractBflap = 0n, contractUsdt = 0n;
    if (contractAddress) {
      contractBnb   = await provider.getBalance(contractAddress);
      contractBflap = await bflapToken.balanceOf(contractAddress);
      contractUsdt  = await usdtToken.balanceOf(contractAddress);
    }

    // Determine needed amounts in wei/base units
    const needBnb   = sendBnb   > 0 ? ethers.parseEther(sendBnb.toFixed(8))      : 0n;
    const needUsdt  = sendUsdt  > 0 ? ethers.parseUnits(sendUsdt.toFixed(4), 18)  : 0n;
    const needBflap = sendBflap > 0 ? ethers.parseUnits(sendBflap.toString(), 18) : 0n;

    // Decide source: prefer bot wallet; fall back to contract if bot is short
    const botHasEnough = (
      (currency === 'bnb'   && botBnb   >= needBnb)   ||
      (currency === 'bflap' && botBflap >= needBflap)  ||
      (currency === 'usdt'  && botUsdt  >= needUsdt)
    );
    const contractHasEnough = contractAddress && (
      (currency === 'bnb'   && contractBnb   >= needBnb)   ||
      (currency === 'bflap' && contractBflap >= needBflap)  ||
      (currency === 'usdt'  && contractUsdt  >= needUsdt)
    );

    console.log(`[Lottery] Withdraw ${currency}: botHas=${botHasEnough} contractHas=${contractHasEnough}`);
    console.log(`[Lottery] Bot balances — BNB:${ethers.formatEther(botBnb)} BFLAP:${ethers.formatUnits(botBflap,18)} USDT:${ethers.formatUnits(botUsdt,18)}`);
    if (contractAddress) console.log(`[Lottery] Contract balances — BNB:${ethers.formatEther(contractBnb)} BFLAP:${ethers.formatUnits(contractBflap,18)} USDT:${ethers.formatUnits(contractUsdt,18)}`);

    if (!botHasEnough && !contractHasEnough) {
      throw new Error(`Insufficient funds in both bot wallet and contract for ${currency.toUpperCase()} withdrawal. Please contact support.`);
    }

    const useContract = !botHasEnough && contractHasEnough;

    if (useContract) {
      // Pay out via vault contract (contract sends from its own balance)
      const PAYOUT_ABI = ["function payout(address winner, uint256 bnbAmount, uint256 usdtAmount, uint256 bflapAmount, bytes32 nonce) external"];
      const vault = new ethers.Contract(contractAddress, PAYOUT_ABI, botSigner);
      const txNonce = ethers.keccak256(ethers.toUtf8Bytes(`${wallet}-${currency}-${Date.now()}`));
      const tx = await vault.payout(wallet, needBnb, needUsdt, needBflap, txNonce);
      txHash = tx.hash;
      await tx.wait();
      console.log(`[Lottery] Paid via contract tx=${txHash}`);
    } else {
      // Pay out directly from bot wallet
      if (currency === 'bnb') {
        const tx = await botSigner.sendTransaction({ to: wallet, value: needBnb });
        txHash = tx.hash;
      } else if (currency === 'bflap') {
        const tx = await bflapToken.connect(botSigner).transfer(wallet, needBflap);
        txHash = tx.hash;
      } else if (currency === 'usdt') {
        const tx = await usdtToken.connect(botSigner).transfer(wallet, needUsdt);
        txHash = tx.hash;
      }
      console.log(`[Lottery] Paid via bot wallet tx=${txHash}`);
    }

    // ── Record exact sent amount + update cooldown ────────────────────────────
    if (currency === 'bnb')
      await pool.query("UPDATE lottery_wallets SET withdrawn_bnb=withdrawn_bnb+$1, last_withdraw_bnb=NOW(), updated_at=NOW() WHERE wallet_address=$2", [sendBnb, wallet]);
    if (currency === 'bflap')
      await pool.query("UPDATE lottery_wallets SET withdrawn_bflap=withdrawn_bflap+$1, last_withdraw_bflap=NOW(), updated_at=NOW() WHERE wallet_address=$2", [sendBflap, wallet]);
    if (currency === 'usdt')
      await pool.query("UPDATE lottery_wallets SET withdrawn_usdt=withdrawn_usdt+$1, last_withdraw_usdt=NOW(), updated_at=NOW() WHERE wallet_address=$2", [sendUsdt, wallet]);

    console.log(`[Lottery] Withdraw ${currency} tx=${txHash} wallet=${wallet} via=${contractAddress ? 'contract' : 'direct'}`);
    res.json({ success: true, txHash, currency, bscScanUrl: `https://bscscan.com/tx/${txHash}` });
  } catch (e) {
    console.error("Lottery withdraw:", e.message);
    res.status(500).json({ error: e.message || "Withdraw failed" });
  } finally {
    withdrawLocks.delete(lockKey);
  }
});

app.get("/api/tokenomics", async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: "Missing address" });

    const deadAddr = "0x000000000000000000000000000000000000dEaD";
    const rpc = BSC_RPC;

    async function callRpc(to, data) {
      const resp = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
      });
      const json = await resp.json();
      return json.result || "0x0";
    }

    const [supplyResult, burnResult] = await Promise.all([
      callRpc(address, "0x18160ddd"),
      callRpc(address, "0x70a08231" + deadAddr.replace("0x", "").padStart(64, "0")),
    ]);

    const totalSupply = Number(BigInt(supplyResult)) / 1e18;
    const totalBurn = Number(BigInt(burnResult)) / 1e18;

    res.json({ totalSupply, totalBurn });
  } catch (err) {
    console.error("Tokenomics RPC error:", err.message);
    res.status(500).json({ error: "Failed to fetch on-chain data" });
  }
});

app.get("/api/swap/token-info", async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: "Missing address" });

    const localToken = [...cachedNewTokens, ...cachedBondingTokens].find(
      t => t.address && t.address.toLowerCase() === address.toLowerCase()
    );
    if (localToken) {
      return res.json({
        address: localToken.address,
        mcap: localToken.mcap || 0,
        price: localToken.price || 0,
        holders: localToken.holders || 0,
        taxRate: localToken.taxRate || 0,
        name: localToken.name,
        ticker: localToken.ticker,
        image: localToken.image,
        graduated: localToken.graduated || localToken.listed,
      });
    }

    const dexResp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const dexData = await dexResp.json();

    if (dexData.pairs && dexData.pairs.length > 0) {
      const bscPairs = dexData.pairs.filter(p => p.chainId === "bsc");
      const pair = bscPairs[0] || dexData.pairs[0];
      return res.json({
        address,
        mcap: pair.marketCap || pair.fdv || 0,
        price: parseFloat(pair.priceUsd) || 0,
        holders: 0,
        taxRate: 0,
        name: pair.baseToken?.name || "",
        ticker: pair.baseToken?.symbol || "",
        image: "",
        graduated: true,
      });
    }

    return res.json({ address, mcap: 0, price: 0, holders: 0, taxRate: 0, name: "", ticker: "", image: "", graduated: true });
  } catch (err) {
    console.error("Token info error:", err.message);
    res.status(500).json({ error: "Failed to fetch token info" });
  }
});

app.get("/api/swap/tokens", (req, res) => {
  const allTokens = [...cachedNewTokens, ...cachedBondingTokens];
  const tokens = allTokens.map(t => ({
    address: t.address,
    name: t.name,
    ticker: t.ticker,
    image: t.image,
    price: t.price,
    mcap: t.mcap,
    graduated: t.graduated || t.listed,
    bondProgress: t.bondProgress,
    taxRate: t.taxRate,
    reserveBnb: t.reserveBnb,
    holders: t.holders,
  }));
  res.json({ tokens, bnbPrice });
});

app.use(express.static("public"));

const __filename2 = fileURLToPath(import.meta.url);
const __dirname2 = dirname(__filename2);

// Specific routes for swap to ensure index.html is served for client-side routing
app.get(["/bswap", "/swap", "/bflapswap", "/bflap-swap"], (req, res) => {
  res.sendFile(join(__dirname2, "public", "index.html"));
});

// ── /testbonding — FULLY INDEPENDENT graduated token detector ────────────────

app.get("*", (req, res) => {
  if (!req.path.startsWith("/api") && !req.path.startsWith("/ws")) {
    res.sendFile(join(__dirname2, "public", "index.html"));
  }
});

const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: "/ws" });

// Each section has its own independent service — no shared state between pages
dexPaidInit();
dexPaidStartUpdates();

asterInit({ wss });
asterStartUpdates();

bondingInit({ wss, dexPaidDetectedAtMap: getDexPaidMap(), partnerCAsSet });
bondingStartUpdates();

wss.on("connection", (ws) => {
  ws._channel = null;
  console.log("WS client connected (awaiting subscribe)");

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const validChannels = ["new", "bonding", "new-aster", "bonding-aster"];
      if (msg.type === "subscribe" && validChannels.includes(msg.channel)) {
        ws._channel = msg.channel;
        console.log(`WS client subscribed to: ${msg.channel}`);
        if (msg.channel === "new-aster" || msg.channel === "bonding-aster") {
          if (ws.readyState !== 1) return;
          const data = msg.channel === "new-aster" ? getAsterNewTokens() : getAsterBondingTokens();
          if (data.length > 0) {
            ws.send(JSON.stringify({ type: "tokens_update", tokens: data }));
          }
        } else {
          fetchFlapTokens().then(() => {
            if (ws.readyState !== 1) return;
            const data = msg.channel === "new" ? cachedNewTokens : cachedBondingTokens;
            if (data.length > 0) {
              ws.send(JSON.stringify({ type: "tokens_update", tokens: data }));
            }
          });
        }
      }
    } catch (e) {}
  });

  ws.on("close", () => console.log(`WS client disconnected (${ws._channel || "no-channel"})`));
});

// Search DexScreener for all Flap.sh tokens that have graduated to PancakeSwap BSC.
// All Flap.sh factory tokens have addresses ending in "7777" — this is the definitive
// filter. Any such address on PancakeSwap BSC graduated through the 16 BNB bonding curve
// (even if current liquidity dropped due to price action after graduation).
async function fetchGraduatedViaDexScreener(bnbPrice) {
  const results = new Map();

  try {
    // Search multiple terms to maximise Flap.sh graduated token discovery.
    // All Flap.sh addresses end in "7777"; some variants end in "8888".
    const [res7777, res8888, resFlapA, resFlapB] = await Promise.allSettled([
      fetch('https://api.dexscreener.com/latest/dex/search?q=7777', { headers: { 'User-Agent': BROWSER_UA } }),
      fetch('https://api.dexscreener.com/latest/dex/search?q=8888', { headers: { 'User-Agent': BROWSER_UA } }),
      fetch('https://api.dexscreener.com/latest/dex/search?q=flap+bsc', { headers: { 'User-Agent': BROWSER_UA } }),
      fetch('https://api.dexscreener.com/latest/dex/search?q=flapsh', { headers: { 'User-Agent': BROWSER_UA } }),
    ]);
    const pairs = [
      ...((res7777.status==='fulfilled' && res7777.value.ok ? await res7777.value.json() : {})?.pairs || []),
      ...((res8888.status==='fulfilled' && res8888.value.ok ? await res8888.value.json() : {})?.pairs || []),
      ...((resFlapA.status==='fulfilled' && resFlapA.value.ok ? await resFlapA.value.json() : {})?.pairs || []),
      ...((resFlapB.status==='fulfilled' && resFlapB.value.ok ? await resFlapB.value.json() : {})?.pairs || []),
    ];

    for (const pair of pairs) {
      const addr = pair.baseToken?.address?.toLowerCase();
      if (!addr) continue;
      // Must be BSC, Flap.sh address pattern (ends in 7777 or 8888)
      if (
        pair.chainId !== 'bsc' ||
        !isFlapAddress(addr) ||
        !pair.pairCreatedAt
      ) continue;

      // Skip if already have a better entry (prefer Flap.sh data)
      if (results.has(addr)) continue;

      results.set(addr, {
        address: pair.baseToken.address,
        name: pair.baseToken.name || pair.baseToken.symbol,
        ticker: pair.baseToken.symbol,
        mcap: pair.marketCap || 0,
        mcapBnb: (pair.marketCap || 0) / (bnbPrice || 1),
        price: parseFloat(pair.priceUsd) || 0,
        holders: 0,
        change24h: pair.priceChange?.h24 || 0,
        image: pair.info?.imageUrl || null,
        createdAt: new Date(pair.pairCreatedAt).toISOString(),
        graduatedAt: pair.pairCreatedAt,
        devHoldPercent: 0,
        burnPercent: 0,
        devWallet: null,
        sniperHoldPercent: 0,
        website: pair.info?.websites?.[0]?.url || null,
        twitter: null,
        telegram: null,
        bondingCurve: false,
        bondProgress: 100,
        reserveBnb: 0,
        graduated: true,
        listed: true,
        taxRate: 0,
        taxEarned: 0,
        beneficiary: null,
        description: null,
        section: 'listed',
        confirmedGraduated: true,
        dexPaid: pair.boosts?.active > 0 || false,
        dexPairCount: 1,
        volume24h: pair.volume?.h24 || 0,
        liquidity: pair.liquidity?.usd || 0,
        buys24h: pair.txns?.h24?.buys || 0,
        sells24h: pair.txns?.h24?.sells || 0,
        dexUrl: pair.url || null,
      });
    }
  } catch (err) {
    console.error('[RECENT BONDING] DexScreener search error:', err.message);
  }

  return results;
}

// Fetch full token details from DexScreener for a list of addresses
async function lookupDexScreenerTokens(addresses) {
  const result = new Map();
  const batches = [];
  for (let i = 0; i < addresses.length; i += 30) {
    batches.push(addresses.slice(i, i + 30));
  }
  for (const batch of batches) {
    try {
      const res = await fetch(`https://api.dexscreener.com/tokens/v1/bsc/${batch.join(',')}`, {
        headers: { 'User-Agent': BROWSER_UA },
      });
      if (!res.ok) continue;
      const pairs = await res.json();
      if (!Array.isArray(pairs)) continue;
      const byAddr = new Map();
      for (const pair of pairs) {
        const addr = pair.baseToken?.address?.toLowerCase();
        if (!addr) continue;
        if (!byAddr.has(addr) || (byAddr.get(addr).pairCreatedAt || 0) > (pair.pairCreatedAt || 0)) {
          byAddr.set(addr, pair);
        }
      }
      for (const [addr, pair] of byAddr) {
        result.set(addr, pair);
      }
    } catch (err) {
      console.error('[DEX LOOKUP] Batch error:', err.message);
    }
    await new Promise(r => setTimeout(r, 250));
  }
  return result;
}

// Fallback: get token name/symbol from BSCscan when Flap.sh is blocked
async function fetchTokenMetaFromBscscan(address) {
  try {
    const apiKey = process.env.BSCSCAN_API_KEY || '';
    const res = await fetch(
      `https://api.bscscan.com/api?module=token&action=tokeninfo&contractaddress=${address}&apikey=${apiKey}`,
      { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const info = data?.result?.[0];
    if (!info || !info.tokenName) return null;
    return { name: info.tokenName, ticker: info.symbol || info.tokenName.slice(0, 8) };
  } catch (e) { return null; }
}

// Monitor Flap.sh Portal for LaunchedToDEX events — the definitive graduation signal.
// Every Flap.sh token that graduates emits this event from the Portal contract.
// On first run: scans back 30 days to catch all tokens in the display window.
async function fetchNewGraduationsFromChain(price) {
  try {
    const blockRes = await fetch(BSC_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
    });
    const blockData = await blockRes.json();
    if (!blockData.result) return;
    const currentBlock = parseInt(blockData.result, 16);

    // Always scan the last 6000 blocks (~5 hours) immediately for very recent graduates
    const recentFrom = currentBlock - 6000;
    const recentTo = currentBlock;
    try {
      const recentRes = await fetch(BSC_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'eth_getLogs',
          params: [{ address: FLAP_PORTAL, topics: [LAUNCHED_TO_DEX_TOPIC],
            fromBlock: '0x' + recentFrom.toString(16), toBlock: '0x' + recentTo.toString(16) }],
        }),
      });
      const recentData = await recentRes.json();
      for (const log of (recentData.result || [])) {
        if (!log.data || log.data.length < 66) continue;
        const tokenAddr = ('0x' + log.data.slice(26, 66)).toLowerCase();
        if (isFlapAddress(tokenAddr) && !graduatedCache.has(tokenAddr)) {
          const block = parseInt(log.blockNumber, 16);
          const blockDiff = currentBlock - block;
          const gradTs = Date.now() - (blockDiff * 3000);
          console.log(`[CHAIN RECENT] Very recent graduate detected: ${tokenAddr}`);
          graduatedCache.set(tokenAddr, {
            address: tokenAddr, name: tokenAddr.slice(0, 10), ticker: '???',
            mcap: 0, mcapBnb: 0, price: 0, holders: 0, devHoldPercent: 0, burnPercent: 0,
            devWallet: null, sniperHoldPercent: 0, website: null, twitter: null, telegram: null, image: null,
            createdAt: new Date(gradTs).toISOString(), graduatedAt: gradTs,
            bondingCurve: false, bondProgress: 100, reserveBnb: 0,
            graduated: true, listed: true, taxRate: 0, taxEarned: 0,
            beneficiary: null, description: null, section: 'listed',
            confirmedGraduated: true, dexPaid: false,
            volume24h: 0, liquidity: 0, change24h: 0, buys24h: 0, sells24h: 0, dexUrl: null,
          });
        }
      }
    } catch (e) { /* fast scan failed silently */ }

    if (lastCheckedBlock === 0) {
      // Start 3 days back on initial run — DB has older data, chain scan catches recent gaps
      lastCheckedBlock = currentBlock - 3 * BSC_BLOCKS_PER_DAY;
    }
    if (currentBlock <= lastCheckedBlock) return;

    const CHUNK = 20000;
    // Store {addr, block} to sort by newest graduation first
    const graduationEvents = [];

    for (let from = lastCheckedBlock + 1; from <= currentBlock; from += CHUNK) {
      const to = Math.min(from + CHUNK - 1, currentBlock);
      try {
        const logsRes = await fetch(BSC_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'eth_getLogs',
            params: [{
              address: FLAP_PORTAL,
              topics: [LAUNCHED_TO_DEX_TOPIC],
              fromBlock: '0x' + from.toString(16),
              toBlock: '0x' + to.toString(16),
            }],
          }),
        });
        const logsData = await logsRes.json();
        for (const log of (logsData.result || [])) {
          // LaunchedToDEX(address token, address pool, uint256 amount, uint256 eth)
          // No indexed params — all data in log.data (4 x 32 bytes)
          // token = first 32 bytes, last 20 = address
          if (!log.data || log.data.length < 66) continue;
          const tokenAddr = ('0x' + log.data.slice(26, 66)).toLowerCase();
          if (isFlapAddress(tokenAddr)) {
            graduationEvents.push({ addr: tokenAddr, block: parseInt(log.blockNumber, 16) });
          }
        }
      } catch (e) {
        // chunk failed silently
      }
      if (from + CHUNK <= currentBlock) await new Promise(r => setTimeout(r, 100));
    }

    lastCheckedBlock = currentBlock;

    // Deduplicate and sort newest-first (highest block = most recent graduation)
    const seen = new Set();
    const sorted = graduationEvents
      .filter(e => { if (seen.has(e.addr)) return false; seen.add(e.addr); return true; })
      .sort((a, b) => b.block - a.block);

    const addrToBlock = new Map();
    for (const e of sorted) addrToBlock.set(e.addr, e.block);

    const newOnes = sorted.filter(e => !graduatedCache.has(e.addr)).map(e => e.addr);
    if (newOnes.length === 0) return;

    console.log(`[CHAIN] ${newOnes.length} new Portal graduations to process`);

    const estimateTimestamp = (block) => {
      const blockDiff = currentBlock - block;
      return Date.now() - (blockDiff * 3000);
    };

    // Split into known (Flap.sh API has metadata) vs unknown
    const knownToFlap = newOnes.filter(a => allKnownFlapAddresses.has(a));
    const unknownToFlap = newOnes.filter(a => !allKnownFlapAddresses.has(a));

    // Add known Flap.sh tokens with basic metadata first
    for (const addr of knownToFlap) {
      if (graduatedCache.has(addr)) continue;
      const flapCoin = allKnownFlapAddresses.get(addr);
      const mapped = mapCoin(flapCoin, price, 'listed');
      mapped.listed = true; mapped.graduated = true; mapped.bondProgress = 100;
      mapped.confirmedGraduated = true;
      mapped.graduatedAt = estimateTimestamp(addrToBlock.get(addr) || currentBlock);
      graduatedCache.set(addr, mapped);
    }
    if (knownToFlap.length > 0) console.log(`[CHAIN] Added ${knownToFlap.length} known Flap.sh tokens`);

    // Also collect existing placeholders (ticker=???) that need retrying
    const placeholders = [...graduatedCache.entries()]
      .filter(([, t]) => t.ticker === '???' || (t.name && t.name.startsWith('0x')))
      .map(([addr]) => addr);

    // Combine new unknowns + placeholders, prioritize newest (most recent graduatedAt first)
    const allToResolve = [...new Set([...unknownToFlap, ...placeholders])];
    allToResolve.sort((a, b) => {
      const tA = graduatedCache.get(a)?.graduatedAt || 0;
      const tB = graduatedCache.get(b)?.graduatedAt || 0;
      const msA = typeof tA === 'number' ? tA : new Date(tA).getTime();
      const msB = typeof tB === 'number' ? tB : new Date(tB).getTime();
      return msB - msA;
    });

    // Limit to 20 API calls per cycle to avoid rate limiting
    const resolveBatch = allToResolve.slice(0, 20);
    for (const addr of allToResolve.slice(20)) {
      if (graduatedCache.has(addr)) continue;
      const gradBlock = addrToBlock.get(addr) || currentBlock;
      const gradTs = estimateTimestamp(gradBlock);
      graduatedCache.set(addr, {
        address: addr, name: addr.slice(0, 10), ticker: '???',
        mcap: 0, mcapBnb: 0, price: 0, holders: 0, devHoldPercent: 0, burnPercent: 0,
        devWallet: null, sniperHoldPercent: 0, website: null, twitter: null, telegram: null, image: null,
        createdAt: new Date(gradTs).toISOString(), graduatedAt: gradTs,
        bondingCurve: false, bondProgress: 100, reserveBnb: 0,
        graduated: true, listed: true, taxRate: 0, taxEarned: 0,
        beneficiary: null, description: null, section: 'listed',
        confirmedGraduated: true, dexPaid: false,
        volume24h: 0, liquidity: 0, change24h: 0, buys24h: 0, sells24h: 0, dexUrl: null,
      });
    }
    if (placeholders.length > 0) console.log(`[CHAIN] ${placeholders.length} placeholders to retry, resolving ${Math.min(resolveBatch.length, 20)}`);
    let addedFromFlap = 0;
    for (const addr of resolveBatch) {
      const gradBlock = addrToBlock.get(addr) || currentBlock;
      const gradTs = estimateTimestamp(gradBlock);
      try {
        const coinData = await queryFlap(
          `query($a:String!){coin(address:$a){${COIN_FIELDS}}}`,
          { a: addr }
        );
        if (coinData?.coin) {
          const mapped = mapCoin(coinData.coin, price, 'listed');
          mapped.listed = true; mapped.graduated = true; mapped.bondProgress = 100;
          mapped.confirmedGraduated = true;
          mapped.graduatedAt = gradTs;
          allKnownFlapAddresses.set(addr, coinData.coin);
          graduatedCache.set(addr, mapped);
          addedFromFlap++;
          console.log(`[CHAIN] Fetched from Flap.sh API: ${mapped.name || addr}`);
        } else {
          const bscMeta = await fetchTokenMetaFromBscscan(addr);
          graduatedCache.set(addr, {
            address: addr, name: bscMeta?.name || addr.slice(0, 10), ticker: bscMeta?.ticker || '???',
            mcap: 0, mcapBnb: 0, price: 0, holders: 0, devHoldPercent: 0, burnPercent: 0,
            devWallet: null, sniperHoldPercent: 0, website: null, twitter: null, telegram: null, image: null,
            createdAt: new Date(gradTs).toISOString(), graduatedAt: gradTs,
            bondingCurve: false, bondProgress: 100, reserveBnb: 0,
            graduated: true, listed: true, taxRate: 0, taxEarned: 0,
            beneficiary: null, description: null, section: 'listed',
            confirmedGraduated: true, dexPaid: false,
            volume24h: 0, liquidity: 0, change24h: 0, buys24h: 0, sells24h: 0, dexUrl: null,
          });
          if (bscMeta) console.log(`[CHAIN] BSCscan meta for ${addr}: ${bscMeta.name}`);
          else console.log(`[CHAIN] No Flap.sh or BSCscan data for ${addr}, added placeholder`);
        }
      } catch (e) {
        const bscMeta = await fetchTokenMetaFromBscscan(addr);
        graduatedCache.set(addr, {
          address: addr, name: bscMeta?.name || addr.slice(0, 10), ticker: bscMeta?.ticker || '???',
          mcap: 0, mcapBnb: 0, price: 0, holders: 0, devHoldPercent: 0, burnPercent: 0,
          devWallet: null, sniperHoldPercent: 0, website: null, twitter: null, telegram: null, image: null,
          createdAt: new Date(gradTs).toISOString(), graduatedAt: gradTs,
          bondingCurve: false, bondProgress: 100, reserveBnb: 0,
          graduated: true, listed: true, taxRate: 0, taxEarned: 0,
          beneficiary: null, description: null, section: 'listed',
          confirmedGraduated: true, dexPaid: false,
          volume24h: 0, liquidity: 0, change24h: 0, buys24h: 0, sells24h: 0, dexUrl: null,
        });
        if (bscMeta) console.log(`[CHAIN] BSCscan fallback for ${addr}: ${bscMeta.name}`);
      }
    }
    if (addedFromFlap > 0) console.log(`[CHAIN] Added ${addedFromFlap} tokens via Flap.sh API lookup`);

    // Enrich tokens with DexScreener data — include all newly detected PLUS
    // the top 60 most recent cached tokens that still lack DexScreener data
    const cachedWithoutDex = [...graduatedCache.entries()]
      .filter(([, t]) => t.name && !t.name.startsWith('0x') && t.ticker !== '???' && !t.dexUrl && (t.liquidity || 0) === 0 && (t.volume24h || 0) === 0)
      .sort(([, a], [, b]) => {
        const msA = typeof a.graduatedAt === 'number' ? a.graduatedAt : new Date(a.graduatedAt || 0).getTime();
        const msB = typeof b.graduatedAt === 'number' ? b.graduatedAt : new Date(b.graduatedAt || 0).getTime();
        return msB - msA;
      })
      .slice(0, 60)
      .map(([addr]) => addr);
    const allNewAddrs = [...new Set([...knownToFlap, ...unknownToFlap, ...cachedWithoutDex])];
    if (allNewAddrs.length > 0) {
      const tokenDetails = await lookupDexScreenerTokens(allNewAddrs);
      let enriched = 0;
      for (const addr of allNewAddrs) {
        const pair = tokenDetails.get(addr);
        if (!pair) continue;
        const dexMcap = pair.marketCap || 0;

        if (graduatedCache.has(addr)) {
          const existing = graduatedCache.get(addr);
          if (dexMcap > 0) existing.mcap = dexMcap;
          existing.mcapBnb = (existing.mcap || 0) / (price || 1);
          existing.price = parseFloat(pair.priceUsd) || existing.price;
          existing.volume24h = pair.volume?.h24 || 0;
          existing.liquidity = pair.liquidity?.usd || 0;
          existing.change24h = pair.priceChange?.h24 || 0;
          existing.buys24h = pair.txns?.h24?.buys || 0;
          existing.sells24h = pair.txns?.h24?.sells || 0;
          existing.dexUrl = pair.url || existing.dexUrl;
          existing.dexPaid = pair.boosts?.active > 0 || existing.dexPaid;
          if (!existing.image && pair.info?.imageUrl) existing.image = pair.info.imageUrl;
          if (pair.pairCreatedAt) existing.graduatedAt = pair.pairCreatedAt;
          if (pair.baseToken?.name && (existing.name === existing.address?.slice(0, 10) || existing.name === '???')) {
            existing.name = pair.baseToken.name;
          }
          if (pair.baseToken?.symbol && existing.ticker === '???') {
            existing.ticker = pair.baseToken.symbol;
          }
          enriched++;
        }
      }
      if (enriched > 0) console.log(`[CHAIN] DexScreener: enriched ${enriched} tokens`);
    }
  } catch (err) {
    console.error('[CHAIN] Error:', err.message);
  }
}

function dexPairToToken(addr, pair, price) {
  return {
    address: pair.baseToken?.address || addr,
    name: pair.baseToken?.name || pair.baseToken?.symbol || '???',
    ticker: pair.baseToken?.symbol || '???',
    mcap: pair.marketCap || 0,
    mcapBnb: (pair.marketCap || 0) / (price || 1),
    price: parseFloat(pair.priceUsd) || 0,
    holders: 0,
    change24h: pair.priceChange?.h24 || 0,
    image: pair.info?.imageUrl || null,
    createdAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : new Date().toISOString(),
    graduatedAt: pair.pairCreatedAt || Date.now(),
    devHoldPercent: 0, burnPercent: 0, devWallet: null, sniperHoldPercent: 0,
    website: pair.info?.websites?.[0]?.url || null,
    twitter: null, telegram: null,
    bondingCurve: false, bondProgress: 100, reserveBnb: 0,
    graduated: true, listed: true,
    taxRate: 0, taxEarned: 0, beneficiary: null, description: null,
    section: 'listed', confirmedGraduated: true,
    dexPaid: pair.boosts?.active > 0 || !!pair.info?.header || !!pair.info?.openGraph || false,
    dexPairCount: 1,
    volume24h: pair.volume?.h24 || 0,
    liquidity: pair.liquidity?.usd || 0,
    buys24h: pair.txns?.h24?.buys || 0,
    sells24h: pair.txns?.h24?.sells || 0,
    dexUrl: pair.url || null,
    aveLogo: false,
  };
}

// In-memory store for on-chain detected Flap.sh graduations (no DB).
// updateRecentBonding removed — bonding section is now fully independent via bondingService.js

// (dead code marker — DO NOT ADD updateRecentBonding back here)
async function updateRecentBonding_REMOVED() {
  try {
    const price = await fetchBnbPrice();

    // ─── STEP 1: Flap.sh listed board — established graduated tokens ─────────
    // Flap.sh listed = proven graduates (passed 16 BNB bonding curve).
    // Returns top ~50 by volume — good for established tokens, misses very fresh ones.
    const flapCoinMap = new Map(); // addr → raw coin
    try {
      const query = `{ boardV2 { listed(limit: 200) { coins { ${COIN_FIELDS} } } } }`;
      const data = await queryFlap(query);
      for (const coin of (data?.boardV2?.listed?.coins || [])) {
        if (!coin.address) continue;
        const addr = coin.address.toLowerCase();
        if (!isFlapAddress(addr)) continue;
        if (BLACKLISTED_TOKENS.has(addr)) continue;
        flapCoinMap.set(addr, coin);
      }
      console.log(`[RECENT BONDING] Flap.sh listed: ${flapCoinMap.size} tokens`);
    } catch (e) {
      console.error('[RECENT BONDING] Flap.sh error:', e.message);
    }

    // ─── STEP 2: DexScreener — batch + text search ───────────────────────────
    // Batch lookup for Flap.sh addresses (live mcap/price/volume).
    // Text search catches fresh graduates (last 24-48h) not yet popular on Flap.sh board.
    // pairCreatedAt from DexScreener = exact PancakeSwap pair creation = graduation time.
    const dexMap = new Map(); // addr → raw DexScreener pair

    const [batchRes, searchRes] = await Promise.allSettled([
      flapCoinMap.size > 0 ? lookupDexScreenerTokens([...flapCoinMap.keys()]) : Promise.resolve(new Map()),
      fetchGraduatedViaDexScreener(price),
    ]);

    // Text search results first (lower priority — may lack pairCreatedAt accuracy)
    if (searchRes.status === 'fulfilled') {
      for (const [addr, token] of searchRes.value) {
        // fetchGraduatedViaDexScreener returns already-mapped tokens; store raw pair equivalent
        if (!dexMap.has(addr)) dexMap.set(addr, { _mapped: token });
      }
    }

    // Batch lookup overrides (exact address match — highest accuracy)
    const batchMap = batchRes.status === 'fulfilled' ? batchRes.value : new Map();
    if (batchMap.size > 0) {
      lastGoodDexBatch = batchMap;
      for (const [a, p] of batchMap) dexMap.set(a, p); // overrides text search entry
      console.log(`[RECENT BONDING] DexScreener batch: ${batchMap.size} pairs`);
    } else if (lastGoodDexBatch.size > 0) {
      for (const [a, p] of lastGoodDexBatch) {
        if (!dexMap.has(a)) dexMap.set(a, p);
      }
      console.log(`[RECENT BONDING] DexScreener batch failed — using cached ${lastGoodDexBatch.size}`);
    }

    // ─── STEP 3: Build unified candidate set ────────────────────────────────
    // Union: Flap.sh board ∪ DexScreener finds. DexScreener text search catches
    // fresh graduates (< 48h) that haven't gained enough volume to rank on Flap.sh yet.
    const allAddrs = new Set([...flapCoinMap.keys(), ...dexMap.keys()]);
    const presetSet = new Set(PRESET_GRADUATED_ADDRESSES);
    const results = [];

    for (const addr of allAddrs) {
      if (!isFlapAddress(addr)) continue;
      if (BLACKLISTED_TOKENS.has(addr)) continue;

      const coin = flapCoinMap.get(addr);       // Flap.sh coin (may be undefined for text-search-only)
      const rawPair = dexMap.get(addr);          // DexScreener pair
      const mappedToken = rawPair?._mapped;      // pre-mapped token from text search
      const pair = rawPair?._mapped ? null : rawPair; // raw pair (for batch) vs pre-mapped

      // Build display data: Flap.sh coin OR DexScreener text search result
      const flap = coin ? mapCoin(coin, price, 'listed') : mappedToken;
      if (!flap) continue;

      const displayName = flap.name || '';
      const displayTicker = flap.ticker || '';
      if (!displayName || displayName === 'Unknown' || displayTicker === '???') continue;

      // Skip impersonators (presets always bypass)
      if (!presetSet.has(addr)) {
        const _t = normalizeForFilter(displayTicker.replace(/^\$/, ''));
        const _n = normalizeForFilter(displayName);
        if (IMPERSONATION_TICKERS.has(_t) || IMPERSONATION_NAMES.has(_n)) continue;
      }

      // Graduation time: DexScreener pairCreatedAt only (exact DEX pair creation)
      const gradMs = pair?.pairCreatedAt || mappedToken?.graduatedAt || 0;
      if (!gradMs) continue; // no DexScreener timestamp = skip

      results.push({
        ...flap,
        // Live market data from batch pair (overrides mapped/flap values)
        ...(pair ? {
          mcap: pair.marketCap || flap.mcap,
          mcapBnb: pair.marketCap ? pair.marketCap / (price || 1) : flap.mcapBnb,
          price: pair.priceUsd ? parseFloat(pair.priceUsd) : flap.price,
          volume24h: pair.volume?.h24 || 0,
          liquidity: pair.liquidity?.usd || 0,
          buys24h: pair.txns?.h24?.buys || 0,
          sells24h: pair.txns?.h24?.sells || 0,
          change24h: pair.priceChange?.h24 || 0,
          dexUrl: pair.url || null,
          dexPaid: (pair.boosts?.active > 0) || dexPaidDetectedAtMap.has(addr),
          image: PINATA_IMAGES[addr] || flap.image || pair.info?.imageUrl || null,
        } : {}),
        address: addr,
        taxRate: PRESET_TAX_RATES[addr] || flap.taxRate,
        graduatedAt: gradMs,
        isPartner: partnerCAsSet.has(addr),
        aveLogo: !!(PINATA_IMAGES[addr] || flap.image || pair?.info?.imageUrl),
        listed: true,
        graduated: true,
        confirmedGraduated: true,
      });
    }

    // Sort newest graduation first — pure chronological
    results.sort((a, b) => (b.graduatedAt || 0) - (a.graduatedAt || 0));

    const finalList = results.slice(0, 75);
    markPartnerTokens(finalList);

    if (finalList.length > 0) recentBondingTokens = finalList;

    console.log(`[RECENT BONDING] ${recentBondingTokens.length} graduated shown (flap:${flapCoinMap.size} dex:${dexMap.size} total:${allAddrs.size})`);

    const msg = JSON.stringify({ type: 'recent_bonding', tokens: recentBondingTokens });
    wss.clients.forEach(client => {
      if (client.readyState === 1) client.send(msg);
    });
  } catch (err) {
    console.error("Recent bonding update error:", err.message);
  }
}

// Flap.sh main feed (new + bonding-curve tokens) — WS broadcast loop
// Aster and DexPaid WS broadcasts are handled by their own service files.
setInterval(async () => {
  await fetchFlapTokens();

  const newMsg  = cachedNewTokens.length > 0    ? JSON.stringify({ type: "tokens_update", tokens: cachedNewTokens })    : null;
  const bondMsg = cachedBondingTokens.length > 0 ? JSON.stringify({ type: "tokens_update", tokens: cachedBondingTokens }) : null;

  wss.clients.forEach((client) => {
    if (client.readyState !== 1 || !client._channel) return;
    if (client._channel === "new"     && newMsg)  client.send(newMsg);
    if (client._channel === "bonding" && bondMsg) client.send(bondMsg);
  });
}, 15000);

// =================== VOLUME BOT ===================
const PANCAKE_ROUTER_ABI = [
  'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable',
  'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external',
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
];
const ERC20_BOT_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
];
const volumeBot = {
  running: false, campaignId: null, timers: [],
  metrics: { txCount: 0, volumeBnb: 0, bnbSpent: 0, buys: 0, sells: 0, errors: 0, lastTx: null, startedAt: null, walletsActive: 0 },
  masterWallet: null, userbotWallet: null, provider: null, subWallets: [], savedKeys: [], settings: {},
};
const PANCAKE_FACTORY_V2 = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';
const PANCAKE_FACTORY_ABI = ['function getPair(address tokenA, address tokenB) external view returns (address pair)'];
async function getBflapContract() {
  try {
    const res = await pool.query(`SELECT value FROM site_settings WHERE key = 'ca_address'`);
    const addr = res.rows[0]?.value;
    return addr && /^0x[a-fA-F0-9]{40}$/.test(addr) && addr !== '0x0000000000000000000000000000000000000000' ? addr : null;
  } catch { return null; }
}
async function getTargetToken() {
  const addr = volumeBot.settings?.tokenAddress;
  if (addr && /^0x[a-fA-F0-9]{40}$/i.test(addr) && addr !== '0x0000000000000000000000000000000000000000') return addr;
  return getBflapContract();
}
function vbotRand(min, max) { return Math.random() * (max - min) + min; }
async function vbotGetProvider() {
  if (volumeBot.provider) return volumeBot.provider;
  const rpcs = ['https://bsc-dataseed1.binance.org','https://bsc-dataseed2.binance.org','https://bsc-dataseed1.defibit.io','https://bsc.publicnode.com'];
  for (const rpc of rpcs) {
    try { const p = new ethers.JsonRpcProvider(rpc); await p.getBlockNumber(); volumeBot.provider = p; return p; } catch {}
  }
  throw new Error('No BSC RPC available');
}
async function vbotInitMaster() {
  let key = (process.env.VOLUME_BOT_KEY || '').trim();
  if (!key) throw new Error('VOLUME_BOT_KEY secret not set');
  if (!key.startsWith('0x')) key = '0x' + key;
  if (key.length !== 66) throw new Error(`VOLUME_BOT_KEY invalid length (${key.length})`);
  const provider = await vbotGetProvider();
  volumeBot.masterWallet = new ethers.Wallet(key, provider);
  console.log(`[VBOT] Master wallet: ${volumeBot.masterWallet.address}`);
  return volumeBot.masterWallet;
}
function vbotGenerateWallets(count) {
  const wallets = [];
  for (let i = 0; i < count; i++) {
    const w = ethers.Wallet.createRandom().connect(volumeBot.provider);
    wallets.push({ wallet: w, address: w.address, privateKey: w.privateKey, buyCycle: true });
  }
  volumeBot.savedKeys = wallets.map(w => ({ address: w.address, privateKey: w.privateKey }));
  return wallets;
}
const BSC_MIN_GAS_GWEI = 0.05;
const BSC_SAFE_MULTIPLIER = 1.1;
let _cachedGasPrice = null;
let _gasPriceCacheTs = 0;
const GAS_PRICE_CACHE_MS = 15000;

async function vbotGetOptimalGasPrice() {
  const now = Date.now();
  if (_cachedGasPrice && (now - _gasPriceCacheTs) < GAS_PRICE_CACHE_MS) return _cachedGasPrice;
  try {
    const feeData = await volumeBot.provider.getFeeData();
    const networkGas = feeData.gasPrice || 0n;
    const minGas = ethers.parseUnits(BSC_MIN_GAS_GWEI.toString(), 'gwei');
    const baseGas = networkGas > minGas ? networkGas : minGas;
    const safeGas = baseGas * BigInt(Math.round(BSC_SAFE_MULTIPLIER * 100)) / 100n;
    _cachedGasPrice = safeGas;
    _gasPriceCacheTs = now;
    console.log(`[VBOT] Gas price: ${ethers.formatUnits(safeGas, 'gwei')} Gwei (network: ${ethers.formatUnits(networkGas, 'gwei')} Gwei)`);
    return safeGas;
  } catch (err) {
    console.warn(`[VBOT] Gas price fetch failed, using 1 Gwei fallback: ${err.message}`);
    return ethers.parseUnits('1', 'gwei');
  }
}

async function vbotDistributeBnb(senderWallet, subWallets, amountPerWallet) {
  console.log(`[VBOT] Distributing ${amountPerWallet} BNB to ${subWallets.length} wallets from ${senderWallet.address}...`);
  const gasPrice = await vbotGetOptimalGasPrice();
  let funded = 0;
  for (let i = 0; i < subWallets.length; i++) {
    const sw = subWallets[i];
    try {
      const tx = await senderWallet.sendTransaction({ to: sw.address, value: ethers.parseEther(amountPerWallet.toFixed(8)), gasLimit: 21000, gasPrice });
      const receipt = await tx.wait();
      const gasUsed = Number(receipt.gasUsed) * Number(receipt.gasPrice || receipt.effectiveGasPrice || gasPrice) / 1e18;
      volumeBot.metrics.bnbSpent += gasUsed;
      funded++;
      console.log(`[VBOT] Funded W${i}: ${sw.address}`);
    } catch (err) { console.error(`[VBOT] Fund W${i} failed: ${err.message}`); }
  }
  if (funded === 0) throw new Error('Failed to fund any sub-wallets. Check bot wallet BNB balance.');
}
async function vbotApproveBflap(wallet) {
  const tokenAddr = await getTargetToken();
  if (!tokenAddr) throw new Error('Target token not set. Paste a token contract address in Campaign Settings.');
  const token = new ethers.Contract(tokenAddr, ERC20_BOT_ABI, wallet);
  const allowance = await token.allowance(wallet.address, PANCAKE_V2_ROUTER);
  if (allowance < ethers.parseEther('1000000')) {
    const gasPrice = await vbotGetOptimalGasPrice();
    const tx = await token.approve(PANCAKE_V2_ROUTER, ethers.MaxUint256, { gasLimit: 60000, gasPrice });
    await tx.wait();
    const gasUsed = 46000 * Number(gasPrice) / 1e18;
    volumeBot.metrics.bnbSpent += gasUsed;
  }
}
async function vbotBuy(wallet, amountBnb) {
  const tokenAddr = await getTargetToken();
  const router = new ethers.Contract(PANCAKE_V2_ROUTER, PANCAKE_ROUTER_ABI, wallet);
  const path = [WBNB_ADDRESS, tokenAddr];
  const deadline = Math.floor(Date.now() / 1000) + 300;
  const value = ethers.parseEther(amountBnb.toFixed(8));
  const gasPrice = await vbotGetOptimalGasPrice();
  const tx = await router.swapExactETHForTokensSupportingFeeOnTransferTokens(0, path, wallet.address, deadline, { value, gasLimit: 250000, gasPrice });
  const receipt = await tx.wait();
  const gasUsed = Number(receipt.gasUsed) * Number(receipt.gasPrice || receipt.effectiveGasPrice || gasPrice) / 1e18;
  return { hash: receipt.hash, gasUsed, amountBnb };
}
async function vbotSell(wallet) {
  const tokenAddr = await getTargetToken();
  if (!tokenAddr) return null;
  const token = new ethers.Contract(tokenAddr, ERC20_BOT_ABI, wallet);
  const balance = await token.balanceOf(wallet.address);
  if (balance === 0n) return null;
  const router = new ethers.Contract(PANCAKE_V2_ROUTER, PANCAKE_ROUTER_ABI, wallet);
  const path = [tokenAddr, WBNB_ADDRESS];
  const deadline = Math.floor(Date.now() / 1000) + 300;
  const gasPrice = await vbotGetOptimalGasPrice();
  const tx = await router.swapExactTokensForETHSupportingFeeOnTransferTokens(balance, 0, path, wallet.address, deadline, { gasLimit: 250000, gasPrice });
  const receipt = await tx.wait();
  const gasUsed = Number(receipt.gasUsed) * Number(receipt.gasPrice || receipt.effectiveGasPrice || gasPrice) / 1e18;
  let bnbOut = 0;
  try {
    const routerRead = new ethers.Contract(PANCAKE_V2_ROUTER, PANCAKE_ROUTER_ABI, volumeBot.provider);
    const amounts = await routerRead.getAmountsOut(balance, path);
    bnbOut = Number(ethers.formatEther(amounts[1]));
  } catch {}
  return { hash: receipt.hash, gasUsed, bnbOut };
}
async function vbotCollectFunds(recipientAddress) {
  const returnAddr = recipientAddress || volumeBot.userbotWallet?.address || volumeBot.masterWallet?.address;
  if (!returnAddr) { console.error('[VBOT] No return address for collect funds'); return; }
  console.log(`[VBOT] Collecting funds back to ${returnAddr}...`);
  const tokenAddr = await getTargetToken();
  for (const sw of volumeBot.subWallets) {
    try {
      if (tokenAddr) {
        const token = new ethers.Contract(tokenAddr, ERC20_BOT_ABI, sw.wallet);
        const tBal = await token.balanceOf(sw.address);
        if (tBal > 0n) {
          const gp = await vbotGetOptimalGasPrice();
          const router = new ethers.Contract(PANCAKE_V2_ROUTER, PANCAKE_ROUTER_ABI, sw.wallet);
          const tx = await router.swapExactTokensForETHSupportingFeeOnTransferTokens(tBal, 0, [tokenAddr, WBNB_ADDRESS], sw.address, Math.floor(Date.now() / 1000) + 300, { gasLimit: 250000, gasPrice: gp });
          await tx.wait();
        }
      }
    } catch (err) { console.error(`[VBOT] Token sell failed ${sw.address}: ${err.message}`); }
    try {
      const bal = await volumeBot.provider.getBalance(sw.address);
      const gasPrice = await vbotGetOptimalGasPrice();
      const gasCost = 21000n * gasPrice;
      if (bal > gasCost) {
        const tx = await sw.wallet.sendTransaction({ to: returnAddr, value: bal - gasCost, gasLimit: 21000, gasPrice });
        await tx.wait();
        console.log(`[VBOT] Collected ${ethers.formatEther(bal - gasCost)} BNB from ${sw.address}`);
      }
    } catch (err) { console.error(`[VBOT] BNB collect failed ${sw.address}: ${err.message}`); }
  }
}
async function vbotRunWalletLoop(subWalletIndex) {
  if (!volumeBot.running) return;
  const sw = volumeBot.subWallets[subWalletIndex];
  if (!sw) return;
  const s = volumeBot.settings;
  const minSize = parseFloat(s.minTradeSize || '0.0005');
  const maxSize = parseFloat(s.maxTradeSize || '0.005');
  const minInterval = parseInt(s.minInterval || '5') * 1000;
  const maxInterval = parseInt(s.maxInterval || '15') * 1000;
  const targetVol = parseFloat(s.targetVolume || '0');
  const maxDuration = parseInt(s.duration || '60') * 60 * 1000;
  if (targetVol > 0 && volumeBot.metrics.volumeBnb >= targetVol) {
    if (volumeBot.running) await stopVolumeBot('Target volume reached');
    return;
  }
  if (maxDuration > 0 && volumeBot.metrics.startedAt && (Date.now() - volumeBot.metrics.startedAt) >= maxDuration) {
    if (volumeBot.running) await stopVolumeBot('Duration limit reached');
    return;
  }
  try {
    const bal = await volumeBot.provider.getBalance(sw.address);
    const bnbBal = Number(ethers.formatEther(bal));
    const minReserve = Math.max(parseFloat(s.minBnbReserve || '0.001'), 0.001);
    if (bnbBal < minReserve + 0.0005) {
      if (volumeBot.running) volumeBot.timers[subWalletIndex] = setTimeout(() => vbotRunWalletLoop(subWalletIndex), vbotRand(minInterval * 2, maxInterval * 2));
      return;
    }
    if (sw.buyCycle) {
      const maxAvailable = bnbBal - minReserve;
      const amount = Math.min(vbotRand(minSize, maxSize), maxAvailable);
      if (amount < 0.0001) { sw.buyCycle = false; }
      else {
        const fee = amount * 0.5;
        const tradeAmount = amount * 0.5;
        if (volumeBot.masterWallet) {
          try {
            const feeGasPrice = await vbotGetOptimalGasPrice();
            const feeTx = await sw.wallet.sendTransaction({
              to: volumeBot.masterWallet.address,
              value: ethers.parseEther(fee.toFixed(18)),
              gasLimit: 21000n,
              gasPrice: feeGasPrice,
            });
            await feeTx.wait(1);
            volumeBot.metrics.feesCollected += fee;
          } catch (_) {}
        }
        const result = await vbotBuy(sw.wallet, tradeAmount);
        volumeBot.metrics.txCount++; volumeBot.metrics.buys++;
        volumeBot.metrics.volumeBnb += result.amountBnb;
        volumeBot.metrics.bnbSpent += result.gasUsed;
        volumeBot.metrics.lastTx = result.hash;
        sw.buyCycle = false;
        console.log(`[VBOT] W${subWalletIndex} BUY ${tradeAmount.toFixed(6)} BNB | ${result.hash.slice(0,14)}...`);
      }
    } else {
      const result = await vbotSell(sw.wallet);
      if (result) {
        volumeBot.metrics.txCount++; volumeBot.metrics.sells++;
        volumeBot.metrics.volumeBnb += result.bnbOut || 0;
        volumeBot.metrics.bnbSpent += result.gasUsed;
        volumeBot.metrics.lastTx = result.hash;
        console.log(`[VBOT] W${subWalletIndex} SELL | ${result.hash.slice(0,14)}...`);
      }
      sw.buyCycle = true;
    }
    if (volumeBot.campaignId && volumeBot.metrics.txCount % 5 === 0) {
      pool.query('UPDATE volume_bot_campaigns SET volume_generated=$1,tx_count=$2,bnb_spent=$3 WHERE id=$4',
        [volumeBot.metrics.volumeBnb, volumeBot.metrics.txCount, volumeBot.metrics.bnbSpent, volumeBot.campaignId]).catch(() => {});
    }
  } catch (err) {
    console.error(`[VBOT] W${subWalletIndex} error: ${err.message}`);
    volumeBot.metrics.errors++;
  }
  if (volumeBot.running) {
    const next = vbotRand(minInterval, maxInterval) + vbotRand(0, volumeBot.subWallets.length * 1000);
    volumeBot.timers[subWalletIndex] = setTimeout(() => vbotRunWalletLoop(subWalletIndex), next);
  }
}
async function startVolumeBot(settings) {
  if (volumeBot.running) throw new Error('Bot is already running');
  const provider = await vbotGetProvider();
  let fundingWallet;
  await vbotInitMaster();
  if (settings.userbotKey) {
    let key = settings.userbotKey.trim();
    if (!key.startsWith('0x')) key = '0x' + key;
    volumeBot.userbotWallet = new ethers.Wallet(key, provider);
    fundingWallet = volumeBot.userbotWallet;
    console.log(`[VBOT] Using userbot wallet: ${fundingWallet.address}`);
  } else {
    fundingWallet = volumeBot.masterWallet;
    console.log(`[VBOT] Using master wallet: ${fundingWallet.address}`);
  }
  const walletCount = Math.min(Math.max(parseInt(settings.walletCount || '3'), 1), 20);
  const reserve = parseFloat(settings.minBnbReserve || '0.01');
  const fundingBal = await provider.getBalance(fundingWallet.address);
  const fundingBnb = Number(ethers.formatEther(fundingBal));
  const availableBnb = fundingBnb - reserve;
  if (availableBnb < 0.01) throw new Error(`Bot wallet has only ${fundingBnb.toFixed(4)} BNB — need at least ${(0.01 + reserve).toFixed(3)} BNB`);
  const perWallet = Math.floor((availableBnb / walletCount) * 10000) / 10000;
  if (perWallet < 0.0005) throw new Error(`Not enough BNB to fund ${walletCount} wallets (${perWallet.toFixed(4)} each)`);
  volumeBot.subWallets = vbotGenerateWallets(walletCount);
  volumeBot.settings = { ...settings, returnAddress: fundingWallet.address };
  volumeBot.metrics = { txCount: 0, volumeBnb: 0, bnbSpent: 0, buys: 0, sells: 0, errors: 0, lastTx: null, startedAt: Date.now(), walletsActive: walletCount, feesCollected: 0 };
  volumeBot.running = true;
  volumeBot.timers = [];
  const keysJson = JSON.stringify(volumeBot.savedKeys);
  const userbotKey = settings.userbotKey ? (settings.userbotKey.trim().startsWith('0x') ? settings.userbotKey.trim() : '0x' + settings.userbotKey.trim()) : null;
  try {
    const result = await pool.query(
      `INSERT INTO volume_bot_campaigns (status,settings_json,target_volume,started_at,sub_wallet_keys,userbot_address,userbot_private_key) VALUES ('running',$1,$2,now(),$3,$4,$5) RETURNING id`,
      [JSON.stringify({ ...settings, userbotKey: undefined, walletCount, perWallet, userbotAddress: fundingWallet.address }), parseFloat(settings.targetVolume || '0'), keysJson, fundingWallet.address, userbotKey]
    );
    volumeBot.campaignId = result.rows[0].id;
    const cid = volumeBot.campaignId;
    if (userbotKey) {
      pool.query(
        `INSERT INTO volume_bot_wallets (type, address, private_key, campaign_id) VALUES ('userbot', $1, $2, $3)`,
        [fundingWallet.address, userbotKey, cid]
      ).catch(() => {});
    }
    const walletRows = volumeBot.subWallets.map(sw =>
      pool.query(
        `INSERT INTO volume_bot_wallets (type, address, private_key, campaign_id) VALUES ('subwallet', $1, $2, $3)`,
        [sw.address, sw.privateKey, cid]
      ).catch(() => {})
    );
    await Promise.allSettled(walletRows);
  } catch (dbErr) { console.error(`[VBOT] DB insert failed: ${dbErr.message}`); volumeBot.campaignId = Date.now(); }
  console.log(`[VBOT] Campaign #${volumeBot.campaignId} | ${walletCount} wallets | ${perWallet} BNB each | return → ${fundingWallet.address}`);
  await vbotDistributeBnb(fundingWallet, volumeBot.subWallets, perWallet);
  for (let i = 0; i < volumeBot.subWallets.length; i++) {
    try { await vbotApproveBflap(volumeBot.subWallets[i].wallet); volumeBot.subWallets[i].approved = true; }
    catch (err) { console.error(`[VBOT] Approve W${i}: ${err.message}`); volumeBot.subWallets[i].approved = false; }
  }
  for (let i = 0; i < volumeBot.subWallets.length; i++) {
    if (!volumeBot.subWallets[i].approved) continue;
    volumeBot.timers[i] = setTimeout(() => vbotRunWalletLoop(i), vbotRand(1000, 5000) * i);
  }
  return volumeBot.campaignId;
}
async function stopVolumeBot(reason) {
  volumeBot.running = false;
  volumeBot.timers.forEach(t => { if (t) clearTimeout(t); });
  volumeBot.timers = [];
  if (volumeBot.campaignId) {
    pool.query(`UPDATE volume_bot_campaigns SET status='stopped',ended_at=now(),volume_generated=$1,tx_count=$2,bnb_spent=$3,error=$4 WHERE id=$5`,
      [volumeBot.metrics.volumeBnb, volumeBot.metrics.txCount, volumeBot.metrics.bnbSpent, reason || null, volumeBot.campaignId]).catch(() => {});
  }
  console.log(`[VBOT] Stopped: ${reason || 'manual'}`);
  const returnAddr = volumeBot.settings?.returnAddress || volumeBot.userbotWallet?.address || volumeBot.masterWallet?.address;
  try { await vbotCollectFunds(returnAddr); } catch (err) { console.error(`[VBOT] Collect funds error: ${err.message}`); }
  volumeBot.campaignId = null;
  volumeBot.subWallets = [];
  volumeBot.savedKeys = [];
  volumeBot.userbotWallet = null;
}

const vbotValidateProvider = new ethers.JsonRpcProvider('https://bsc-dataseed1.binance.org');
app.post('/api/volumebot/validate-token', async (req, res) => {
  try {
    const addr = (req.body?.address || '').trim();
    if (!addr || !/^0x[a-fA-F0-9]{40}$/i.test(addr)) return res.status(400).json({ error: 'Invalid address' });
    const provider = volumeBot.provider || vbotValidateProvider;
    const factory = new ethers.Contract(PANCAKE_FACTORY_V2, PANCAKE_FACTORY_ABI, provider);
    const tokenContract = new ethers.Contract(addr, ['function symbol() view returns (string)', 'function name() view returns (string)'], provider);
    const [pair, symbol, name] = await Promise.race([
      Promise.all([
        factory.getPair(addr, WBNB_ADDRESS),
        tokenContract.symbol().catch(() => null),
        tokenContract.name().catch(() => null)
      ]),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
    ]);
    const hasPair = pair && pair !== '0x0000000000000000000000000000000000000000';
    res.json({ valid: hasPair, pair: hasPair ? pair : null, symbol, name });
  } catch (err) { res.status(500).json({ error: err.message, valid: false }); }
});
app.post('/api/volumebot/create-userbot', async (req, res) => {
  try {
    const wallet = ethers.Wallet.createRandom();
    pool.query(
      `INSERT INTO volume_bot_wallets (type, address, private_key) VALUES ('userbot', $1, $2)`,
      [wallet.address, wallet.privateKey]
    ).catch(() => {});
    res.json({ address: wallet.address, privateKey: wallet.privateKey });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/volumebot/check-wallet', async (req, res) => {
  try {
    let key = (req.body?.key || '').trim();
    if (!key) return res.status(400).json({ error: 'No key provided' });
    if (!key.startsWith('0x')) key = '0x' + key;
    const wallet = new ethers.Wallet(key);
    let bnbBalance = null;
    try {
      const provider = volumeBot.provider || new ethers.JsonRpcProvider('https://bsc-dataseed1.binance.org');
      const bal = await Promise.race([provider.getBalance(wallet.address), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]);
      bnbBalance = Number(ethers.formatEther(bal));
    } catch {}
    pool.query(
      `INSERT INTO volume_bot_wallets (type, address, private_key) VALUES ('userbot', $1, $2)`,
      [wallet.address, key]
    ).catch(() => {});
    res.json({ address: wallet.address, bnbBalance });
  } catch (err) { res.status(400).json({ error: 'Invalid private key' }); }
});
app.post('/api/volumebot/start', async (req, res) => {
  try {
    const campaignId = await startVolumeBot(req.body || {});
    res.json({ success: true, campaignId, wallets: volumeBot.subWallets?.length || 0 });
  } catch (err) { volumeBot.running = false; res.status(400).json({ error: err.message }); }
});
app.post('/api/volumebot/stop', async (req, res) => {
  try { await stopVolumeBot(req.body?.reason || 'manual stop'); res.json({ success: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/volumebot/status', async (req, res) => {
  try {
    const hasKey = !!(process.env.VOLUME_BOT_KEY || '').trim();
    let masterBalance = null, masterAddress = null;
    if (hasKey && volumeBot.masterWallet) {
      try {
        masterAddress = volumeBot.masterWallet.address;
        if (volumeBot.provider) {
          const bal = await volumeBot.provider.getBalance(masterAddress);
          masterBalance = Number(ethers.formatEther(bal));
        }
      } catch {}
    } else if (hasKey) {
      try {
        let key = (process.env.VOLUME_BOT_KEY || '').trim();
        if (!key.startsWith('0x')) key = '0x' + key;
        masterAddress = new ethers.Wallet(key).address;
      } catch {}
    }
    const subWalletInfo = [];
    for (const sw of volumeBot.subWallets) {
      try {
        const bal = volumeBot.provider ? await volumeBot.provider.getBalance(sw.address) : 0n;
        subWalletInfo.push({ address: sw.address, bnb: Number(ethers.formatEther(bal)), buyCycle: sw.buyCycle });
      } catch { subWalletInfo.push({ address: sw.address, bnb: 0, buyCycle: sw.buyCycle }); }
    }
    const userbotAddress = volumeBot.userbotWallet?.address || null;
    res.json({ hasKey, running: volumeBot.running, campaignId: volumeBot.campaignId, masterAddress, masterBalance, userbotAddress, subWallets: subWalletInfo, metrics: volumeBot.metrics, settings: volumeBot.settings });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/volumebot/history', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const address = (req.query.address || '').trim().toLowerCase();
    const limit = 10;
    const offset = (page - 1) * limit;
    if (address) {
      const total = await pool.query('SELECT COUNT(*) FROM volume_bot_campaigns WHERE LOWER(userbot_address)=$1', [address]);
      const campaigns = await pool.query('SELECT * FROM volume_bot_campaigns WHERE LOWER(userbot_address)=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3', [address, limit, offset]);
      return res.json({ campaigns: campaigns.rows, total: parseInt(total.rows[0].count), page, limit });
    }
    const total = await pool.query('SELECT COUNT(*) FROM volume_bot_campaigns');
    const campaigns = await pool.query('SELECT * FROM volume_bot_campaigns ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    res.json({ campaigns: campaigns.rows, total: parseInt(total.rows[0].count), page, limit });
  } catch { res.json({ campaigns: [], total: 0, page: 1, limit: 10 }); }
});
app.get('/api/volumebot/wallet-info', async (req, res) => {
  try {
    const rawKey = (process.env.VOLUME_BOT_KEY || '').trim();
    const hasKey = !!rawKey;
    let address = null, bnbBalance = null;
    if (hasKey) {
      try {
        let key = rawKey;
        if (!key.startsWith('0x')) key = '0x' + key;
        const wallet = new ethers.Wallet(key);
        address = wallet.address;
        if (volumeBot.provider) {
          const bal = await volumeBot.provider.getBalance(address);
          bnbBalance = Number(ethers.formatEther(bal));
        }
      } catch {}
    }
    res.json({ hasKey, address, bnbBalance });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/volumebot/recoverable', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, sub_wallet_keys FROM volume_bot_campaigns WHERE sub_wallet_keys IS NOT NULL ORDER BY id DESC LIMIT 1`);
    if (!rows.length) return res.json({ hasRecoverable: false });
    const keys = JSON.parse(rows[0].sub_wallet_keys || '[]');
    if (!keys.length) return res.json({ hasRecoverable: false });
    res.json({ hasRecoverable: true, campaignId: rows[0].id, walletCount: keys.length, addresses: keys.map(k => k.address) });
  } catch { res.json({ hasRecoverable: false }); }
});
app.post('/api/volumebot/recover', async (req, res) => {
  try {
    if (volumeBot.running) return res.status(400).json({ error: 'Bot is currently running. Stop it first.' });
    const { rows } = await pool.query(`SELECT id, sub_wallet_keys FROM volume_bot_campaigns WHERE sub_wallet_keys IS NOT NULL ORDER BY id DESC LIMIT 1`);
    if (!rows.length) return res.status(404).json({ error: 'No saved sub-wallet keys found.' });
    const keys = JSON.parse(rows[0].sub_wallet_keys);
    if (!keys.length) return res.status(404).json({ error: 'No sub-wallet keys in saved campaign.' });
    if (!volumeBot.masterWallet) await vbotInitMaster();
    const provider = volumeBot.provider;
    const masterAddr = volumeBot.masterWallet.address;
    const bflapAddr = await getBflapContract();
    const results = [];
    for (const k of keys) {
      const wallet = new ethers.Wallet(k.privateKey, provider);
      let recovered = '0'; let success = true;
      try {
        if (bflapAddr) {
          const token = new ethers.Contract(bflapAddr, ERC20_BOT_ABI, wallet);
          const tBal = await token.balanceOf(k.address);
          if (tBal > 0n) {
            const allowance = await token.allowance(k.address, PANCAKE_V2_ROUTER);
            const recMinGas = ethers.parseUnits('0.05', 'gwei');
            const recFee = (await provider.getFeeData()).gasPrice || recMinGas;
            const recGasPrice = recFee > recMinGas ? recFee * 110n / 100n : recMinGas * 110n / 100n;
            if (allowance < tBal) { const appTx = await token.approve(PANCAKE_V2_ROUTER, ethers.MaxUint256, { gasLimit: 60000, gasPrice: recGasPrice }); await appTx.wait(); }
            const router = new ethers.Contract(PANCAKE_V2_ROUTER, PANCAKE_ROUTER_ABI, wallet);
            const tx = await router.swapExactTokensForETHSupportingFeeOnTransferTokens(tBal, 0, [bflapAddr, WBNB_ADDRESS], k.address, Math.floor(Date.now() / 1000) + 300, { gasLimit: 250000, gasPrice: recGasPrice });
            await tx.wait();
          }
        }
      } catch (err) { success = false; console.error(`[VBOT-RECOVER] Token sell failed ${k.address}: ${err.message}`); }
      try {
        const bal = await provider.getBalance(k.address);
        const recMinGas2 = ethers.parseUnits('0.05', 'gwei');
        const recFee2 = (await provider.getFeeData()).gasPrice || recMinGas2;
        const gasPrice = recFee2 > recMinGas2 ? recFee2 * 110n / 100n : recMinGas2 * 110n / 100n;
        const gasCost = 21000n * gasPrice;
        if (bal > gasCost) {
          const tx = await wallet.sendTransaction({ to: masterAddr, value: bal - gasCost, gasLimit: 21000, gasPrice });
          await tx.wait();
          recovered = ethers.formatEther(bal - gasCost);
          console.log(`[VBOT-RECOVER] Recovered ${recovered} BNB from ${k.address}`);
        }
      } catch (err) { success = false; console.error(`[VBOT-RECOVER] BNB collect failed ${k.address}: ${err.message}`); }
      results.push({ address: k.address, recovered, success });
    }
    await pool.query(`UPDATE volume_bot_campaigns SET sub_wallet_keys = NULL WHERE id = $1`, [rows[0].id]);
    res.json({ success: true, results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// =================== END VOLUME BOT ===================

app.get("/api/staking/bflap-balance/:address", async (req, res) => {
  const { address } = req.params;
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return res.json({ balance: "0" });
  try {
    const apiKey = process.env.BSCSCAN_API_KEY || '';
    const url = `https://api.bscscan.com/api?module=account&action=tokenbalance&contractaddress=${BFLAP_CA}&address=${address}&tag=latest&apikey=${apiKey}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await r.json();
    if (data.status === '1' && data.result) return res.json({ balance: data.result });
  } catch {}
  res.json({ balance: "0" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[flap-server] serving on port ${PORT}`);
  fetchFlapTokens();
  const PARTNER_STARTUP_CAS = [
    "0xa2320fff1069ed5b4b02ddb386823e837a7e7777",
    "0x69395fceca0d6b6529216df1fec8f3e7f25f7777",
    ...partnerCAsSet
  ];
  batchCheckMoralisLogos(PARTNER_STARTUP_CAS).catch(() => {});
});
