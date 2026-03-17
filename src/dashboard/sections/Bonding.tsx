// ════════════════════════════════════════════════════════════════
// DASHBOARD > Bonding section  (card list at /dashboard#bonding)
// API: GET /api/bonding-section → bondingListedService.js
// DATA: Graduated tokens (passed 16 BNB bonding curve)
// SOURCE: blockchain LaunchedToDEX events + AVE enrichment
// DO NOT CONFUSE WITH: /bonding (homepage bubble map → BondingPage.tsx)
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw, ExternalLink, Search, X } from "lucide-react";
import { usePagination } from "../usePagination";
import Pagination from "../Pagination";

interface ListedToken {
  address: string;
  ca: string;
  name: string;
  ticker: string;
  mcap: number;
  volume24h: number;
  change24h: number;
  liquidity: number;
  holders: number;
  image: string | null;
  listedAt: number;
  createdAt: string;
  exchange: string;
  dexUrl: string;
  flapUrl: string;
  bscUrl: string;
  risk: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  riskScore: number;
  buys24h: number;
  sells24h: number;
}

type SortMode = "newest" | "trending" | "topvolume" | "losers";
type RiskFilter = "ALL" | "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

const POLL_MS = 60_000;

function fmt(n: number): string {
  if (!n || isNaN(n)) return "$0";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function timeAgo(ts: number): string {
  if (!ts) return "unknown";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `about ${h} hour${h !== 1 ? "s" : ""} ago`;
  }
  const d = Math.floor(diff / 86400);
  return `${d} day${d !== 1 ? "s" : ""} ago`;
}

function shortAddr(addr: string): string {
  if (!addr) return "";
  const suffix = addr.slice(-4);
  return `${addr.slice(0, 6)}...${suffix}`;
}

const RISK_STYLES: Record<string, string> = {
  CRITICAL: "bg-red-900/40 border border-red-500/40 text-red-400",
  HIGH:     "bg-orange-900/40 border border-orange-500/40 text-orange-400",
  MEDIUM:   "bg-yellow-900/40 border border-yellow-500/40 text-yellow-400",
  LOW:      "bg-green-900/40 border border-green-500/40 text-green-400",
};

