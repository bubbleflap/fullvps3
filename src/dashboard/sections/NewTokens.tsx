// ════════════════════════════════════════════════════════════════
// DASHBOARD > New Tokens section  (card list at /dashboard#newtokens)
// API: GET /api/new-tokens + WebSocket channel "new"
// DATA: Newly created Flap.sh tokens (not yet graduated)
// SOURCE: cachedNewTokens from Flap.sh GraphQL newlyCreated
// DO NOT CONFUSE WITH: / (homepage bubble map → NewTokenPage.tsx)
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw, Wifi, WifiOff, Loader2, X } from "lucide-react";
import TokenCard from "../TokenCard";
import { dashFetchNewTokens } from "../api";
import { useGlobalSearch } from "../useGlobalSearch";
import { usePagination } from "../usePagination";
import Pagination from "../Pagination";
import type { DToken } from "../types";

const MAX_TOKENS = 75;

function rawToDToken(raw: Record<string, unknown>): DToken {
  return {
    address: (raw.ca || raw.address) as string | undefined,
    ca: (raw.ca || raw.address) as string | undefined,
    name: raw.name as string | undefined,
    ticker: raw.ticker as string | undefined,
    image: raw.image as string | undefined,
    mcap: raw.mcap as number | undefined,
    price: raw.price as number | undefined,
    liquidity: raw.liquidity as number | undefined,
    volume24h: raw.volume24h as number | undefined,
    buys24h: raw.buys24h as number | undefined,
    sells24h: raw.sells24h as number | undefined,
    createdAt: raw.createdAt as string | undefined,
    graduatedAt: raw.graduatedAt as number | string | undefined,
    dexUrl: raw.dexUrl as string | undefined,
    change24h: raw.change24h as number | undefined,
    holders: raw.holders as number | undefined,
    bondProgress: raw.bondProgress as number | undefined,
    graduated: raw.graduated as boolean | undefined,
    dexPaid: raw.dexPaid as boolean | undefined,
    devHoldPercent: raw.devHoldPercent as number | undefined,
    buyTax: raw.buyTax as number | undefined,
    sellTax: raw.sellTax as number | undefined,
  };
}

export default function DashNewTokens() {
  const [tokens, setTokens] = useState<DToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const { search, setSearch, filtered, isSearching } = useGlobalSearch(tokens);
  const { paged, page, setPage, totalPages, total } = usePagination(filtered);

  const knownIds = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newIdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const detectAndMarkNew = useCallback((incoming: DToken[]) => {
    if (knownIds.current.size === 0) return;
    const fresh = new Set<string>();
    incoming.forEach(t => {
      const id = t.address || t.ca || "";
      if (id && !knownIds.current.has(id)) fresh.add(id);
    });
    if (fresh.size > 0) {
      setNewIds(fresh);
      if (newIdTimerRef.current) clearTimeout(newIdTimerRef.current);
      newIdTimerRef.current = setTimeout(() => setNewIds(new Set()), 4500);
    }
  }, []);

  const applyTokens = useCallback((incoming: DToken[]) => {
    const sorted = [...incoming].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
    const sliced = sorted.slice(0, MAX_TOKENS);
    detectAndMarkNew(sliced);
    knownIds.current = new Set(sliced.map(t => t.address || t.ca || "").filter(Boolean));
    setTokens(sliced);
  }, [detectAndMarkNew]);

  const connectWs = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws`;
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        ws.send(JSON.stringify({ type: "subscribe", channel: "new" }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "tokens_update" && Array.isArray(data.tokens)) {
            const mapped = (data.tokens as Record<string, unknown>[]).map(rawToDToken);
            setLoading(false);
            applyTokens(mapped);
          }
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectRef.current = setTimeout(connectWs, 3000);
      };

      ws.onerror = () => setConnected(false);
    } catch {
      reconnectRef.current = setTimeout(connectWs, 3000);
    }
  }, [applyTokens]);

  const doRefresh = useCallback(async () => {
    setLoading(true);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectRef.current) clearTimeout(reconnectRef.current);

    const data = await dashFetchNewTokens();
    applyTokens(data);
    setLoading(false);
    setTimeout(connectWs, 200);
  }, [applyTokens, connectWs]);

  useEffect(() => {
    dashFetchNewTokens().then(data => {
      applyTokens(data);
      setLoading(false);
    });
    connectWs();

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (newIdTimerRef.current) clearTimeout(newIdTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 relative">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search & scan Flap.sh tokens — symbol, name, or CA..."
            className="w-full bg-[#0a0a14] border border-[#1e1e3a] rounded-lg px-4 py-2.5 pr-9 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#5b31fe]/60"
          />
          {isSearching
            ? <Loader2 size={13} className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-[#5b31fe]/60" />
            : search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors">
                <X size={13} />
              </button>
            )
          }
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className={`flex items-center gap-1 text-[10px] px-2 py-1.5 rounded-lg border ${connected ? "border-green-500/30 text-green-400" : "border-red-500/20 text-red-400/60"}`}
            style={{ background: connected ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)" }}>
            {connected ? <Wifi size={10} /> : <WifiOff size={10} />}
            <span className="hidden sm:block">{connected ? "Live" : "Offline"}</span>
          </div>
          <button
            onClick={doRefresh}
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white px-3 py-2 rounded-lg border border-[#1e1e3a] hover:border-[#5b31fe]/40 bg-[#0f0f1e] transition-all"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-[140px] rounded-xl bg-[#0f0f1e] border border-[#1e1e3a] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30 text-sm">{isSearching ? "Searching…" : "No tokens found"}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {paged.map((t, i) => {
              const id = t.address || t.ca || String(i);
              return (
                <TokenCard key={id} token={t} rank={(page - 1) * 15 + i + 1} isNew={newIds.has(id)} />
              );
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
