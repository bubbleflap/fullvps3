import { memo, useRef, useEffect } from "react";
import type { Token } from "../lib/types";
import { useLang } from "../lib/i18n";

const FEATURED_CA = "0xa2320fff1069ed5b4b02ddb386823e837a7e7777";

interface TokenBubbleProps {
  token: Token;
  isNewest: boolean;
  isNewlyDetected?: boolean;
  isFeatured?: boolean;
  isPartner?: boolean;
  onHover: (token: Token | null, rect?: DOMRect) => void;
  onClick: (token: Token, rect?: DOMRect) => void;
}

function getBubbleSize(mcap: number): number {
  if (mcap <= 0) return 4;
  const kMcap = mcap / 1000;
  const px = kMcap * 2;
  return Math.max(4, Math.min(px, 100));
}

function formatMcap(mcap: number): string {
  if (mcap >= 1_000_000) return `$${(mcap / 1_000_000).toFixed(1)}M`;
  if (mcap >= 1_000) return `$${(mcap / 1_000).toFixed(1)}K`;
  if (mcap > 0) return `$${mcap.toFixed(0)}`;
  return "$0";
}

function formatAge(createdAt: number): string {
  const diff = Date.now() - createdAt;
  if (diff < 0) return "now";
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(diff / 86400000);
  return `${days}d`;
}

const COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#06b6d4", "#ef4444", "#6366f1",
  "#14b8a6", "#f97316", "#a855f7", "#22c55e",
];

function getTokenColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

