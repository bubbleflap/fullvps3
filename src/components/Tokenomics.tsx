import { useState, useEffect, useCallback } from "react";
import { Copy, Check, TrendingUp, Flame, ArrowLeftRight, BarChart3, Coins, Tag, Hash, Percent, RefreshCw } from "lucide-react";
import { useSettings } from "../hooks/useSettings";
import { useLang } from "../lib/i18n";

function formatBig(n: number): string {
  if (!n || isNaN(n)) return "0";
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toLocaleString();
}

interface CardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: string;
  onClick?: () => void;
  href?: string;
  loading?: boolean;
  badge?: React.ReactNode;
}

function Card({ label, value, sub, icon, accent = "#5b31fe", onClick, href, loading, badge }: CardProps) {
  const inner = (
    <div
      className="relative flex flex-col gap-2.5 rounded-2xl p-5 border transition-all duration-200 hover:scale-105 hover:shadow-xl cursor-pointer select-none h-full"
      style={{
        background: "rgba(13,13,26,0.95)",
        borderColor: `${accent}30`,
        boxShadow: `0 0 0 0 ${accent}00`,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = `${accent}70`; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 32px ${accent}18`; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = `${accent}30`; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 0 ${accent}00`; }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider" style={{ color: `${accent}cc` }}>
          <span style={{ color: accent }}>{icon}</span>
          {label}
        </div>
        {badge}
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-white/30 text-sm">
          <RefreshCw size={12} className="animate-spin" />
          Loading...
        </div>
      ) : (
        <div className="text-lg font-bold text-white leading-tight break-all">{value}</div>
      )}
      {sub && <div className="text-[11px] text-white/35">{sub}</div>}
    </div>
  );

  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className="no-underline block">{inner}</a>;
  if (onClick) return <button onClick={onClick} className="text-left w-full block">{inner}</button>;
  return inner;
}

