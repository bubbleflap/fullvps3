import { useState, useEffect, useCallback, type RefObject } from "react";
import { ExternalLink, Copy, Globe, Twitter, Send, RefreshCw, Zap, TrendingUp, TrendingDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useLang } from "../lib/i18n";
import type { ChatBotHandle } from "./ChatBot";
import type { Token } from "../lib/types";
import TokenTooltip from "./TokenTooltip";
import type { PageView } from "./Header";

interface DexPaidToken {
  address: string;
  name: string;
  ticker: string;
  icon: string | null;
  header: string | null;
  description: string | null;
  mcap: number;
  priceUsd: string | null;
  volume24h: number;
  priceChange24h: number;
  liquidity: number;
  pairAddress: string | null;
  dexUrl: string;
  boostAmount: number;
  type: string;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  discord: string | null;
  createdAt: string | null;
  pairCreatedAt: number | null;
  dexPaidDetectedAt: number | null;
  holders: number;
  taxRate: number;
}

interface DexPaidProps {
  chatBotRef?: RefObject<ChatBotHandle | null>;
  onPageChange: (page: PageView) => void;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n > 0) return `$${n.toFixed(2)}`;
  return "—";
}

function formatPrice(p: string | null): string {
  if (!p) return "—";
  const num = parseFloat(p);
  if (num < 0.00001) return `$${num.toExponential(2)}`;
  if (num < 0.01) return `$${num.toFixed(6)}`;
  if (num < 1) return `$${num.toFixed(4)}`;
  return `$${num.toFixed(2)}`;
}

