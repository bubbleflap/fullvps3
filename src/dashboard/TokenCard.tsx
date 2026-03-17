import { useEffect, useRef, useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import type { DToken } from "./types";

const SHAKE_STYLE_ID = "dash-card-shake-style";

const BUBBLE_COLORS = [
  "rgba(91,49,254,0.45)",
  "rgba(91,49,254,0.3)",
  "rgba(213,247,4,0.4)",
  "rgba(213,247,4,0.25)",
  "rgba(255,255,255,0.15)",
];

const BUBBLE_SIZES = [2, 3, 4, 5, 3];

function injectShakeStyle() {
  if (document.getElementById(SHAKE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SHAKE_STYLE_ID;
  style.textContent = `
    @keyframes dash-card-shake {
      0%   { transform: scale(1) translateX(0) rotate(0deg);         box-shadow: 0 0 0 0 rgba(91,49,254,0); }
      3%   { transform: scale(1.06) translateX(-10px) rotate(-1.2deg); box-shadow: 0 0 24px 10px rgba(91,49,254,0.75); }
      6%   { transform: scale(1.07) translateX(10px) rotate(1.2deg);  box-shadow: 0 0 30px 14px rgba(91,49,254,0.85); }
      9%   { transform: scale(1.07) translateX(-10px) rotate(-1deg);  box-shadow: 0 0 32px 16px rgba(213,247,4,0.7); }
      12%  { transform: scale(1.08) translateX(10px) rotate(1deg);    box-shadow: 0 0 34px 18px rgba(213,247,4,0.75); }
      15%  { transform: scale(1.07) translateX(-9px) rotate(-0.9deg); box-shadow: 0 0 30px 14px rgba(91,49,254,0.7); }
      18%  { transform: scale(1.07) translateX(9px) rotate(0.9deg);   box-shadow: 0 0 28px 12px rgba(91,49,254,0.65); }
      21%  { transform: scale(1.06) translateX(-8px) rotate(-0.8deg); box-shadow: 0 0 26px 11px rgba(213,247,4,0.6); }
      24%  { transform: scale(1.06) translateX(8px) rotate(0.8deg);   }
      27%  { transform: scale(1.05) translateX(-7px) rotate(-0.6deg); box-shadow: 0 0 22px 9px rgba(91,49,254,0.55); }
      30%  { transform: scale(1.05) translateX(7px) rotate(0.6deg);   }
      35%  { transform: scale(1.04) translateX(-5px) rotate(-0.5deg); box-shadow: 0 0 18px 7px rgba(91,49,254,0.45); }
      40%  { transform: scale(1.04) translateX(5px) rotate(0.5deg);   }
      48%  { transform: scale(1.03) translateX(-3px) rotate(-0.3deg); box-shadow: 0 0 14px 5px rgba(91,49,254,0.35); }
      56%  { transform: scale(1.02) translateX(3px) rotate(0.3deg);   }
      65%  { transform: scale(1.01) translateX(-2px) rotate(-0.15deg);box-shadow: 0 0 8px 3px rgba(91,49,254,0.2); }
      80%  { transform: scale(1.01) translateX(1px) rotate(0.1deg);   }
      100% { transform: scale(1) translateX(0) rotate(0deg);          box-shadow: 0 0 0 0 rgba(91,49,254,0); }
    }
    .dash-card-shake {
      animation: dash-card-shake 4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
      border-color: rgba(213,247,4,0.9) !important;
      z-index: 10;
    }
  `;
  document.head.appendChild(style);
}

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

function fmtNum(n?: number, prefix = ""): string {
  if (n == null || isNaN(n)) return "—";
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(1)}K`;
  return `${prefix}${n.toFixed(0)}`;
}

function fmtPct(n?: number): string {
  if (n == null || isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function fmtPrice(n?: number): string {
  if (n == null || isNaN(n) || n === 0) return "$0";
  if (n >= 1) return `$${n.toFixed(4)}`;
  const str = n.toFixed(12).replace(/0+$/, "");
  const [, dec] = str.split(".");
  if (!dec) return `$${n.toFixed(4)}`;
  const zeros = dec.match(/^0+/)?.[0].length ?? 0;
  if (zeros >= 4) return `$0.0(${zeros})${dec.slice(zeros, zeros + 4)}`;
  return `$${n.toPrecision(4)}`;
}

function shortAddr(addr?: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

interface TokenCardProps {
  token: DToken;
  rank?: number;
  badge?: string;
  badgeColor?: string;
  isNew?: boolean;
}

export default function TokenCard({ token, rank, badge, badgeColor = "bg-red-600", isNew }: TokenCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const bubbleContainerRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const ca = token.address || token.ca || "";

  const copyCA = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ca) return;
    navigator.clipboard.writeText(ca).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [ca]);
  const gradTs = typeof token.graduatedAt === "number"
    ? token.graduatedAt
    : token.graduatedAt ? new Date(token.graduatedAt).getTime() : 0;
  const createdTs = token.createdAt ? new Date(token.createdAt).getTime() : 0;
  const displayTs = (token as any).listedAt || gradTs || createdTs;

  useEffect(() => { injectShakeStyle(); }, []);

  // Bubble rain effect
  useEffect(() => {
    const container = bubbleContainerRef.current;
    if (!container) return;

    const interval = setInterval(() => {
      const size = BUBBLE_SIZES[Math.floor(Math.random() * BUBBLE_SIZES.length)];
      const color = BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)];
      const left = Math.floor(Math.random() * Math.max(container.offsetWidth - size, 10));

      const bubble = document.createElement("div");
      bubble.className = "bubble-rise";
      bubble.style.cssText = `
        position: absolute;
        border-radius: 100%;
        bottom: 2px;
        left: ${left}px;
        width: ${size}px;
        height: ${size}px;
        background-color: ${color};
        z-index: 1;
        pointer-events: none;
      `;
      container.appendChild(bubble);
      setTimeout(() => bubble.remove(), 3100);
    }, 700);

    return () => clearInterval(interval);
  }, []);

  // Shake on new token — class follows isNew state directly
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    if (isNew) {
      el.classList.remove("dash-card-shake");
      void el.offsetWidth; // force reflow so animation restarts cleanly
      el.classList.add("dash-card-shake");
    } else {
      el.classList.remove("dash-card-shake");
    }
  }, [isNew]);

  return (
    <div
      ref={cardRef}
      className={`db-card relative flex flex-col gap-0 rounded-xl border transition-all duration-150 overflow-hidden cursor-pointer ${expanded ? "border-[#5b31fe]/60 bg-[#111128]" : "border-[#1e1e3a] bg-[#0f0f1e] hover:border-[#5b31fe]/30 hover:bg-[#0f0f1e]"}`}
      onClick={() => setExpanded(e => !e)}
    >
      {/* Bubble rain container — floats above card content */}
      <div
        ref={bubbleContainerRef}
        className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl"
        style={{ zIndex: 20 }}
      />

      <div className="relative z-10 px-3 pt-3 pb-2 flex items-start gap-2">
        {/* Left: avatar + info */}
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {token.image && !imgErr ? (
            <img src={token.image} alt={token.name}
              onError={() => setImgErr(true)}
              className="w-9 h-9 rounded-full object-cover flex-shrink-0 bg-[#1a1a2e]" />
          ) : (
            <div className="w-9 h-9 rounded-full flex-shrink-0 bg-gradient-to-br from-[#5b31fe]/50 to-purple-900/50 flex items-center justify-center text-[10px] font-bold text-white/70">
              {(token.ticker || token.name || "?").slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            {/* Name + badge on same row */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="font-bold text-[13px] text-white truncate leading-tight">
                {token.name || shortAddr(ca)}
              </div>
              {isNew && (
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full text-black bg-[#d5f704] animate-pulse flex-shrink-0">NEW</span>
              )}
              {badge && !isNew && (
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full text-white flex-shrink-0 ${badgeColor}`}>{badge}</span>
              )}
            </div>
            <div className="text-[10px] text-white/40 truncate">
              {token.ticker && token.ticker !== "???" ? `${token.ticker} · ` : ""}{token.dexUrl ? "PANCAKESWAP" : "DEX"}
            </div>
            {/* Status pills */}
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                style={token.dexUrl ? { background: "#16a34a", color: "#dcfce7" } : token.dexPaid ? { background: "#16a34a", color: "#dcfce7" } : { background: "#dc2626", color: "#fecaca" }}>
                {token.dexUrl ? "PCS ✓" : token.dexPaid ? "DEX ✓" : "DEX ✗"}
              </span>
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                style={token.aveLogo ? { background: "#7c3aed", color: "#ede9fe" } : { background: "#374151", color: "#9ca3af" }}>
                Ave {token.aveLogo ? "✓" : "✗"}
              </span>
            </div>
          </div>
        </div>

        {/* Right: large platform icon tiles only */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {/* 3 platform icon tiles */}
          <div className="flex items-center gap-1.5">
            <a href={`https://www.dextools.io/app/en/bnb/pair-explorer/${ca}`}
              target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              title="DexTools"
              className="w-11 h-11 rounded-xl flex items-center justify-center hover:opacity-80 transition-opacity"
              style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)" }}>
              <img src="/assets/dextools-logo.webp" alt="DexTools" className="w-7 h-7 object-contain" />
            </a>
            <a href={`https://ave.ai/token/${ca}-bsc?ref=5189577935`}
              target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              title="Ave.ai"
              className="w-11 h-11 rounded-xl flex items-center justify-center hover:opacity-80 transition-opacity"
              style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)" }}>
              <img src="/assets/ave-logo.webp" alt="Ave.ai" className="w-7 h-7 object-contain" />
            </a>
            <a href={token.dexUrl || `https://dexscreener.com/bsc/${ca}`}
              target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              title="DexScreener"
              className="w-11 h-11 rounded-xl flex items-center justify-center hover:opacity-80 transition-opacity"
              style={{ background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)" }}>
              <img src="/assets/dexscreener-logo.webp" alt="DexScreener" className="w-7 h-7 object-contain" />
            </a>
          </div>
        </div>
      </div>

      <div className="relative z-10 px-3 pb-2">
        <button
          onClick={copyCA}
          className="group flex items-center gap-1.5 w-full text-left"
          title="Copy contract address"
        >
          <span className="text-[10px] text-white/25 font-mono truncate group-hover:text-white/50 transition-colors">
            {ca}
          </span>
          <span className="flex-shrink-0 text-white/20 group-hover:text-[#d5f704] transition-colors">
            {copied ? <Check size={10} /> : <Copy size={10} />}
          </span>
        </button>
      </div>

      <div className="relative z-10 grid grid-cols-2 gap-0 border-t border-[#1a1a2e] px-3 py-2">
        <div>
          <div className="text-[9px] text-white/30 uppercase tracking-wider">Market Cap</div>
          <div className="text-[12px] font-bold text-white/80 mt-0.5">{fmtMcap(token.mcap)}</div>
        </div>
        <div>
          <div className="text-[9px] text-white/30 uppercase tracking-wider">Listed</div>
          <div className="text-[11px] text-white/60 mt-0.5">{timeAgo(displayTs)}</div>
        </div>
      </div>

      {/* Click-reveal tooltip */}
      <div className={`relative z-10 overflow-hidden transition-all duration-200 ease-out ${expanded ? "max-h-[200px]" : "max-h-0"}`}>
        <div className="mx-3 mb-2 rounded-xl bg-[#080814] border border-[#5b31fe]/30 overflow-hidden">

          {/* Status badges row */}
          <div className="flex items-center gap-1.5 px-3 pt-2 pb-1.5">
            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full border border-white/15 text-white/50 bg-white/5">
              {token.graduated ? "Graduated" : token.bondProgress && token.bondProgress > 0 ? `Bonding ${token.bondProgress.toFixed(0)}%` : "Not Bonding"}
            </span>
            {(token.buyTax != null || token.sellTax != null) && (
              <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full border border-[#d5f704]/30 text-[#d5f704]/80 bg-[#d5f704]/5">
                {token.buyTax != null ? `${token.buyTax.toFixed(0)}%` : `${token.sellTax!.toFixed(0)}%`} tax
              </span>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-white/35">MCap</span>
              <span className="text-[10px] font-semibold text-white/80">{fmtMcap(token.mcap)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-white/35">Price</span>
              <span className="text-[10px] font-semibold text-white/80">{fmtPrice(token.price)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-white/35">Holders</span>
              <span className="text-[10px] font-semibold text-white/80">{fmtNum(token.holders)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-white/35">Age</span>
              <span className="text-[10px] font-semibold text-white/80">{timeAgo(displayTs)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-white/35">Dev Hold</span>
              <span className="text-[10px] font-semibold text-white/80">{token.devHoldPercent != null ? `${token.devHoldPercent.toFixed(1)}%` : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9px] text-white/35">Tax</span>
              <span className="text-[10px] font-semibold text-[#d5f704]/80">{token.buyTax != null ? `${token.buyTax.toFixed(0)}%` : "—"}</span>
            </div>
          </div>

        </div>
      </div>

      <div className="relative z-10 flex items-center gap-1.5 px-3 pb-3 border-t border-[#1a1a2e] pt-2">
        <a
          href={`https://bscscan.com/token/${ca}`}
          target="_blank" rel="noopener noreferrer"
          className="group flex items-center gap-1 text-[9px] font-bold text-white/40 px-2 py-1 rounded bg-[#1a1a2e] hover:bg-[#252540] transition-colors"
          onClick={e => e.stopPropagation()}
          title="BscScan"
        >
          <img src="/assets/bsc-icon.png" alt="BSC" className="w-3 h-3 object-contain" />
          <span className="group-hover:text-[#d5f704] transition-colors">BSC</span>
        </a>
        <a
          href={`https://flap.sh/bnb/${ca}`}
          target="_blank" rel="noopener noreferrer"
          className="group flex items-center gap-1 text-[9px] font-bold text-white/40 px-2 py-1 rounded bg-[#1a1a2e] hover:bg-[#1e1e3a] transition-colors"
          onClick={e => e.stopPropagation()}
          title="Flap.sh"
        >
          <img src="/assets/flap-icon.png" alt="Flap" className="w-3 h-3 object-contain" />
          <span className="group-hover:text-[#d5f704] transition-colors">Flap.sh</span>
        </a>
        <div className="ml-auto flex items-center gap-1">
          <a
            href={token.dexUrl || `https://dexscreener.com/bsc/${ca}`}
            target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            title="Chart"
            className="flex items-center gap-0.5 text-[9px] font-bold text-[#5b31fe]/70 hover:text-white px-2 py-1 rounded bg-[#5b31fe]/10 hover:bg-[#5b31fe]/30 border border-[#5b31fe]/20 hover:border-[#5b31fe]/60 transition-all"
          >📊 Chart</a>
          <button
            onClick={e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("open-chatbot", { detail: { ca } })); }}
            title="Ask Bot"
            className="flex items-center gap-1 text-[9px] font-bold text-green-400/60 hover:text-green-300 px-2 py-1 rounded bg-green-500/8 hover:bg-green-500/20 border border-green-500/15 hover:border-green-500/40 transition-all"
          >
            <img src="/assets/bot.webp" alt="" className="w-3 h-3 rounded-full object-cover flex-shrink-0" />
            Ask Bot
          </button>
          <a
            href={`https://t.me/BubbleFlapBot?start=ref_5189577935_${ca}`}
            target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            title="Quick Buy via Bot"
            className="flex items-center gap-0.5 text-[9px] font-bold text-[#d5f704]/70 hover:text-[#d5f704] px-2 py-1 rounded bg-[#d5f704]/8 hover:bg-[#d5f704]/20 border border-[#d5f704]/15 hover:border-[#d5f704]/40 transition-all"
          >⚡ Quick Buy</a>
        </div>
      </div>
    </div>
  );
}
