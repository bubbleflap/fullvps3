import { useState, useCallback } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import type { DToken } from "./types";

function timeAgo(ts: number | string | undefined): string {
  if (!ts) return "—";
  const ms = typeof ts === "number" ? ts : new Date(ts).getTime();
  if (!ms) return "—";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtMcap(n?: number): string {
  if (!n) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function shortAddr(addr?: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function getRisk(mcap?: number): { label: string; color: string; bg: string } {
  const m = mcap || 0;
  if (m === 0 || m < 1_000)   return { label: "Critical", color: "#f87171", bg: "rgba(239,68,68,0.15)" };
  if (m < 10_000)              return { label: "High",     color: "#fb923c", bg: "rgba(249,115,22,0.15)" };
  if (m < 100_000)             return { label: "Medium",   color: "#facc15", bg: "rgba(234,179,8,0.15)" };
  return                              { label: "Low",      color: "#4ade80", bg: "rgba(74,222,128,0.15)" };
}

interface Props { token: DToken }

export default function BondingCard({ token }: Props) {
  const [copied, setCopied] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const ca = token.address || token.ca || "";
  const displayTs = token.listedAt
    || (typeof token.graduatedAt === "number" ? token.graduatedAt
      : token.graduatedAt ? new Date(token.graduatedAt).getTime() : 0)
    || (token.createdAt ? new Date(token.createdAt).getTime() : 0);
  const risk = getRisk(token.mcap);

  const copyCA = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ca) return;
    navigator.clipboard.writeText(ca).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [ca]);

  return (
    <div className="flex flex-col rounded-xl border border-[#1a1a30] bg-[#08080f] hover:border-[#2a2a50] hover:bg-[#0b0b16] transition-all duration-150">

      {/* Top section */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        {token.image && !imgErr ? (
          <img src={token.image} alt={token.name}
            onError={() => setImgErr(true)}
            className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            style={{ background: "#111" }} />
        ) : (
          <div className="w-10 h-10 rounded-full flex-shrink-0 bg-[#1a1a3a] flex items-center justify-center text-xs font-bold text-white/50">
            {(token.ticker || token.name || "?").slice(0, 2).toUpperCase()}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-[14px] text-white truncate leading-none">
              {token.name || shortAddr(ca)}
            </span>
            <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-sm"
              style={{ color: risk.color, background: risk.bg }}>
              {risk.label}
            </span>
          </div>
          <div className="text-[11px] text-white/40 mt-0.5 truncate">
            {token.ticker && token.ticker !== "???" ? `${token.ticker} · ` : ""}
            {token.dexUrl ? "PANCAKESWAP" : "DEX UNKNOWN"}
          </div>
        </div>
      </div>

      {/* CA row */}
      <div className="px-4 pb-3">
        <button onClick={copyCA}
          className="group flex items-center gap-1.5 text-left w-full">
          <span className="text-[11px] font-mono text-white/35 group-hover:text-white/60 transition-colors truncate">
            {shortAddr(ca)}
          </span>
          <span className="flex-shrink-0 text-white/20 group-hover:text-[#d5f704] transition-colors">
            {copied ? <Check size={10} /> : <Copy size={10} />}
          </span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 border-t border-[#121220] px-4 py-3">
        <div>
          <div className="text-[9px] font-medium text-white/25 uppercase tracking-widest mb-1">Market Cap</div>
          <div className="text-[13px] font-bold text-white/85">{fmtMcap(token.mcap)}</div>
        </div>
        <div>
          <div className="text-[9px] font-medium text-white/25 uppercase tracking-widest mb-1">Listed</div>
          <div className="text-[13px] font-semibold text-white/65">{timeAgo(displayTs)}</div>
        </div>
      </div>

      {/* Links */}
      <div className="flex items-center gap-2 border-t border-[#121220] px-4 py-2.5">
        <a href={`https://bscscan.com/token/${ca}`} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-1 text-[10px] font-semibold text-white/40 hover:text-white/80 px-2 py-1 rounded bg-[#0f0f1e] hover:bg-[#1a1a2e] border border-[#1e1e3a] transition-all">
          <img src="/assets/bsc-icon.png" alt="" className="w-3 h-3 object-contain" />
          Bsc
          <ExternalLink size={9} className="opacity-50" />
        </a>
        <a href={`https://flap.sh/bnb/${ca}`} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-1 text-[10px] font-semibold text-white/40 hover:text-white/80 px-2 py-1 rounded bg-[#0f0f1e] hover:bg-[#1a1a2e] border border-[#1e1e3a] transition-all">
          <img src="/assets/flap-icon.png" alt="" className="w-3 h-3 object-contain" />
          Flap.sh
          <ExternalLink size={9} className="opacity-50" />
        </a>
        <a href={token.dexUrl || `https://dexscreener.com/bsc/${ca}`} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-1 text-[10px] font-semibold text-white/40 hover:text-white/80 px-2 py-1 rounded bg-[#0f0f1e] hover:bg-[#1a1a2e] border border-[#1e1e3a] transition-all">
          <img src="/assets/dexscreener-logo.webp" alt="" className="w-3 h-3 object-contain" />
          Chart
          <ExternalLink size={9} className="opacity-50" />
        </a>
      </div>
    </div>
  );
}
