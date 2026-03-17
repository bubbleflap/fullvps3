import { useState, useRef, useCallback } from "react";
import type { Token } from "../lib/types";
import { useLang } from "../lib/i18n";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";

interface RecentBondingProps {
  tokens: Token[];
  onAskBot: (ca: string) => void;
  isOpen?: boolean;
  onToggle?: () => void;
}

const BFLAP_CA = "0xa2320fff1069ed5b4b02ddb386823e837a7e7777";

const MIN_WIDTH = 280;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 320;

export default function RecentBonding({ tokens, onAskBot, isOpen, onToggle }: RecentBondingProps) {
  const { t } = useLang();
  const [page, setPage] = useState(0);
  const [internalOpen, setInternalOpen] = useState(false);
  const isCollapsed = isOpen !== undefined ? !isOpen : !internalOpen;
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [preview, setPreview] = useState<{ src: string; name: string; x: number; y: number } | null>(null);
  const dragStartX = useRef<number>(0);
  const dragStartWidth = useRef<number>(DEFAULT_WIDTH);
  const isDragging = useRef(false);

  const itemsPerPage = 5;
  const totalPages = Math.ceil(Math.min(tokens.length, 60) / itemsPerPage);
  const displayTokens = tokens.slice(0, 60).slice(page * itemsPerPage, (page + 1) * itemsPerPage);
  const loading = tokens.length === 0;

  const scale = Math.min(1, Math.max(0, (width - MIN_WIDTH) / (MAX_WIDTH - MIN_WIDTH)));
  const imgSize = Math.round(32 + scale * 20);
  const nameFontSize = Math.round(10 + scale * 4);
  const mcapFontSize = Math.round(8 + scale * 3);
  const badgeFontSize = Math.round(7 + scale * 2);
  const caFontSize = Math.round(8 + scale * 2);
  const cardPad = Math.round(8 + scale * 6);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = width;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [width]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const delta = e.clientX - dragStartX.current;
    const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartWidth.current + delta));
    setWidth(newWidth);
  }, []);

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const PREVIEW_SIZE = 200;
  const PREVIEW_HEIGHT = PREVIEW_SIZE + 44; // image + name row

  const handleImgEnter = useCallback((e: React.MouseEvent, token: Token) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Try placing to the right; if it overflows, place to the left
    let x = rect.right + 12;
    if (x + PREVIEW_SIZE > vw - 8) x = rect.left - PREVIEW_SIZE - 12;
    x = Math.max(8, Math.min(x, vw - PREVIEW_SIZE - 8));

    // Centre vertically on the logo, then clamp within viewport
    let y = rect.top + rect.height / 2 - PREVIEW_HEIGHT / 2;
    y = Math.max(8, Math.min(y, vh - PREVIEW_HEIGHT - 8));

    setPreview({ src: token.image, name: token.name, x, y });
  }, []);

  const handleImgLeave = useCallback(() => {
    setPreview(null);
  }, []);

  return (
    <>
      {preview && (
        <div
          className="fixed z-[500] pointer-events-none"
          style={{ left: preview.x, top: preview.y }}
        >
          <div className="bg-[#0d0d1a]/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl shadow-black/70 overflow-hidden"
            style={{ animation: "fadeScaleIn 0.15s ease-out forwards" }}>
            <img
              src={preview.src}
              alt={preview.name}
              className="block"
              style={{ width: 200, height: 200, objectFit: "cover" }}
              onError={(e) => { (e.target as HTMLImageElement).src = "/assets/bot.png"; }}
            />
            <div className="px-3 py-2 text-center">
              <span className="text-white font-bold text-sm truncate block">{preview.name}</span>
            </div>
          </div>
        </div>
      )}

      <div
        className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-3 relative"
        style={isCollapsed ? {} : { width: `${width}px` }}
      >
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => {
            if (onToggle) {
              onToggle();
              if (!isCollapsed) setWidth(DEFAULT_WIDTH);
            } else {
              setInternalOpen(prev => !prev);
              if (!isCollapsed) setWidth(DEFAULT_WIDTH);
            }
          }}
        >
          <div className="flex items-center gap-2">
            <button
              className="hover:bg-white/5 p-1 rounded-md transition-colors"
              title={isCollapsed ? "Expand" : "Collapse"}
            >
              {isCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
            </button>
            <h3 className="text-[10px] font-bold text-[#d5f704] uppercase tracking-wider">{t.recentBonding}</h3>
          </div>
          {!isCollapsed && !loading && (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1 hover:bg-white/5 rounded disabled:opacity-20"
              >
                <ChevronLeft size={12} />
              </button>
              <span className="text-[9px] text-white/40">{page + 1}/{totalPages || 1}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1 hover:bg-white/5 rounded disabled:opacity-20"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          )}
        </div>

        {!isCollapsed && (
          <div className="space-y-1.5 mt-2">
            {loading ? (
              [1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg animate-pulse">
                  <div className="w-6 h-6 rounded-full bg-white/10 flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <div className="h-2 bg-white/10 rounded w-3/4" />
                    <div className="h-1.5 bg-white/5 rounded w-full" />
                  </div>
                </div>
              ))
            ) : displayTokens.length > 0 ? (
              displayTokens.map((token) => (
                <button
                  key={token.id}
                  onClick={() => {
                    onAskBot(token.ca);
                    const toast = document.createElement('div');
                    toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 z-[300] bg-[#5b31fe] text-white text-[10px] px-3 py-1 rounded-full pointer-events-none';
                    toast.textContent = 'Pasted to Bot';
                    document.body.appendChild(toast);
                    setTimeout(() => toast.remove(), 2000);
                  }}
                  className="w-full flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:scale-[1.03] transition-all duration-150 text-left"
                  style={{ padding: `${cardPad}px` }}
                >
                  <div className="relative flex-shrink-0 group/img">
                    <img
                      src={token.image}
                      alt=""
                      className="rounded-full border border-white/10 transition-transform duration-150 group-hover/img:scale-110 cursor-zoom-in"
                      style={{ width: `${imgSize}px`, height: `${imgSize}px` }}
                      onError={(e) => { (e.target as HTMLImageElement).src = "/assets/bot.png"; }}
                      onMouseEnter={(e) => handleImgEnter(e, token)}
                      onMouseLeave={handleImgLeave}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-bold text-white truncate" style={{ fontSize: `${nameFontSize}px` }}>{token.name}</span>
                        {(token.volume24h / 24) >= 50_000 && (
                          <span className="flex-shrink-0 text-[8px] font-bold bg-red-500 text-white px-1 py-0.5 rounded leading-none">🔥HOT</span>
                        )}
                      </div>
                      <span className="text-green-400 font-mono flex-shrink-0" style={{ fontSize: `${mcapFontSize}px` }}>
                        {token.mcap >= 1_000_000 ? `$${(token.mcap / 1_000_000).toFixed(2)}M` : `$${(token.mcap / 1000).toFixed(1)}K`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {(token.ca || '').toLowerCase() === BFLAP_CA && (
                        <span className="font-bold px-1 py-0.5 rounded leading-none flex-shrink-0" style={{ fontSize: `${badgeFontSize}px`, background: "linear-gradient(90deg,#b8860b,#ffd700,#b8860b)", color: "#fff", letterSpacing: "0.02em" }}>
                          ★ Official
                        </span>
                      )}
                      <span className="font-bold px-1 py-0.5 rounded leading-none flex-shrink-0" style={{ fontSize: `${badgeFontSize}px`, backgroundColor: "#0d9488", color: "#ccfbf1" }}>
                        ✓
                      </span>
                      {token.dexPaid ? (
                        <span className="font-bold px-1 py-0.5 rounded leading-none flex-shrink-0" style={{ fontSize: `${badgeFontSize}px`, backgroundColor: "#16a34a", color: "#bbf7d0" }}>
                          DEX ✓
                        </span>
                      ) : (
                        <span className="font-bold px-1 py-0.5 rounded leading-none flex-shrink-0" style={{ fontSize: `${badgeFontSize}px`, backgroundColor: "#dc2626", color: "#fecaca" }}>
                          DEX ✗
                        </span>
                      )}
                      {token.aveLogo ? (
                        <span className="font-bold px-1 py-0.5 rounded leading-none flex-shrink-0" style={{ fontSize: `${badgeFontSize}px`, backgroundColor: "#7c3aed", color: "#ede9fe" }}>
                          Ave ✓
                        </span>
                      ) : (
                        <span className="font-bold px-1 py-0.5 rounded leading-none flex-shrink-0" style={{ fontSize: `${badgeFontSize}px`, backgroundColor: "#374151", color: "#6b7280" }}>
                          Ave ✗
                        </span>
                      )}
                      {token.taxRate > 0 && (
                        <span className="font-bold px-1 py-0.5 rounded leading-none flex-shrink-0" style={{ fontSize: `${badgeFontSize}px`, backgroundColor: "#92400e", color: "#fde68a" }}>
                          {token.taxRate % 1 === 0 ? token.taxRate.toFixed(0) : token.taxRate.toFixed(1)}% {t.tax as string}
                        </span>
                      )}
                    </div>
                    <div className="text-white/40 font-mono truncate mt-0.5" style={{ fontSize: `${caFontSize}px` }}>{token.ca}</div>
                  </div>
                </button>
              ))
            ) : (
              <div className="text-[9px] text-white/30 text-center py-2">No recently graduated tokens</div>
            )}
          </div>
        )}

        {!isCollapsed && (
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="absolute bottom-1.5 right-1.5 w-4 h-4 cursor-ew-resize flex items-end justify-end opacity-30 hover:opacity-80 transition-opacity select-none"
            title="Drag to resize"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-white">
              <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeScaleIn {
          from { opacity: 0; transform: scale(0.85); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}