function TokenBubbleComponent({
  token,
  isNewest,
  isNewlyDetected,
  isFeatured,
  isPartner,
  onHover,
  onClick,
}: TokenBubbleProps) {
  const { t } = useLang();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isNewlyDetected || !ref.current) return;
    const container = ref.current;
    const BUBBLE_COLORS = [
      "rgba(239,68,68,0.7)", "rgba(255,100,100,0.6)", "rgba(213,247,4,0.6)",
      "rgba(122,51,250,0.55)", "rgba(255,200,50,0.55)", "rgba(207,183,243,0.5)",
    ];
    const SIZES = [4, 5, 6, 7, 8, 10, 12];

    const spawn = (count: number) => {
      for (let i = 0; i < count; i++) {
        const sz = SIZES[Math.floor(Math.random() * SIZES.length)];
        const maxLeft = Math.max(container.offsetWidth - sz, 10);
        const left = Math.floor(Math.random() * maxLeft);
        const color = BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)];
        const delay = Math.random() * 400;
        const b = document.createElement("div");
        b.className = "bubble-rise";
        b.style.cssText = `position:absolute;border-radius:100%;bottom:${Math.floor(container.offsetHeight * 0.3)}px;left:${left}px;width:${sz}px;height:${sz}px;background-color:${color};z-index:30;pointer-events:none;animation-delay:${delay}ms;`;
        container.appendChild(b);
        setTimeout(() => b.remove(), 3200 + delay);
      }
    };

    spawn(12);
    const interval = setInterval(() => spawn(3), 200);
    const stop = setTimeout(() => clearInterval(interval), 3000);
    return () => {
      clearInterval(interval);
      clearTimeout(stop);
    };
  }, [isNewlyDetected]);

  const rawSize = getBubbleSize(token.mcap);
  const size = isFeatured ? Math.max(90, rawSize) : isPartner ? Math.max(72, rawSize * 0.85) : isNewlyDetected ? 120 : rawSize;
  const color = getTokenColor(token.id);
  const showImage = size >= 16;
  const showMcap = size >= 18;
  const showTicker = size >= 16;
  const showAge = size >= 16;
  const showBadges = size >= 40;

  const mcapRef = useRef<HTMLSpanElement>(null);
  const prevMcapRef = useRef(token.mcap);
  const mcapOverlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mcapRef.current;
    const overlay = mcapOverlayRef.current;
    if (!el) return;
    const from = prevMcapRef.current;
    const to = token.mcap;
    prevMcapRef.current = to;
    if (Math.abs(from - to) < 1) return;

    if (overlay) {
      overlay.style.backgroundColor = to > from ? "rgba(0,255,100,0.2)" : "rgba(255,50,50,0.2)";
      setTimeout(() => { overlay.style.backgroundColor = "transparent"; }, 600);
    }

    const duration = 700;
    const start = performance.now();
    let raf = 0;
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;
      el.textContent = formatMcap(current);
      if (progress < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [token.mcap]);

  let borderColor = "rgb(85, 51, 255)";
  let glow = `0 0 ${Math.max(3, size * 0.1)}px rgba(85,51,255,0.3)`;

  if (token.activityBoost > 0.1) {
    borderColor = "#00bf63";
    glow = `0 0 ${Math.max(4, size * 0.15)}px rgba(0,191,99,0.35)`;
  } else if (token.activityBoost < -0.1) {
    borderColor = "#ff3131";
    glow = `0 0 ${Math.max(4, size * 0.15)}px rgba(255,49,49,0.35)`;
  }

  if (isNewest) {
    borderColor = "rgba(254, 199, 7, 0.7)";
    glow = `0 0 ${Math.max(6, size * 0.2)}px rgba(254,199,7,0.3)`;
  }

  if (isNewlyDetected) {
    borderColor = "#ef4444";
    glow = `0 0 20px rgba(239,68,68,0.5), 0 0 40px rgba(239,68,68,0.2)`;
  }

  if (isFeatured) {
    borderColor = "#7a33fb";
    glow = `0 0 30px rgba(122,51,251,0.4), 0 0 60px rgba(122,51,251,0.15), 0 0 90px rgba(122,51,251,0.08)`;
  }

  if (isPartner) {
    borderColor = "#00c9a7";
    glow = `0 0 24px rgba(0,201,167,0.45), 0 0 48px rgba(0,201,167,0.15), 0 0 72px rgba(0,201,167,0.07)`;
  }

  const borderW = isFeatured ? 4 : isPartner ? 3 : isNewlyDetected ? 3 : size < 10 ? 1 : size < 25 ? 1.5 : 2;

  const handleMouseEnter = () => {
    const rect = ref.current?.getBoundingClientRect();
    onHover(token, rect);
  };

  return (
    <div
      ref={ref}
      className={`relative flex flex-col items-center cursor-pointer select-none bubble-wrap${isFeatured ? " featured-pulse" : isPartner ? " partner-pulse" : isNewlyDetected ? " newly-detected-pulse" : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => onHover(null)}
      onClick={() => {
        const rect = ref.current?.getBoundingClientRect();
        onClick(token, rect);
      }}
    >
      {showTicker && (
        <div
          className="text-white/70 text-center whitespace-nowrap overflow-hidden text-ellipsis"
          style={{
            fontSize: Math.max(7, Math.min(size * 0.18, 13)),
            marginBottom: 1,
            maxWidth: Math.max(size * 1.6, 60),
          }}
        >
          <span className="font-medium">${token.ticker}</span>
        </div>
      )}

      <div
        className="rounded-full overflow-hidden relative bubble-sphere"
        style={{
          width: size,
          height: size,
          border: `${borderW}px solid ${borderColor}`,
          boxShadow: glow || undefined,
          background: showImage ? "#111" : `radial-gradient(circle at 35% 35%, ${color}cc, ${color}66)`,
          transition: "width 0.6s cubic-bezier(0.25,0.46,0.45,0.94), height 0.6s cubic-bezier(0.25,0.46,0.45,0.94), box-shadow 0.4s ease, border-color 0.4s ease",
        }}
      >
        {showImage && (
          <img
            src={token.image}
            alt={token.name}
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              imageRendering: "auto",
            }}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={(e) => {
              const el = e.target as HTMLImageElement;
              el.style.display = "none";
              el.parentElement!.style.background = `radial-gradient(circle at 35% 35%, ${color}cc, ${color}66)`;
            }}
          />
        )}

        {showImage && <div className="absolute inset-0 bubble-shine" />}

        {showMcap && (
          <div ref={mcapOverlayRef} className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "transparent", transition: "background-color 0.4s ease" }}>
            <span
              ref={mcapRef}
              className="font-bold text-white bubble-mcap"
              style={{ fontSize: Math.max(6, Math.min(size * 0.18, 13)), transition: "font-size 0.4s ease" }}
            >
              {formatMcap(token.mcap)}
            </span>
          </div>
        )}

        {showBadges && token.bondingCurve && !token.listed && (
          <div
            className="absolute rounded-full bg-blue-500/80"
            style={{ top: 1, left: 1, fontSize: Math.max(4, Math.min(size * 0.09, 7)), lineHeight: 1.2, padding: "0.5px 2px" }}
          >
            <span className="text-white font-bold">{Math.round(token.bondProgress)}%</span>
          </div>
        )}
        {showBadges && token.listed && (
          <div
            className="absolute rounded-full bg-yellow-400/90"
            style={{ top: 1, left: 1, fontSize: Math.max(4, Math.min(size * 0.09, 7)), lineHeight: 1.2, padding: "0.5px 2px" }}
          >
            <span className="text-black font-bold">DEX</span>
          </div>
        )}
        {showBadges && token.dexPaid && !isNewlyDetected && (
          <div
            className="absolute rounded-full bg-green-500/80"
            style={{ top: 2, right: 2, fontSize: Math.min(size * 0.1, 7), lineHeight: 1.3, padding: "1px 2px" }}
          >
            <span className="text-white font-bold">DS</span>
          </div>
        )}
      </div>

      {isNewlyDetected && (
        <div
          className="flex justify-center"
          style={{ marginTop: 4 }}
        >
          <div
            className="rounded-full animate-pulse"
            style={{
              backgroundColor: "#ef4444",
              fontSize: 11,
              lineHeight: 1.2,
              padding: "2px 8px",
              boxShadow: "0 0 12px rgba(239,68,68,0.7)",
            }}
          >
            <span className="text-white font-extrabold tracking-wider">{t.shortNew}</span>
          </div>
        </div>
      )}

      {isFeatured && (
        <div className="flex justify-center" style={{ marginTop: 4 }}>
          <div
            className="rounded-full font-extrabold tracking-widest"
            style={{
              background: "linear-gradient(90deg, #5b1fdd, #7a33fb, #5b1fdd)",
              backgroundSize: "200% 100%",
              animation: "hotBadgeShimmer 2s linear infinite",
              fontSize: 10,
              lineHeight: 1.2,
              padding: "2px 8px",
              boxShadow: "0 0 10px rgba(122,51,251,0.8), 0 0 20px rgba(91,31,221,0.4)",
              color: "#fff",
            }}
          >
            🔥 HOT
          </div>
        </div>
      )}

      {isPartner && (
        <div
          className="flex justify-center"
          style={{ marginTop: 4 }}
        >
          <div
            className="rounded-full"
            style={{
              background: "linear-gradient(90deg, #00c9a7, #00a8e8)",
              fontSize: 10,
              lineHeight: 1.2,
              padding: "2px 7px",
              boxShadow: "0 0 10px rgba(0,201,167,0.6)",
            }}
          >
            <span className="text-white font-extrabold tracking-widest">PARTNER</span>
          </div>
        </div>
      )}

      {showAge && (
        <div
          className="text-white/30 text-center whitespace-nowrap font-mono"
          style={{ fontSize: Math.max(6, Math.min(size * 0.15, 9)), marginTop: 1 }}
        >
          {formatAge(token.createdAt)}
        </div>
      )}
    </div>
  );
}

export default memo(TokenBubbleComponent);
