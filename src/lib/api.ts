import type { Token, RawToken } from "./types";

const DEFAULT_IMAGES = [
  "/assets/rocket_coin_icon-Cs8cimT6.png",
  "/assets/bot.png",
];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomRange(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function mapRawToken(raw: RawToken): Token {
  return {
    id: raw.address,
    name: raw.name || "New Token",
    ticker: raw.ticker || "???",
    ca: raw.address,
    devWallet: raw.devWallet || null,
    mcap: raw.mcap || 0,
    mcapBnb: raw.mcapBnb || 0,
    price: raw.price || 0,
    createdAt: raw.createdAt ? new Date(raw.createdAt).getTime() : Date.now(),
    holders: raw.holders || 0,
    image: raw.image || randomFrom(DEFAULT_IMAGES),
    change24h: raw.change24h || 0,
    x: randomRange(-800, 800),
    y: randomRange(-500, 500),
    vx: randomRange(-0.3, 0.3),
    vy: randomRange(-0.3, 0.3),
    activityBoost: 0,
    devHoldPercent: raw.devHoldPercent || 0,
    burnPercent: raw.burnPercent || 0,
    sniperHoldPercent: raw.sniperHoldPercent || 0,
    website: raw.website || null,
    twitter: raw.twitter || null,
    telegram: raw.telegram || null,
    bondingCurve: raw.bondingCurve ?? false,
    bondProgress: raw.bondProgress || 0,
    reserveBnb: raw.reserveBnb || 0,
    graduated: raw.graduated ?? false,
    listed: raw.listed ?? false,
    taxRate: raw.taxRate || 0,
    taxEarned: raw.taxEarned || 0,
    beneficiary: raw.beneficiary || null,
    dexPaid: raw.dexPaid ?? false,
    dexPairCount: raw.dexPairCount || 0,
    aveLogo: raw.aveLogo ?? false,
    description: raw.description || null,
    section: raw.section || "newlyCreated",
    newlyDetectedAt: raw.newlyDetectedAt || undefined,
    volume24h: raw.volume24h || 0,
    liquidity: raw.liquidity || 0,
    buys24h: raw.buys24h || 0,
    sells24h: raw.sells24h || 0,
    dexUrl: raw.dexUrl || null,
    isPartner: raw.isPartner || undefined,
  };
}

export async function fetchFlapTokens(): Promise<Token[]> {
  try {
    const res = await fetch("/api/tokens");
    if (!res.ok) {
      console.error("API error:", res.status);
      return [];
    }
    const data = await res.json();
    if (!data.tokens || data.tokens.length === 0) {
      console.log("No tokens from API");
      return [];
    }
    console.log(`Got ${data.tokens.length} tokens from server`);
    return data.tokens.map(mapRawToken);
  } catch (e) {
    console.error("Failed to fetch:", e);
    return [];
  }
}

export async function fetchNewTokens(): Promise<Token[]> {
  try {
    const res = await fetch("/api/new-tokens");
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.tokens || data.tokens.length === 0) return [];
    return data.tokens.map(mapRawToken);
  } catch (e) {
    console.error("Failed to fetch new tokens:", e);
    return [];
  }
}

export async function fetchBondingTokens(): Promise<Token[]> {
  try {
    const res = await fetch("/api/bonding-tokens");
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.tokens || data.tokens.length === 0) return [];
    return data.tokens.map(mapRawToken);
  } catch (e) {
    console.error("Failed to fetch bonding tokens:", e);
    return [];
  }
}

export async function fetchNewAsterTokens(): Promise<Token[]> {
  try {
    const res = await fetch("/api/new-tokens-aster");
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.tokens || data.tokens.length === 0) return [];
    return data.tokens.map(mapRawToken);
  } catch (e) {
    console.error("Failed to fetch ASTER new tokens:", e);
    return [];
  }
}

export async function fetchBondingAsterTokens(): Promise<Token[]> {
  try {
    const res = await fetch("/api/bonding-tokens-aster");
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.tokens || data.tokens.length === 0) return [];
    return data.tokens.map(mapRawToken);
  } catch (e) {
    console.error("Failed to fetch ASTER bonding tokens:", e);
    return [];
  }
}

export async function fetchRecentBonding(): Promise<Token[]> {
  try {
    const res = await fetch("/api/recent-bonding");
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.tokens || data.tokens.length === 0) return [];
    return data.tokens.map(mapRawToken);
  } catch (e) {
    console.error("Failed to fetch recent bonding:", e);
    return [];
  }
}

export async function refreshRecentBonding(): Promise<{ success: boolean; count: number; tokens?: Token[] }> {
  try {
    const res = await fetch("/api/recent-bonding/refresh", { method: "POST" });
    if (!res.ok) return { success: false, count: 0 };
    const data = await res.json();
    if (data.tokens) {
      data.tokens = data.tokens.map(mapRawToken);
    }
    return data;
  } catch {
    return { success: false, count: 0 };
  }
}

export const NEWEST_POSITIONS = [
  { x: 0, y: -180 },
  { x: -220, y: -60 },
  { x: 220, y: -60 },
  { x: -150, y: 120 },
  { x: 150, y: 120 },
  { x: 0, y: 60 },
];
