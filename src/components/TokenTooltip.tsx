import type { Token } from "../lib/types";
import { useLang } from "../lib/i18n";

interface TokenTooltipProps {
  token: Token;
  rect: DOMRect;
  onAskBot?: (ca: string) => void;
  onQuickSwap?: (ca: string) => void;
}

function formatMcap(mcap: number): string {
  if (mcap >= 1_000_000) return `$${(mcap / 1_000_000).toFixed(2)}M`;
  if (mcap >= 1_000) return `$${(mcap / 1_000).toFixed(2)}K`;
  if (mcap > 0) return `$${mcap.toFixed(0)}`;
  return "$0";
}

function formatPrice(price: number): string {
  if (price <= 0) return "$0";
  if (price < 0.000001) return `$${price.toExponential(2)}`;
  if (price < 0.01) return `$${price.toFixed(8)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2)}`;
}

function formatVol(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  if (v > 0) return `$${v.toFixed(0)}`;
  return "-";
}

function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

export default function TokenTooltip({ token, rect, onAskBot, onQuickSwap }: TokenTooltipProps) {
  const { t } = useLang();
  const tooltipW = Math.min(340, window.innerWidth - 16);
  const tooltipH = 320;

  let left = rect.left + rect.width / 2 - tooltipW / 2;
  let top = rect.top - tooltipH - 12;

  if (top < 8) top = rect.bottom + 12;
  if (left < 8) left = 8;
  if (left + tooltipW > window.innerWidth - 8) left = window.innerWidth - tooltipW - 8;

  const formatAge = (createdAt: number): string => {
    const diff = Date.now() - createdAt;
    if (diff < 0) return t.justNow as string;
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}${t.sAgo}`;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}${t.mAgo}`;
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `${hours}${t.hAgo}`;
    const days = Math.floor(diff / 86400000);
    return `${days}${t.dAgo}`;
  };

  const totalTxns = token.buys24h + token.sells24h;
  const isGraduated = token.listed || token.graduated;
  const chartUrl = isGraduated
    ? (token.dexUrl || `https://dexscreener.com/bsc/${token.ca}`)
    : `https://flap.sh/bnb/${token.ca}`;

  return (
    <div
      className="fixed z-[200]"
      style={{ left, top, width: tooltipW }}
    >
      <div className="bg-black/95 backdrop-blur-xl border border-white/15 rounded-xl px-4 py-3 shadow-2xl">
        <div className="flex items-center gap-3 mb-2">
          <img
            src={token.image}
            alt={token.name}
            className="w-10 h-10 rounded-full border border-white/20 flex-shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "/assets/logo.png";
            }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white truncate">{token.name}</span>
              <span className="text-white/50 font-mono text-xs">${token.ticker}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {token.bondingCurve && !token.listed && (
                <span className="text-[9px] bg-blue-500/80 text-white px-1.5 py-0.5 rounded-full font-bold">
                  {t.bonding2} {Math.round(token.bondProgress)}%
                </span>
              )}
              {!token.bondingCurve && !token.listed && (
                <span className="text-[9px] bg-white/10 text-white/50 px-1.5 py-0.5 rounded-full font-bold">{t.notBonding}</span>
              )}
              {token.listed && (
                <span className="text-[9px] bg-yellow-500/80 text-black px-1.5 py-0.5 rounded-full font-bold">{t.dexListed}</span>
              )}
              {token.dexPaid && (
                <span className="text-[9px] bg-green-500/80 text-white px-1.5 py-0.5 rounded-full font-bold">{t.dexScreener}</span>
              )}
              {token.taxRate > 0 && (
                <span className="text-[9px] bg-purple-600/80 text-white px-1.5 py-0.5 rounded-full font-bold">
                  {token.taxRate % 1 === 0 ? token.taxRate.toFixed(0) : token.taxRate.toFixed(1)}% {t.tax}
                </span>
              )}
              {token.goplusSecurity?.risk === 'danger' && (
                <span className="text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded-full font-bold animate-pulse">⚠ DANGER</span>
              )}
              {token.goplusSecurity?.risk === 'warning' && (
                <span className="text-[9px] bg-orange-500/90 text-white px-1.5 py-0.5 rounded-full font-bold">⚠ HIGH TAX</span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-2">
          <div className="flex justify-between">
            <span className="text-white/40">{t.mcap}</span>
            <span className="text-white font-mono font-medium">{formatMcap(token.mcap)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">{t.price}</span>
            <span className="text-white font-mono font-medium">{formatPrice(token.price)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">{t.holders}</span>
            <span className="text-white font-mono font-medium">{token.holders}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">{t.age}</span>
            <span className="text-white font-mono font-medium">{formatAge(token.createdAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">{t.devHold}</span>
            <span className={`font-mono font-medium ${token.devHoldPercent > 20 ? "text-red-400" : token.devHoldPercent === 0 ? "text-green-400" : "text-white"}`}>
              {token.devHoldPercent.toFixed(1)}%
            </span>
          </div>
          {token.burnPercent > 0 && (
            <div className="flex justify-between">
              <span className="text-white/40">{t.burned}</span>
              <span className="font-mono font-medium text-orange-400">
                {token.burnPercent.toFixed(1)}%
              </span>
            </div>
          )}
          {token.volume24h > 0 && (
            <div className="flex justify-between">
              <span className="text-white/40">{t.volume}</span>
              <span className="text-white font-mono font-medium">{formatVol(token.volume24h)}</span>
            </div>
          )}
          {token.liquidity > 0 && (
            <div className="flex justify-between">
              <span className="text-white/40">{t.liq}</span>
              <span className="text-white font-mono font-medium">{formatVol(token.liquidity)}</span>
            </div>
          )}
          {totalTxns > 0 && (
            <div className="flex justify-between">
              <span className="text-white/40">{t.txns}</span>
              <span className="font-mono font-medium">
                <span className="text-green-400">{token.buys24h}</span>
                <span className="text-white/30">/</span>
                <span className="text-red-400">{token.sells24h}</span>
              </span>
            </div>
          )}
          {token.change24h !== 0 && (
            <div className="flex justify-between">
              <span className="text-white/40">{t.h24}</span>
              <span className={`font-mono font-medium ${token.change24h > 0 ? "text-green-400" : "text-red-400"}`}>
                {token.change24h > 0 ? "+" : ""}{token.change24h.toFixed(1)}%
              </span>
            </div>
          )}
          {token.taxRate > 0 && (
            <div className="flex justify-between">
              <span className="text-white/40">{t.tax}</span>
              <span className="text-purple-400 font-mono font-medium">
                {token.taxRate % 1 === 0 ? token.taxRate.toFixed(0) : token.taxRate.toFixed(1)}%
              </span>
            </div>
          )}
          {token.goplusSecurity && (
            <>
              {(token.goplusSecurity.buyTax > 0 || token.goplusSecurity.sellTax > 0) && (
                <div className="flex justify-between">
                  <span className="text-white/40">Buy / Sell Tax</span>
                  <span className={`font-mono font-medium ${token.goplusSecurity.sellTax > 10 || token.goplusSecurity.buyTax > 10 ? 'text-orange-400' : 'text-white/70'}`}>
                    {token.goplusSecurity.buyTax.toFixed(1)}% / {token.goplusSecurity.sellTax.toFixed(1)}%
                  </span>
                </div>
              )}
              {token.goplusSecurity.honeypot && (
                <div className="flex justify-between col-span-2">
                  <span className="text-red-400 font-bold">⚠ HONEYPOT DETECTED</span>
                  <span className="text-red-400 font-bold">Cannot sell!</span>
                </div>
              )}
              {!token.goplusSecurity.honeypot && token.goplusSecurity.risk !== 'safe' && (
                <div className="flex justify-between">
                  <span className="text-white/40">Risk flags</span>
                  <span className="text-orange-400 text-[10px]">
                    {[
                      token.goplusSecurity.hasBlacklist && 'Blacklist',
                      token.goplusSecurity.isMintable && 'Mintable',
                      token.goplusSecurity.hiddenOwner && 'Hidden owner',
                      !token.goplusSecurity.isOpenSource && 'Unverified',
                    ].filter(Boolean).join(' · ')}
                  </span>
                </div>
              )}
            </>
          )}
          {token.sniperHoldPercent > 0 && (
            <div className="flex justify-between">
              <span className="text-white/40">{t.sniper}</span>
              <span className={`font-mono font-medium ${token.sniperHoldPercent > 15 ? "text-red-400" : "text-white"}`}>
                {token.sniperHoldPercent.toFixed(1)}%
              </span>
            </div>
          )}
        </div>

        {token.beneficiary && (
          <div className="border-t border-white/10 pt-2 mb-2">
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-white/40">{t.taxRecipient}</span>
              <span className="text-purple-400/80 font-mono">{shortAddr(token.beneficiary)}</span>
            </div>
          </div>
        )}

        <div className="border-t border-white/10 pt-2 space-y-1">
          <button
            className="w-full flex items-center gap-1.5 text-left group pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(token.ca);
              const btn = e.currentTarget;
              const orig = btn.querySelector('.ca-label');
              if (orig) { orig.textContent = '✓ Copied!'; setTimeout(() => { orig.textContent = 'CA:'; }, 1500); }
            }}
          >
            <span className="ca-label text-white/30 text-[10px] flex-shrink-0">CA:</span>
            <span className="text-white/60 font-mono break-all leading-tight group-hover:text-white/90 transition-colors" style={{ fontSize: 'clamp(8px, 2.2vw, 10px)' }}>{token.ca}</span>
          </button>
          {(token.website || token.twitter || token.telegram) && (
            <div className="flex items-center gap-3 text-[10px]">
              {token.website && <a href={token.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 pointer-events-auto" onClick={e => e.stopPropagation()}>{t.web}</a>}
              {token.twitter && <a href={token.twitter} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300 pointer-events-auto" onClick={e => e.stopPropagation()}>Twitter</a>}
              {token.telegram && <a href={token.telegram} target="_blank" rel="noopener noreferrer" className="text-sky-300 hover:text-sky-200 pointer-events-auto" onClick={e => e.stopPropagation()}>TG</a>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            <a
              href={chartUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-jelly pointer-events-auto flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-600/80 text-white hover:bg-blue-500 transition-colors"
              onClick={e => e.stopPropagation()}
            >
              📊 {t.chartBtn}
            </a>
            <a
              href={`https://t.me/BubbleFlapBot?start=ref_5189577935_${token.ca}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="btn-jelly pointer-events-auto flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#00d4aa] text-black hover:bg-[#00d4aa]/80 transition-colors"
            >
              🔄 {t.quickSwap}
            </a>
          </div>
          {onAskBot && (
            <button
              onClick={(e) => { e.stopPropagation(); onAskBot(token.ca); }}
              className="btn-jelly pointer-events-auto flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full transition-colors"
              style={{ backgroundColor: "#d4f602", color: "#000" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#e0ff4d"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4f602"; }}
            >
              <img src="/assets/logo.png" alt="" className="w-3.5 h-3.5 rounded-full" />
              {t.askBot}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