export default function Tokenomics() {
  const settings = useSettings();
  const { t } = useLang();
  const ca = settings.ca_address;
  const isValidCa = ca && ca !== "0x0000000000000000000000000000000000000000";

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [price, setPrice] = useState("");
  const [priceLoading, setPriceLoading] = useState(true);
  const [totalSupply, setTotalSupply] = useState("");
  const [supplyLoading, setSupplyLoading] = useState(true);
  const [totalBurn, setTotalBurn] = useState("");
  const [burnLoading, setBurnLoading] = useState(true);
  const [circulatingSupply, setCirculatingSupply] = useState("");
  const [caCopied, setCaCopied] = useState(false);

  const fetchTokenInfo = useCallback(async () => {
    if (!isValidCa) return;
    setPriceLoading(true);
    try {
      const res = await fetch(`/api/swap/token-info?address=${ca}`);
      const data = await res.json();
      if (!data.error) {
        if (data.name) setName(data.name);
        if (data.ticker) setSymbol(data.ticker);
        if (data.price) setPrice(`$${Number(data.price).toFixed(8)}`);
        else setPrice("—");
      }
    } catch {
      setPrice("—");
    } finally {
      setPriceLoading(false);
    }
  }, [ca, isValidCa]);

  const fetchOnChainData = useCallback(async () => {
    if (!isValidCa) return;
    setSupplyLoading(true);
    setBurnLoading(true);
    try {
      const res = await fetch(`/api/tokenomics?address=${ca}`);
      const data = await res.json();
      if (!data.error) {
        const supply = data.totalSupply || 0;
        const burn = data.totalBurn || 0;
        setTotalSupply(formatBig(supply));
        setTotalBurn(formatBig(burn));
        setCirculatingSupply(formatBig(supply - burn));
      } else {
        setTotalSupply("—");
        setTotalBurn("—");
        setCirculatingSupply("—");
      }
    } catch {
      setTotalSupply("—");
      setTotalBurn("—");
      setCirculatingSupply("—");
    } finally {
      setSupplyLoading(false);
      setBurnLoading(false);
    }
  }, [ca, isValidCa]);

  useEffect(() => {
    fetchTokenInfo();
    fetchOnChainData();
    const timer = setInterval(() => { fetchTokenInfo(); fetchOnChainData(); }, 30000);
    return () => clearInterval(timer);
  }, [fetchTokenInfo, fetchOnChainData]);

  const copyCA = () => {
    navigator.clipboard.writeText(ca);
    setCaCopied(true);
    setTimeout(() => setCaCopied(false), 2000);
  };

  const quickSwap = () => {
    window.dispatchEvent(new CustomEvent("quick-swap", {
      detail: { ca, name, ticker: symbol, image: "" },
    }));
  };

  const shortCA = isValidCa ? `${ca.slice(0, 8)}...${ca.slice(-6)}` : "—";

  return (
    <div className="absolute inset-0 overflow-y-auto px-4 flex flex-col pt-[140px] sm:pt-[120px] lg:pt-[90px] pb-40">
      <div className="w-full max-w-[900px] mx-auto flex flex-col gap-6">

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <Coins className="text-[#d5f704]" size={22} />
            {t.tokenomics as string}
          </h1>
          <p className="text-white/40 text-sm">{t.tokenomicsDesc as string}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card
            label={t.tkName as string}
            value={name || (isValidCa ? "..." : "—")}
            icon={<Tag size={13} />}
            accent="#5b31fe"
          />
          <Card
            label={t.tkSymbol as string}
            value={symbol ? `$${symbol}` : (isValidCa ? "..." : "—")}
            icon={<Hash size={13} />}
            accent="#5b31fe"
          />
          <Card
            label={t.tkTotalSupply as string}
            value={totalSupply || (isValidCa ? "..." : "—")}
            icon={<Coins size={13} />}
            accent="#5b31fe"
            loading={supplyLoading && !!isValidCa && !totalSupply}
          />
          <Card
            label={t.tkCirculatingSupply as string}
            value={circulatingSupply || (isValidCa ? "..." : "—")}
            icon={<TrendingUp size={13} />}
            accent="#00d4aa"
            loading={supplyLoading && !!isValidCa && !circulatingSupply}
          />
        </div>

        <div
          className="rounded-2xl border p-5 flex flex-col gap-3"
          style={{ background: "rgba(13,13,26,0.95)", borderColor: "#d5f70430" }}
        >
          <div className="flex items-center gap-2 text-[#d5f704] font-bold text-sm">
            <Percent size={15} />
            {t.tkTax as string} — 3%
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div
              className="rounded-xl px-4 py-3 flex flex-col gap-1 border transition-all duration-200 hover:scale-105"
              style={{ background: "#5b31fe14", borderColor: "#5b31fe30" }}
            >
              <div className="text-2xl font-black text-[#5b31fe]">2%</div>
              <div className="text-xs text-white/50">{t.tkDev as string}</div>
            </div>
            <div
              className="rounded-xl px-4 py-3 flex flex-col gap-1 border transition-all duration-200 hover:scale-105"
              style={{ background: "#ff444414", borderColor: "#ff444430" }}
            >
              <div className="text-2xl font-black text-red-400">1%</div>
              <div className="text-xs text-white/50">{t.tkBurn as string}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card
            label={t.tkCopyContract as string}
            value={caCopied ? (t.tkCopied as string) : shortCA}
            icon={caCopied ? <Check size={13} /> : <Copy size={13} />}
            accent="#d5f704"
            onClick={copyCA}
            badge={caCopied ? <span className="text-[9px] font-bold text-[#d5f704] bg-[#d5f704]/10 px-1.5 py-0.5 rounded-full">✓</span> : undefined}
          />
          <Card
            label={t.tkLivePrice as string}
            value={price || "—"}
            sub={t.tkPriceSub as string}
            icon={<TrendingUp size={13} />}
            accent="#00d4aa"
            loading={priceLoading && !!isValidCa && !price}
          />
          <Card
            label={t.tkTotalBurn as string}
            value={totalBurn || "—"}
            sub={`🔥 ${t.tkBurnSub as string}`}
            icon={<Flame size={13} />}
            accent="#ff6644"
            loading={burnLoading && !!isValidCa && !totalBurn}
          />
          <Card
            label={t.tkQuickSwap as string}
            value={`BFlapSwap →`}
            sub={`${symbol ? `$${symbol}` : ""} / BNB`}
            icon={<ArrowLeftRight size={13} />}
            accent="#5b31fe"
            onClick={quickSwap}
          />
          <Card
            label={t.tkViewChart as string}
            value="DexScreener ↗"
            sub={t.tkChartSub as string}
            icon={<BarChart3 size={13} />}
            accent="#5b31fe"
            href={isValidCa ? `https://dexscreener.com/bsc/${ca}` : "https://dexscreener.com"}
          />
        </div>
      </div>
    </div>
  );
}