function TokenCard({ token }: { token: ListedToken }) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <div className="bg-[#0a0a14] border border-[#1e1e3a] rounded-xl p-4 hover:border-[#5b31fe]/40 transition-all flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          {token.image && !imgErr ? (
            <img
              src={token.image}
              alt={token.ticker}
              onError={() => setImgErr(true)}
              className="w-11 h-11 rounded-full object-cover bg-[#1e1e3a]"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-[#1e1e3a] flex items-center justify-center text-white/30 text-sm font-bold">
              {token.ticker.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate leading-tight">{token.name}</p>
              <p className="text-white/40 text-[11px] truncate">{token.ticker} · {token.exchange}</p>
              <p className="text-white/20 text-[10px] font-mono mt-0.5">{shortAddr(token.address)}</p>
            </div>
            <span className="flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-900/40 border border-emerald-500/40 text-emerald-400">
              GRADUATED
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <div>
          <p className="text-[9px] text-white/30 uppercase tracking-wider">Market Cap</p>
          <p className="text-white font-bold text-sm">{fmt(token.mcap)}</p>
        </div>
        <div>
          <p className="text-[9px] text-white/30 uppercase tracking-wider">Listed</p>
          <p className="text-white/60 text-xs">{timeAgo(token.listedAt)}</p>
        </div>
        <div>
          <p className="text-[9px] text-white/30 uppercase tracking-wider">Liquidity</p>
          <p className="text-white/70 text-xs">{fmt(token.liquidity)}</p>
        </div>
        {token.volume24h > 0 && (
          <div>
            <p className="text-[9px] text-white/30 uppercase tracking-wider">Vol 24h</p>
            <p className="text-white/70 text-xs">{fmt(token.volume24h)}</p>
          </div>
        )}
        {token.change24h !== 0 && (
          <div>
            <p className="text-[9px] text-white/30 uppercase tracking-wider">24h %</p>
            <p className={`text-xs font-medium ${token.change24h >= 0 ? "text-green-400" : "text-red-400"}`}>
              {token.change24h >= 0 ? "+" : ""}{token.change24h.toFixed(1)}%
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-[#1e1e3a]">
        <a
          href={`https://bscscan.com/token/${token.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/80 px-2.5 py-1.5 rounded-md bg-[#0f0f1e] border border-[#1e1e3a] hover:border-[#5b31fe]/30 transition-all"
        >
          <span className="font-bold text-[9px] text-orange-400">BSC</span>
          <ExternalLink size={9} />
        </a>
        <a
          href={`https://flap.sh/token/${token.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-white/40 hover:text-white/80 px-2.5 py-1.5 rounded-md bg-[#0f0f1e] border border-[#1e1e3a] hover:border-[#5b31fe]/30 transition-all"
        >
          <span className="text-[10px]">Flap.sh</span>
          <ExternalLink size={9} />
        </a>
        {token.dexUrl && (
          <a
            href={token.dexUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-[10px] text-white/40 hover:text-[#5b31fe] px-2.5 py-1.5 rounded-md bg-[#0f0f1e] border border-[#1e1e3a] hover:border-[#5b31fe]/30 transition-all"
          >
            Chart <ExternalLink size={9} />
          </a>
        )}
      </div>
    </div>
  );
}

function applySort(tokens: ListedToken[], mode: SortMode): ListedToken[] {
  const copy = [...tokens];
  switch (mode) {
    case "newest":    return copy.sort((a, b) => (b.listedAt || 0) - (a.listedAt || 0));
    case "trending":  return copy.sort((a, b) => (b.buys24h + b.sells24h) - (a.buys24h + a.sells24h));
    case "topvolume": return copy.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
    case "losers":    return copy.sort((a, b) => (a.change24h || 0) - (b.change24h || 0));
    default:          return copy;
  }
}

export default function DashBonding() {
  const [allTokens, setAllTokens]   = useState<ListedToken[]>([]);
  const [loading, setLoading]       = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sort, setSort]             = useState<SortMode>("newest");
  const [risk, setRisk]             = useState<RiskFilter>("ALL");
  const [search, setSearch]         = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res  = await fetch("/api/bonding-section");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data.tokens)) {
        setAllTokens(data.tokens);
        setLastUpdated(new Date());
      }
    } catch (e) {
      console.error("[Bonding] fetch error:", e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(() => load(true), POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  const filtered = (() => {
    let tokens = allTokens;
    if (risk !== "ALL") tokens = tokens.filter(t => t.risk === risk);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      tokens = tokens.filter(t =>
        t.name.toLowerCase().includes(q) ||
        t.ticker.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q)
      );
    }
    return applySort(tokens, sort);
  })();

  const { paged, page, setPage, totalPages, total } = usePagination(filtered);

  const SORT_TABS: { id: SortMode; label: string }[] = [
    { id: "newest",    label: "Newest" },
    { id: "trending",  label: "Trending" },
    { id: "topvolume", label: "Top Volume" },
    { id: "losers",    label: "Losers" },
  ];

  const RISK_TABS: RiskFilter[] = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const RISK_ACTIVE: Record<RiskFilter, string> = {
    ALL:      "bg-white/10 text-white",
    CRITICAL: "bg-red-900/50 border-red-500/50 text-red-300",
    HIGH:     "bg-orange-900/50 border-orange-500/50 text-orange-300",
    MEDIUM:   "bg-yellow-900/50 border-yellow-500/50 text-yellow-300",
    LOW:      "bg-green-900/50 border-green-500/50 text-green-300",
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-bold text-white">Listed on Dex</h2>
            <p className="text-[11px] text-white/35 mt-0.5">Real-time BSC token feed · Flap.sh graduated tokens</p>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && !loading && (
              <span className="text-[10px] text-white/20 hidden sm:block">
                Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
            <button
              onClick={() => load()}
              className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white px-3 py-2 rounded-lg border border-[#1e1e3a] hover:border-[#5b31fe]/40 bg-[#0a0a14] transition-all"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by symbol, name, or contract address..."
            className="w-full bg-[#0a0a14] border border-[#1e1e3a] rounded-lg pl-9 pr-9 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#5b31fe]/60"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70">
              <X size={13} />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            {SORT_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setSort(tab.id); setPage(1); }}
                className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                  sort === tab.id
                    ? "bg-[#5b31fe]/20 border-[#5b31fe]/50 text-white"
                    : "bg-transparent border-transparent text-white/40 hover:text-white/70 hover:border-[#1e1e3a]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-white/30 mr-1">RISK</span>
            {RISK_TABS.map(r => (
              <button
                key={r}
                onClick={() => { setRisk(r); setPage(1); }}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-md border transition-all ${
                  risk === r
                    ? `${RISK_ACTIVE[r]} border-current`
                    : "bg-transparent border-[#1e1e3a] text-white/30 hover:text-white/60"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {!loading && total > 0 && (
          <p className="text-[11px] text-white/30">{total} token{total !== 1 ? "s" : ""}</p>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="h-[180px] rounded-xl bg-[#0a0a14] border border-[#1e1e3a] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30 text-sm">
          {search ? "No tokens matching your search" : "No graduated tokens found"}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {paged.map((t) => (
              <TokenCard key={t.address} token={t} />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