function formatDateTime(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const PER_PAGE = 15;

export default function DexPaid({ chatBotRef, onPageChange }: DexPaidProps) {
  const { t } = useLang();
  const [tokens, setTokens] = useState<DexPaidToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pinnedToken, setPinnedToken] = useState<Token | null>(null);
  const [pinnedRect, setPinnedRect] = useState<DOMRect | null>(null);
  const [bnbPrice, setBnbPrice] = useState(0);

  const fetchTokens = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/dexpaid-tokens");
      const data = await res.json();
      setTokens(data.tokens || []);
      if (data.bnbPrice) setBnbPrice(data.bnbPrice);
    } catch (err) {
      console.error("Failed to fetch dex paid tokens:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTokens();
    const interval = setInterval(fetchTokens, 30000);
    return () => clearInterval(interval);
  }, [fetchTokens]);


  const copyCA = (addr: string) => {
    navigator.clipboard.writeText(addr).then(() => {
      setCopiedAddr(addr);
      setTimeout(() => setCopiedAddr(null), 2000);
    });
  };

  const askBot = (ca: string) => {
    if (chatBotRef?.current) {
      chatBotRef.current.lookupCA(ca);
    }
  };

  const handleTokenClick = (token: any, rect: DOMRect) => {
    const mappedToken: Token = {
      id: token.address,
      ca: token.address,
      name: token.name,
      ticker: token.ticker,
      image: token.icon || "/assets/logo.png",
      mcap: token.mcap,
      mcapBnb: token.mcap / (bnbPrice || 600),
      price: parseFloat(token.priceUsd || "0"),
      holders: token.holders,
      createdAt: token.pairCreatedAt || Date.now(),
      devHoldPercent: 0,
      devWallet: "",
      burnPercent: 0,
      listed: true,
      graduated: true,
      dexUrl: token.dexUrl,
      website: token.website || null,
      twitter: token.twitter || null,
      telegram: token.telegram || null,
      taxRate: token.taxRate,
      taxEarned: 0,
      beneficiary: null,
      volume24h: token.volume24h,
      liquidity: token.liquidity,
      change24h: token.priceChange24h,
      buys24h: 0,
      sells24h: 0,
      bondingCurve: false,
      bondProgress: 100,
      reserveBnb: 0,
      dexPaid: true,
      dexPairCount: 1,
      aveLogo: false,
      sniperHoldPercent: 0,
      activityBoost: 0,
      description: token.description || null,
      section: "listed",
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
    };
    setPinnedToken(mappedToken);
    setPinnedRect(rect);
  };

  const handleDismissTooltip = () => {
    setPinnedToken(null);
    setPinnedRect(null);
  };

  if (loading && tokens.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="text-center space-y-4">
          <RefreshCw size={32} className="text-[#5b31fe] animate-spin mx-auto" />
          <p className="text-white/50 text-sm">{t.loadingDexPaid}</p>
        </div>
      </div>
    );
  }

  if (!loading && tokens.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="text-center space-y-4">
          <Zap size={32} className="text-[#d5f704] mx-auto" />
          <h2 className="text-xl font-bold">{t.noDexPaidTitle}</h2>
          <p className="text-white/50 text-sm max-w-xs">{t.noDexPaidDesc}</p>
          <button onClick={fetchTokens} className="inline-flex items-center gap-2 bg-[#5b31fe]/20 text-[#5b31fe] text-sm font-medium px-4 py-2 rounded-lg border border-[#5b31fe]/30 hover:bg-[#5b31fe]/30 transition-colors">
            <RefreshCw size={14} /> {t.refresh}
          </button>
        </div>
      </div>
    );
  }

  const sortedTokens = [...tokens].sort((a, b) => (b.dexPaidDetectedAt || 0) - (a.dexPaidDetectedAt || 0)).slice(0, 60);

  const totalPages = Math.ceil(sortedTokens.length / PER_PAGE);
  const pageTokens = sortedTokens.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  return (
    <div className="w-full h-full overflow-y-auto pt-20 pb-24 px-2 sm:px-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-1.5">
              <Zap size={14} className="text-green-400" />
              <span className="text-green-400 text-xs font-bold uppercase tracking-wider">{t.latestDexPaid}</span>
            </div>
            <span className="text-white/30 text-xs">{sortedTokens.length} {t.tokens}</span>
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          </div>
          <button onClick={fetchTokens} className="text-white/30 hover:text-white/60 transition-colors p-2 rounded-lg hover:bg-white/5" title={t.refresh as string}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>


        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pageTokens.map((token, i) => (
            <div
              key={token.address}
              onClick={(e) => handleTokenClick(token, e.currentTarget.getBoundingClientRect())}
              className="group relative bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden hover:border-[#5b31fe]/30 hover:bg-white/[0.05] transition-all duration-300 cursor-pointer"
            >
              {token.header ? (
                <div className="h-24 overflow-hidden relative">
                  <img
                    src={token.header}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    {token.boostAmount > 0 && (
                      <span className="flex items-center gap-1 bg-[#d5f704]/20 text-[#d5f704] text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-[#d5f704]/30">
                        <Zap size={8} /> {token.boostAmount}
                      </span>
                    )}
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                      #{page * PER_PAGE + i + 1}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="h-12 bg-gradient-to-r from-[#5b31fe]/10 to-transparent relative">
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    {token.boostAmount > 0 && (
                      <span className="flex items-center gap-1 bg-[#d5f704]/20 text-[#d5f704] text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-[#d5f704]/30">
                        <Zap size={8} /> {token.boostAmount}
                      </span>
                    )}
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                      #{page * PER_PAGE + i + 1}
                    </span>
                  </div>
                </div>
              )}

              <div className="p-3 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/10 bg-white/5 flex-shrink-0 -mt-5 relative z-10">
                    {token.icon ? (
                      <img src={token.icon} alt={token.ticker} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white/40">{token.ticker.slice(0, 2)}</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 -mt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm truncate">{token.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[#d5f704] text-xs font-medium">${token.ticker}</span>
                      <span className="text-[10px] text-white/30">{formatDateTime(token.pairCreatedAt)}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/[0.03] rounded-lg px-2.5 py-1.5">
                    <div className="text-[10px] text-white/30 uppercase">MCap</div>
                    <div className="text-xs font-bold text-white/90">{formatNumber(token.mcap)}</div>
                  </div>
                  <div className="bg-white/[0.03] rounded-lg px-2.5 py-1.5">
                    <div className="text-[10px] text-white/30 uppercase">{t.price}</div>
                    <div className="text-xs font-bold text-white/90">{formatPrice(token.priceUsd)}</div>
                  </div>
                  <div className="bg-white/[0.03] rounded-lg px-2.5 py-1.5">
                    <div className="text-[10px] text-white/30 uppercase">{t.vol24h}</div>
                    <div className="text-xs font-bold text-white/90">{formatNumber(token.volume24h)}</div>
                  </div>
                  <div className="bg-white/[0.03] rounded-lg px-2.5 py-1.5">
                    <div className="text-[10px] text-white/30 uppercase">{t.h24}</div>
                    <div className={`text-xs font-bold flex items-center gap-0.5 ${token.priceChange24h >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {token.priceChange24h >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {token.priceChange24h >= 0 ? "+" : ""}{token.priceChange24h?.toFixed(1) || "0"}%
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-white/30">
                  <span>{t.pairCreated}: {formatDateTime(token.pairCreatedAt)}</span>
                  <span className="text-green-400/60">{t.timeDexPaid}: {formatDateTime(token.dexPaidDetectedAt)}</span>
                </div>

                {token.description && (
                  <p className="text-[11px] text-white/40 leading-relaxed line-clamp-2">{token.description}</p>
                )}

                <div className="flex items-center gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => copyCA(token.address)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-white/[0.05] hover:bg-[#5b31fe]/20 text-white/60 hover:text-[#5b31fe] text-[10px] font-medium py-1.5 rounded-lg transition-colors border border-white/[0.06] hover:border-[#5b31fe]/30"
                  >
                    <Copy size={10} />
                    {copiedAddr === token.address ? t.copied : t.copyCA}
                  </button>
                  <a
                    href={token.dexUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-[10px] font-medium px-3 py-1.5 rounded-lg transition-colors border border-green-500/20"
                  >
                    <ExternalLink size={10} /> {t.chart}
                  </a>
                  <button
                    onClick={() => askBot(token.address)}
                    className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-colors hover:opacity-80"
                    style={{ backgroundColor: "#d4f602", color: "#000" }}
                  >
                    <img src="/assets/logo.png" alt="" className="w-3.5 h-3.5 rounded-full" />
                    {t.askBot}
                  </button>
                  {token.website && (
                    <a href={token.website} target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-white/60 transition-colors p-1.5 rounded-lg hover:bg-white/5">
                      <Globe size={12} />
                    </a>
                  )}
                  {token.twitter && (
                    <a href={token.twitter} target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-white/60 transition-colors p-1.5 rounded-lg hover:bg-white/5">
                      <Twitter size={12} />
                    </a>
                  )}
                  {token.telegram && (
                    <a href={token.telegram} target="_blank" rel="noopener noreferrer" className="text-white/30 hover:text-white/60 transition-colors p-1.5 rounded-lg hover:bg-white/5">
                      <Send size={12} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              onClick={() => { setPage(Math.max(0, page - 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              disabled={page === 0}
              className={`flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-lg border transition-all ${page === 0 ? "text-white/20 border-white/[0.04] cursor-not-allowed" : "text-white/70 border-white/10 hover:bg-white/10 hover:text-white"}`}
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => { setPage(i); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className={`text-xs font-bold w-8 h-8 rounded-lg border transition-all ${page === i ? "bg-[#5b31fe]/30 text-white border-[#5b31fe]/50" : "text-white/40 border-white/[0.06] hover:bg-white/10 hover:text-white/70"}`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => { setPage(Math.min(totalPages - 1, page + 1)); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              disabled={page === totalPages - 1}
              className={`flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-lg border transition-all ${page === totalPages - 1 ? "text-white/20 border-white/[0.04] cursor-not-allowed" : "text-white/70 border-white/10 hover:bg-white/10 hover:text-white"}`}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        <div className="text-center mt-6 text-white/20 text-[10px]">
          {t.dexPaidFooter} &middot; BSC/BNB &middot; {t.updatesEvery30s}
        </div>
      </div>

      {pinnedToken && pinnedRect && (
        <>
          <div className="fixed inset-0 z-[199]" onClick={handleDismissTooltip} onTouchStart={handleDismissTooltip} />
          <TokenTooltip 
            token={pinnedToken} 
            rect={pinnedRect} 
            onAskBot={(ca) => { handleDismissTooltip(); askBot(ca); }} 
            onQuickSwap={(ca) => {
              handleDismissTooltip();
              onPageChange("bflapswap");
            }}
          />
        </>
      )}
    </div>
  );
}
