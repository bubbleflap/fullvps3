// ════════════════════════════════════════════════════════════════
// DASHBOARD > Partner section  (card list at /dashboard#partner)
// API: GET /api/partner-tokens
// DATA: Curated partner tokens (from DB partner_tokens table)
// SOURCE: cachedNewTokens + cachedBondingTokens filtered by partnerCAsSet
// ════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { RefreshCw, Loader2, X } from "lucide-react";
import TokenCard from "../TokenCard";
import { useGlobalSearch } from "../useGlobalSearch";
import { usePagination } from "../usePagination";
import Pagination from "../Pagination";
import type { DToken } from "../types";

async function fetchPartner(): Promise<DToken[]> {
  try {
    const res = await fetch("/api/partner-tokens");
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.tokens)) return data.tokens;
    return [];
  } catch { return []; }
}

export default function DashPartner() {
  const [tokens, setTokens] = useState<DToken[]>([]);
  const [loading, setLoading] = useState(true);
  const { search, setSearch, filtered, isSearching } = useGlobalSearch(tokens);
  const { paged, page, setPage, totalPages, total } = usePagination(filtered);

  async function load() {
    setLoading(true);
    const data = await fetchPartner();
    setTokens(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
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
        <button onClick={load} className="ml-3 flex items-center gap-1.5 text-xs text-white/50 hover:text-white px-3 py-2 rounded-lg border border-[#1e1e3a] hover:border-[#5b31fe]/40 bg-[#0f0f1e] transition-all">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-[140px] rounded-xl bg-[#0f0f1e] border border-[#1e1e3a] animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30 text-sm">{isSearching ? "Searching…" : "No partner tokens found"}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {paged.map((t, i) => (
              <TokenCard key={t.address || t.ca || i} token={t} rank={(page - 1) * 15 + i + 1} badge="Partner" badgeColor="bg-purple-700" />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
