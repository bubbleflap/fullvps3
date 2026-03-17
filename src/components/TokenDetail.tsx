import type { Token } from "../lib/types";

interface TokenDetailProps {
  token: Token;
  onClose: () => void;
}

function formatMcap(mcap: number): string {
  if (mcap >= 1_000_000) return `$${(mcap / 1_000_000).toFixed(2)}M`;
  if (mcap >= 1_000) return `$${(mcap / 1_000).toFixed(2)}K`;
  return `$${mcap.toFixed(0)}`;
}

function formatAge(createdAt: number): string {
  const diff = Date.now() - createdAt;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return `${mins}m ago`;
}

export default function TokenDetail({ token, onClose }: TokenDetailProps) {
  return (
    <div className="absolute bottom-24 md:bottom-auto md:top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none px-4 w-full max-w-xl">
      <div className="bg-black/90 backdrop-blur-xl border border-white/20 rounded-xl px-4 py-3 shadow-2xl pointer-events-auto">
        <div className="flex items-center gap-3 flex-wrap">
          <img
            src={token.image}
            alt={token.name}
            className="w-10 h-10 rounded-full border border-white/20 flex-shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "/assets/bot.webp";
            }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-white truncate">
                {token.name}
              </span>
              <span className="text-white/60 font-mono text-xs">${token.ticker}</span>
            </div>
          </div>
          <a
            href={`https://flap.sh/bnb/${token.ca}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-[#5b31fe] hover:bg-[#5b31fe]/80 text-white text-xs font-bold rounded-full transition-colors flex items-center gap-1.5"
          >
            Buy on Flap.sh
          </a>
        </div>

        <div className="flex items-center gap-3 text-xs mt-2 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-white/50">MCap:</span>
            <span className="text-white font-mono">{formatMcap(token.mcap)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-white/50">Holders:</span>
            <span className="text-white font-mono">{token.holders}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-white/50">Age:</span>
            <span className="text-white font-mono">{formatAge(token.createdAt)}</span>
          </div>
          {token.change24h !== 0 && (
            <div className="flex items-center gap-1">
              <span className="text-white/50">24h:</span>
              <span
                className={`font-mono ${token.change24h > 0 ? "text-green-400" : "text-red-400"}`}
              >
                {token.change24h > 0 ? "+" : ""}
                {token.change24h.toFixed(1)}%
              </span>
            </div>
          )}
          {token.devHoldPercent > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-white/50">Dev:</span>
              <span className="text-white font-mono">{token.devHoldPercent.toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
