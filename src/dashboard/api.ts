import type { DToken } from "./types";

async function safeFetch(url: string): Promise<DToken[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.tokens)) return data.tokens;
    return [];
  } catch {
    return [];
  }
}

export const dashFetchRecentBonding = () => safeFetch("/api/bonded-tokens");
export const dashFetchNewTokens = () => safeFetch("/api/new-tokens");
export const dashFetchBonding = () => safeFetch("/api/bonding-tokens");
export const dashFetchDexPaid = () => safeFetch("/api/dexpaid-tokens");

export const dashFetchAllTokens = () => safeFetch("/api/tokens");

export async function dashTokenLookup(address: string): Promise<DToken | null> {
  try {
    const res = await fetch(`/api/token-lookup/${encodeURIComponent(address)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.token || null;
  } catch {
    return null;
  }
}
