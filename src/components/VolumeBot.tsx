import { useState, useEffect, useRef, useCallback } from "react";
import {
  Bot, Wallet, Copy, Check, Eye, EyeOff, AlertTriangle, ExternalLink,
  RefreshCw, Play, Square, ChevronLeft, ChevronRight, TrendingUp,
  Activity, Users, Search, CheckCircle2, XCircle, Loader2,
  Plus, KeyRound, ArrowRight
} from "lucide-react";
import { useLang } from "../lib/i18n";

async function vbotApi(method: string, path: string, body?: any) {
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api/volumebot${path}`, opts);
  const data = await res.json();
  if (!res.ok && data.error) throw new Error(data.error);
  return data;
}

function copyText(text: string, setCopied: (k: string) => void, key: string) {
  navigator.clipboard.writeText(text).catch(() => {});
  setCopied(key);
  setTimeout(() => setCopied(""), 1800);
}

function shortAddr(addr: string) {
  return addr ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : "—";
}

const JELLY_BASE: React.CSSProperties = {
  position: "relative", overflow: "hidden",
  transition: "transform 0.12s cubic-bezier(.34,1.56,.64,1), box-shadow 0.15s ease",
  cursor: "pointer", userSelect: "none",
};

function JellyButton({
  onClick, disabled, children, color = "#5b31fe", textColor = "#c4b5fd", className = "",
}: {
  onClick?: () => void; disabled?: boolean; children: React.ReactNode;
  color?: string; textColor?: string; className?: string;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseDown={() => setPressed(true)} onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)} onTouchStart={() => setPressed(true)} onTouchEnd={() => setPressed(false)}
      className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-sm disabled:opacity-40 ${className}`}
      style={{
        ...JELLY_BASE,
        background: `linear-gradient(180deg, ${color}44 0%, ${color}22 40%, ${color}11 100%)`,
        border: `1.5px solid ${color}55`, color: textColor,
        boxShadow: pressed ? `0 2px 8px ${color}33, inset 0 2px 8px rgba(0,0,0,0.3)` : `0 4px 20px ${color}44, 0 1px 0 rgba(255,255,255,0.08) inset`,
        transform: pressed ? "scale(0.96)" : "scale(1)",
      }}>
      <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: "50%", background: "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 100%)", borderRadius: "inherit", pointerEvents: "none" }} />
      {children}
    </button>
  );
}

function JellyCard({ children, accent = "#5b31fe", className = "", style = {} }: {
  children: React.ReactNode; accent?: string; className?: string; style?: React.CSSProperties;
}) {
  return (
    <div className={`rounded-3xl p-5 relative overflow-hidden ${className}`}
      style={{ background: `linear-gradient(160deg, ${accent}12 0%, ${accent}06 60%, rgba(0,0,0,0.3) 100%)`, border: `1.5px solid ${accent}30`, boxShadow: `0 8px 32px ${accent}18, 0 1px 0 rgba(255,255,255,0.07) inset`, ...style }}>
      <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: "40%", background: "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%)", borderRadius: "inherit", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}

function StatCard({ label, value, sub, icon, accent = "#5b31fe" }: {
  label: string; value: string | number; sub?: string; icon: React.ReactNode; accent?: string;
}) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-2 relative overflow-hidden"
      style={{ background: `linear-gradient(160deg, ${accent}14 0%, rgba(13,13,26,0.9) 100%)`, border: `1.5px solid ${accent}28`, boxShadow: `0 4px 20px ${accent}14, 0 1px 0 rgba(255,255,255,0.06) inset` }}>
      <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: "45%", background: "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)", borderRadius: "inherit", pointerEvents: "none" }} />
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest relative" style={{ color: `${accent}99` }}>
        <span style={{ color: accent }}>{icon}</span>{label}
      </div>
      <div className="text-base font-bold text-white font-mono leading-tight break-all relative">{value}</div>
      {sub && <div className="text-[11px] text-white/30 relative">{sub}</div>}
    </div>
  );
}

type Step = "setup" | "wallet" | "running";
interface UserBot { address: string; privateKey: string; }
interface TokenInfo { address: string; symbol: string | null; name: string | null; pair: string | null; valid: boolean; }
interface BotStatus { running: boolean; userbotAddress: string | null; masterBalance: number | null; subWallets: any[]; metrics: any; settings: any; campaignId: number | null; }


export default function VolumeBot() {
  const { t } = useLang();

  const [step, setStep] = useState<Step>("setup");
  const [userbot, setUserbot] = useState<UserBot | null>(null);
  const [userbotBalance, setUserbotBalance] = useState<number | null>(null);
  const [loadKeyInput, setLoadKeyInput] = useState("");
  const [loadMode, setLoadMode] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);

  const [tokenInput, setTokenInput] = useState("");
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [tokenValidating, setTokenValidating] = useState(false);
  const tokenDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [settings, setSettings] = useState({
    walletCount: "3", duration: "60",
    minTradeSize: "0.0005", maxTradeSize: "0.005",
    minInterval: "5", maxInterval: "15",
    targetVolume: "1", minBnbReserve: "0.01",
  });

  const [status, setStatus] = useState<BotStatus | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [stopConfirm, setStopConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recoverable, setRecoverable] = useState<{ hasRecoverable: boolean; campaignId?: number; walletCount?: number; addresses?: string[] } | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [recoveryResults, setRecoveryResults] = useState<any[] | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const d = await vbotApi("GET", "/status");
      setStatus(d);
      if (d.running && step !== "running") setStep("running");
    } catch {}
  }, [step]);

  const fetchHistory = useCallback(async (page = 1, address?: string) => {
    try {
      const addr = address || userbot?.address || "";
      const q = addr ? `page=${page}&address=${encodeURIComponent(addr)}` : `page=${page}`;
      const d = await vbotApi("GET", `/history?${q}`);
      setHistory(d.campaigns || []);
      setHistoryTotal(d.total || 0);
      setHistoryPage(page);
    } catch {}
  }, [userbot?.address]);

  const fetchWalletBalance = useCallback(async (key: string) => {
    try {
      const d = await vbotApi("POST", "/check-wallet", { key });
      if (d.bnbBalance != null) setUserbotBalance(d.bnbBalance);
    } catch {}
  }, []);

  const fetchRecoverable = useCallback(async () => {
    try {
      const d = await vbotApi("GET", "/recoverable");
      setRecoverable(d);
    } catch {}
  }, []);

  const doRecover = useCallback(async () => {
    setRecovering(true); setErr(null); setRecoveryResults(null);
    try {
      const d = await vbotApi("POST", "/recover");
      setRecoveryResults(d.results || []);
      setRecoverable({ hasRecoverable: false });
    } catch (e: any) { setErr(e.message); }
    setRecovering(false);
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchHistory(1);
    fetchRecoverable();
    pollRef.current = setInterval(fetchStatus, 6000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus, fetchHistory, fetchRecoverable]);

  useEffect(() => {
    if (userbot?.privateKey) {
      fetchWalletBalance(userbot.privateKey);
      const ti = setInterval(() => fetchWalletBalance(userbot.privateKey), 30000);
      return () => clearInterval(ti);
    }
  }, [userbot, fetchWalletBalance]);

  const validateToken = useCallback(async (addr: string) => {
    if (!addr || !/^0x[a-fA-F0-9]{40}$/i.test(addr)) { setTokenInfo(null); return; }
    setTokenValidating(true);
    try {
      const d = await vbotApi("POST", "/validate-token", { address: addr });
      setTokenInfo({ address: addr, ...d });
    } catch { setTokenInfo(null); }
    setTokenValidating(false);
  }, []);

  const handleTokenInput = (val: string) => {
    setTokenInput(val); setTokenInfo(null);
    if (tokenDebounceRef.current) clearTimeout(tokenDebounceRef.current);
    tokenDebounceRef.current = setTimeout(() => validateToken(val.trim()), 700);
  };

  const createUserbot = async () => {
    setCreating(true); setErr(null);
    try {
      const d = await vbotApi("POST", "/create-userbot");
      setUserbot(d); setStep("wallet"); fetchHistory(1, d.address);
    } catch (e: any) { setErr(e.message); }
    setCreating(false);
  };

  const loadUserbot = async () => {
    const key = loadKeyInput.trim();
    if (!key) return;
    setLoading(true); setErr(null);
    try {
      const d = await vbotApi("POST", "/check-wallet", { key });
      setUserbot({ address: d.address, privateKey: key });
      if (d.bnbBalance != null) setUserbotBalance(d.bnbBalance);
      setStep("wallet"); setLoadKeyInput(""); fetchHistory(1, d.address);
    } catch (e: any) { setErr(e.message || "Invalid private key"); }
    setLoading(false);
  };

  const startCampaign = async () => {
    if (!userbot) return;
    if (tokenInput && !tokenInfo?.valid) { setErr(t.vbErrNoToken as string); return; }
    setStarting(true); setErr(null);
    try {
      await vbotApi("POST", "/start", { ...settings, userbotKey: userbot.privateKey, tokenAddress: tokenInput || undefined });
      setStep("running"); fetchStatus();
    } catch (e: any) { setErr(e.message); }
    setStarting(false);
  };

  const stopCampaign = async () => {
    if (!stopConfirm) { setStopConfirm(true); return; }
    setStopConfirm(false);
    setStopping(true); setErr(null);
    try {
      await vbotApi("POST", "/stop", { reason: "manual stop" });
      setTimeout(() => {
        fetchStatus(); fetchHistory(1);
        if (userbot) {
          fetchWalletBalance(userbot.privateKey);
          setStep("wallet");
        } else {
          setStep("setup");
        }
      }, 2000);
    } catch (e: any) { setErr(e.message); }
    setStopping(false);
  };

  const est = (() => {
    const wallets = Math.max(1, Math.min(20, parseInt(settings.walletCount) || 3));
    const duration = parseFloat(settings.duration) || 60;
    const minT = parseFloat(settings.minTradeSize) || 0.0005;
    const maxT = parseFloat(settings.maxTradeSize) || 0.005;
    const minI = parseFloat(settings.minInterval) || 5;
    const maxI = parseFloat(settings.maxInterval) || 15;
    const reserve = parseFloat(settings.minBnbReserve) || 0.01;
    const avg = (minT + maxT) / 2;
    const avgI = (minI + maxI) / 2;
    const tradesPerWallet = Math.floor((duration * 60) / avgI);
    const total = tradesPerWallet * wallets;
    const gas = total * 0.0003 + wallets * 0.0005;
    const volume = total * avg;
    const tax = Math.floor(total / 2) * avg * 0.06;
    const recommended = wallets * avg * 3 + gas + reserve * wallets + tax;
    const minimum = wallets * minT * 2 + gas + reserve * wallets + tax;
    return { wallets, tradesPerWallet, total, avg, volume, gas, tax, reserve, recommended, minimum };
  })();

  const inputCls = "w-full rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none font-mono transition-all";
  const inputStyle: React.CSSProperties = {
    background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.25) 100%)",
    border: "1.5px solid rgba(255,255,255,0.09)",
    boxShadow: "inset 0 2px 6px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.04)",
  };

  const running = status?.running || step === "running";

  const settingFields: [string, string][] = [
    [t.vbWallets as string, "walletCount"],
    [t.vbDuration as string, "duration"],
    [t.vbMinTrade as string, "minTradeSize"],
    [t.vbMaxTrade as string, "maxTradeSize"],
    [t.vbMinInterval as string, "minInterval"],
    [t.vbMaxInterval as string, "maxInterval"],
    [t.vbTargetVolume as string, "targetVolume"],
    [t.vbMinReserve as string, "minBnbReserve"],
  ];

  return (
    <div className="w-full h-full overflow-y-auto pt-28 pb-24 px-4">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 relative overflow-hidden"
            style={{ background: "linear-gradient(160deg, #d5f70433 0%, #d5f7040a 100%)", border: "1.5px solid #d5f70444", boxShadow: "0 4px 16px #d5f70433, inset 0 1px 0 rgba(255,255,255,0.1)" }}>
            <Bot size={20} className="text-[#d5f704] relative z-10" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{t.vbTitle as string}</h1>
            <p className="text-xs text-white/40 mt-0.5">{t.vbSubtitle as string}</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: running ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.04)", border: running ? "1.5px solid rgba(34,197,94,0.3)" : "1.5px solid rgba(255,255,255,0.08)", color: running ? "#4ade80" : "rgba(255,255,255,0.3)", boxShadow: running ? "0 0 12px rgba(34,197,94,0.2)" : "none" }}>
            <span className={`w-1.5 h-1.5 rounded-full ${running ? "bg-green-400 animate-pulse" : "bg-white/20"}`} />
            {running ? t.vbRunning as string : t.vbStopped as string}
          </div>
        </div>

        {/* Error banner */}
        {err && (
          <div className="flex items-start gap-3 rounded-2xl px-4 py-3"
            style={{ background: "rgba(239,68,68,0.08)", border: "1.5px solid rgba(239,68,68,0.2)", boxShadow: "0 4px 16px rgba(239,68,68,0.1)" }}>
            <AlertTriangle size={15} className="text-red-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-sm text-red-300/80">{err}</div>
            <button onClick={() => setErr(null)} className="text-red-400/40 hover:text-red-400 text-xs transition-colors">✕</button>
          </div>
        )}


        {/* Fund Recovery */}
        {recoverable?.hasRecoverable && (
          <JellyCard accent="#f59e0b">
            <div className="flex items-center gap-2 text-sm font-bold text-[#f59e0b] mb-2">
              <AlertTriangle size={15} />
              {t.vbRecoveryTitle as string}
            </div>
            <p className="text-xs text-white/60 leading-relaxed mb-3">
              {(t.vbRecoveryDesc as string).replace("{count}", String(recoverable.walletCount || 0)).replace("{id}", String(recoverable.campaignId || "?"))}
            </p>
            {recoverable.addresses && recoverable.addresses.length > 0 && (
              <div className="space-y-1 mb-4">
                {recoverable.addresses.map((addr, i) => (
                  <div key={i} className="font-mono text-[11px] text-[#f59e0b]/80 break-all">{addr}</div>
                ))}
              </div>
            )}
            <JellyButton onClick={doRecover} disabled={recovering} color="#f59e0b" textColor="#ffffff">
              {recovering ? <><RefreshCw size={15} className="animate-spin" /> {t.vbRecovering as string}</> : <>{t.vbRecoverBtn as string}</>}
            </JellyButton>
          </JellyCard>
        )}

        {/* Recovery Results */}
        {recoveryResults && recoveryResults.length > 0 && (
          <JellyCard accent="#22c55e">
            <div className="flex items-center gap-2 text-sm font-bold text-green-400 mb-3">
              <CheckCircle2 size={15} />
              {t.vbRecoverySuccess as string}
            </div>
            <div className="space-y-1.5">
              {recoveryResults.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs px-3 py-2 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <span className="font-mono text-white/40">{r.address ? `${r.address.slice(0, 8)}…${r.address.slice(-6)}` : "—"}</span>
                  <span className="font-mono text-[#d5f704]">{r.recovered || "0"} BNB</span>
                  <span className={`text-[10px] font-bold ${r.success ? "text-green-400" : "text-red-400"}`}>
                    {r.success ? "OK" : "FAIL"}
                  </span>
                </div>
              ))}
            </div>
          </JellyCard>
        )}

        {/* STEP 1: SETUP */}
        {step === "setup" && !running && (
          <div className="space-y-4">
            <JellyCard accent="#5b31fe">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(91,49,254,0.2)", border: "1.5px solid rgba(91,49,254,0.3)", boxShadow: "0 2px 10px rgba(91,49,254,0.2)" }}>
                  <Plus size={17} className="text-[#5b31fe]" />
                </div>
                <div>
                  <div className="font-bold text-white text-sm">{t.vbCreateTitle as string}</div>
                  <div className="text-xs text-white/40">{t.vbCreateSub as string}</div>
                </div>
              </div>
              <p className="text-xs text-white/50 leading-relaxed mb-4">{t.vbCreateDesc as string}</p>
              <JellyButton onClick={createUserbot} disabled={creating} color="#5b31fe" textColor="#c4b5fd">
                {creating ? <><RefreshCw size={15} className="animate-spin" /> {t.vbGenerating as string}</> : <><Plus size={15} /> {t.vbCreateBtn as string}</>}
              </JellyButton>
            </JellyCard>

            <JellyCard accent="#ffffff" style={{ padding: "16px 20px" }}>
              <button onClick={() => setLoadMode(!loadMode)} className="flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors w-full">
                <KeyRound size={14} />
                {t.vbLoadKey as string}
                <ArrowRight size={12} className={`ml-auto transition-transform duration-200 ${loadMode ? "rotate-90" : ""}`} />
              </button>
              {loadMode && (
                <div className="space-y-2 pt-3">
                  <input className={inputCls} style={inputStyle} placeholder={t.vbKeyPlaceholder as string}
                    value={loadKeyInput} onChange={e => setLoadKeyInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && loadUserbot()} />
                  <JellyButton onClick={loadUserbot} disabled={loading || !loadKeyInput.trim()} color="#5b31fe" textColor="#a78bfa">
                    {loading ? <><RefreshCw size={13} className="animate-spin" /> {t.vbLoading as string}</> : <><KeyRound size={13} /> {t.vbLoadWallet as string}</>}
                  </JellyButton>
                </div>
              )}
            </JellyCard>
          </div>
        )}

        {/* STEP 2: WALLET LOADED */}
        {step === "wallet" && userbot && !running && (
          <div className="space-y-4">
            <JellyCard accent="#d5f704">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#d5f704]/80 uppercase tracking-wider mb-4">
                <Wallet size={13} /> {t.vbYourWallet as string}
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="font-mono text-sm text-white/80 flex-1 break-all">{userbot.address}</span>
                <button onClick={() => copyText(userbot.address, setCopied, "addr")}
                  className="p-1.5 rounded-lg transition-all flex-shrink-0" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  {copied === "addr" ? <Check size={13} className="text-green-400" /> : <Copy size={13} className="text-white/40" />}
                </button>
                <a href={`https://bscscan.com/address/${userbot.address}`} target="_blank" rel="noopener noreferrer"
                  className="p-1.5 rounded-lg transition-all flex-shrink-0" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <ExternalLink size={13} className="text-white/40 hover:text-[#5b31fe]" />
                </a>
              </div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-white/40">{t.vbBalance as string}</span>
                <span className="font-mono font-bold text-[#d5f704]">
                  {userbotBalance != null ? `${userbotBalance.toFixed(5)} BNB` : <span className="text-white/30 text-xs">{t.vbChecking as string}</span>}
                </span>
              </div>
              <div className="rounded-xl px-4 py-3 mb-4" style={{ background: "rgba(213,247,4,0.06)", border: "1.5px solid rgba(213,247,4,0.18)", boxShadow: "0 2px 12px rgba(213,247,4,0.08)" }}>
                <p className="text-xs text-[#d5f704]/80 leading-relaxed">{t.vbDepositHint as string}</p>
              </div>
              {userbot.privateKey && (
                <div className="space-y-1.5 mb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-white/30 uppercase tracking-wider">{t.vbPrivateKey as string}</span>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setShowKey(!showKey)} className="text-[11px] text-white/30 hover:text-white/60 flex items-center gap-1 transition-colors">
                        {showKey ? <><EyeOff size={11} /> {t.vbHide as string}</> : <><Eye size={11} /> {t.vbShow as string}</>}
                      </button>
                      <button onClick={() => copyText(userbot.privateKey, setCopied, "key")}
                        className="text-[11px] text-white/30 hover:text-[#5b31fe] flex items-center gap-1 transition-colors">
                        {copied === "key" ? <><Check size={11} className="text-green-400" /> {t.vbKeyCopied as string}</> : <><Copy size={11} /> {t.vbCopyKey as string}</>}
                      </button>
                    </div>
                  </div>
                  <div className="rounded-lg px-3 py-2 font-mono text-xs break-all text-white/50 select-all"
                    style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "inset 0 2px 6px rgba(0,0,0,0.4)" }}>
                    {showKey ? userbot.privateKey : "•".repeat(64)}
                  </div>
                  <p className="text-[10px] text-red-400/60 flex items-center gap-1">
                    <AlertTriangle size={10} /> {t.vbSaveKeyWarn as string}
                  </p>
                </div>
              )}
              <button onClick={() => { setUserbot(null); setUserbotBalance(null); setStep("setup"); setShowKey(false); }}
                className="text-xs text-white/20 hover:text-white/50 transition-colors mt-1">
                {t.vbUseDifferent as string}
              </button>
            </JellyCard>

            {/* Campaign Settings */}
            <JellyCard accent="#ffffff">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-5">{t.vbCampaignSettings as string}</h3>
              <div className="mb-5">
                <label className="block text-[11px] text-white/40 mb-1.5 uppercase tracking-wider">{t.vbTargetToken as string}</label>
                <div className="relative">
                  <input className={`${inputCls} pr-10`} style={inputStyle}
                    placeholder={t.vbTokenPlaceholder as string}
                    value={tokenInput} onChange={e => handleTokenInput(e.target.value)} />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {tokenValidating && <Loader2 size={15} className="animate-spin text-white/30" />}
                    {!tokenValidating && tokenInfo?.valid === true && <CheckCircle2 size={15} className="text-green-400" />}
                    {!tokenValidating && tokenInfo?.valid === false && <XCircle size={15} className="text-red-400" />}
                    {!tokenValidating && !tokenInfo && tokenInput.length > 5 && <Search size={15} className="text-white/20" />}
                  </div>
                </div>
                {tokenInfo?.valid && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <CheckCircle2 size={11} className="text-green-400" />
                    <span className="text-[11px] text-green-400">{tokenInfo.symbol || "Token"} — {t.vbTokenFound as string}</span>
                    <a href={`https://bscscan.com/address/${tokenInfo.pair}`} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] text-white/25 hover:text-[#5b31fe] flex items-center gap-0.5 ml-auto transition-colors">
                      {t.vbPair as string} <ExternalLink size={9} />
                    </a>
                  </div>
                )}
                {tokenInfo?.valid === false && (
                  <p className="text-[11px] text-red-400/70 mt-1 flex items-center gap-1">
                    <XCircle size={11} /> {t.vbTokenNotFound as string}
                  </p>
                )}
                {!tokenInput && <p className="text-[11px] text-white/25 mt-1">{t.vbTokenDefault as string}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-5">
                {settingFields.map(([label, key]) => (
                  <div key={key}>
                    <label className="block text-[11px] text-white/40 mb-1.5 uppercase tracking-wider">{label}</label>
                    <input className={inputCls} style={inputStyle}
                      value={(settings as any)[key]}
                      onChange={e => setSettings(s => ({ ...s, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>

              {/* BNB Estimator */}
              <div className="rounded-2xl p-4 mb-5 relative overflow-hidden"
                style={{ background: "linear-gradient(160deg, rgba(213,247,4,0.07) 0%, rgba(0,0,0,0.2) 100%)", border: "1.5px solid rgba(213,247,4,0.18)", boxShadow: "0 4px 20px rgba(213,247,4,0.07), inset 0 1px 0 rgba(255,255,255,0.05)" }}>
                <span style={{ position: "absolute", top: 0, left: 0, right: 0, height: "40%", background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 100%)", borderRadius: "inherit", pointerEvents: "none" }} />
                <div className="text-[10px] font-semibold text-[#d5f704]/60 uppercase tracking-wider mb-3 relative">{t.vbEstimator as string}</div>
                <div className="space-y-1.5 relative">
                  {([
                    [t.vbEstTrades, `~${est.tradesPerWallet}`, ""],
                    [t.vbEstTotal, `~${est.total}`, ""],
                    [t.vbEstVolume, `${est.volume.toFixed(4)} BNB`, "text-[#d5f704]"],
                    [t.vbEstGas, `${est.gas.toFixed(4)} BNB`, "text-white/40"],
                    [t.vbEstTax, `${est.tax.toFixed(4)} BNB`, "text-red-400/60"],
                  ] as [string, string, string][]).map(([l, v, cls]) => (
                    <div key={l as string} className="flex justify-between text-xs">
                      <span className="text-white/35">{l as string}</span>
                      <span className={cls || "text-white/60"}>{v}</span>
                    </div>
                  ))}
                  <div className="border-t border-white/8 my-2" />
                  <div className="flex justify-between text-xs">
                    <span className="text-white/40">{t.vbEstMin as string}</span>
                    <span className="text-[#d5f704]/70 font-mono">{est.minimum.toFixed(4)} BNB</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-white/60">{t.vbEstRecommended as string}</span>
                    <span className="text-[#d5f704] font-mono">{est.recommended.toFixed(4)} BNB</span>
                  </div>
                </div>
              </div>

              <JellyButton onClick={startCampaign} disabled={starting || (!!tokenInput && !tokenInfo?.valid)} color="#d5f704" textColor="#ffffff">
                {starting ? <><RefreshCw size={15} className="animate-spin" /> {t.vbStarting as string}</> : <><Play size={15} /> {t.vbStartCampaign as string}</>}
              </JellyButton>
            </JellyCard>
          </div>
        )}

        {/* STEP 3: RUNNING */}
        {running && (
          <div className="space-y-4">
            {(status?.userbotAddress || userbot?.address) && (
              <JellyCard accent="#d5f704" style={{ padding: "14px 18px" }}>
                <div className="flex items-center gap-3">
                  <Wallet size={16} className="text-[#d5f704] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-[#d5f704]/70 uppercase tracking-wider mb-0.5">{t.vbYourWallet as string}</div>
                    <div className="font-mono text-xs text-white/70 truncate">{status?.userbotAddress || userbot?.address}</div>
                  </div>
                  {userbotBalance != null && <span className="font-mono font-bold text-[#d5f704] text-sm flex-shrink-0">{userbotBalance.toFixed(4)} BNB</span>}
                </div>
              </JellyCard>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label={t.vbTxCount as string} icon={<Activity size={12} />}
                value={status?.metrics?.txCount ?? 0}
                sub={`${status?.metrics?.buys ?? 0}B / ${status?.metrics?.sells ?? 0}S`} />
              <StatCard label={t.vbColVolume as string} icon={<TrendingUp size={12} />}
                value={`${(status?.metrics?.volumeBnb ?? 0).toFixed(4)} BNB`} accent="#d5f704" />
              <StatCard label={t.vbSubWallets as string} icon={<Users size={12} />}
                value={status?.subWallets?.length ?? 0}
                sub={`${t.vbErrors as string}: ${status?.metrics?.errors ?? 0}`} />
            </div>

            {(status?.subWallets?.length ?? 0) > 0 && (
              <JellyCard accent="#ffffff">
                <div className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-3">{t.vbSubWallets as string}</div>
                <div className="space-y-1.5">
                  {status!.subWallets.map((sw: any, i: number) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl text-xs"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <span className="font-mono text-white/40">{shortAddr(sw.address)}</span>
                      <span className="font-mono text-white/60">{(sw.bnb || 0).toFixed(5)} BNB</span>
                      <span className={`font-bold text-[10px] ${sw.buyCycle ? "text-green-400" : "text-red-400"}`}>
                        {sw.buyCycle ? t.vbBuy as string : t.vbSell as string}
                      </span>
                    </div>
                  ))}
                </div>
              </JellyCard>
            )}

            {status?.metrics?.lastTx && (
              <a href={`https://bscscan.com/tx/${status.metrics.lastTx}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-white/25 hover:text-[#5b31fe] transition-colors">
                <ExternalLink size={11} />
                {t.vbLastTx as string} {status.metrics.lastTx.slice(0, 26)}…
              </a>
            )}

            {stopConfirm ? (
              <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(239,68,68,0.1)", border: "1.5px solid rgba(239,68,68,0.3)" }}>
                <p className="text-sm text-red-300 text-center">{t.vbStopConfirm as string}</p>
                <div className="flex gap-3">
                  <button onClick={() => setStopConfirm(false)}
                    className="flex-1 py-2.5 rounded-xl text-sm text-white/50 hover:text-white/80 transition-colors"
                    style={{ border: "1.5px solid rgba(255,255,255,0.1)" }}>
                    {t.vbCancel as string}
                  </button>
                  <JellyButton onClick={stopCampaign} disabled={stopping} color="#ef4444" textColor="#fca5a5" className="flex-1">
                    {stopping ? <><RefreshCw size={15} className="animate-spin" /> {t.vbStopping as string}</> : <><Square size={15} /> {t.vbStopCampaign as string}</>}
                  </JellyButton>
                </div>
              </div>
            ) : (
              <JellyButton onClick={stopCampaign} disabled={stopping} color="#ef4444" textColor="#fca5a5">
                {stopping ? <><RefreshCw size={15} className="animate-spin" /> {t.vbStopping as string}</> : <><Square size={15} /> {t.vbStopCampaign as string}</>}
              </JellyButton>
            )}
          </div>
        )}

        {/* Campaign History */}
        <JellyCard accent="#ffffff">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">{t.vbHistory as string}</h3>
          {history.length === 0 ? (
            <p className="text-sm text-white/20 text-center py-4">{t.vbNoHistory as string}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/6">
                      {[t.vbColId, t.vbColStatus, t.vbColToken, t.vbColTxns, t.vbColVolume, t.vbColGas, t.vbColStarted, t.vbColStopped].map(h => (
                        <th key={h as string} className="text-left pb-2 px-2 text-white/25 font-medium uppercase tracking-wider text-[9px]">{h as string}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((c: any) => {
                      let ps: any = {};
                      try { ps = JSON.parse(c.settings_json || "{}"); } catch {}
                      return (
                        <tr key={c.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                          <td className="py-2.5 px-2 text-white/35">#{c.id}</td>
                          <td className="py-2.5 px-2"><span className={`font-semibold text-[10px] ${c.status === "running" ? "text-green-400" : "text-white/25"}`}>{c.status}</span></td>
                          <td className="py-2.5 px-2 text-white/35 font-mono text-[10px]">{ps.tokenAddress ? shortAddr(ps.tokenAddress) : "BFLAP"}</td>
                          <td className="py-2.5 px-2 text-white/60">{c.tx_count}</td>
                          <td className="py-2.5 px-2 font-mono text-[#d5f704]">{Number(c.volume_generated || 0).toFixed(4)}</td>
                          <td className="py-2.5 px-2 font-mono text-white/30">{Number(c.bnb_spent || 0).toFixed(5)}</td>
                          <td className="py-2.5 px-2 text-white/30 text-[10px]">{c.started_at ? new Date(c.started_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                          <td className="py-2.5 px-2 text-white/30 text-[10px]">{c.ended_at ? new Date(c.ended_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {historyTotal > 10 && (
                <div className="flex items-center justify-end gap-2 mt-3">
                  <button onClick={() => fetchHistory(historyPage - 1)} disabled={historyPage <= 1}
                    className="p-1.5 rounded-lg transition-all disabled:opacity-20"
                    style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}>
                    <ChevronLeft size={13} className="text-white/40" />
                  </button>
                  <span className="text-xs text-white/25">{t.vbPageOf as string} {historyPage} / {Math.ceil(historyTotal / 10)}</span>
                  <button onClick={() => fetchHistory(historyPage + 1)} disabled={historyPage >= Math.ceil(historyTotal / 10)}
                    className="p-1.5 rounded-lg transition-all disabled:opacity-20"
                    style={{ border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)" }}>
                    <ChevronRight size={13} className="text-white/40" />
                  </button>
                </div>
              )}
            </>
          )}
        </JellyCard>

        <div className="text-center mt-6 pb-4 text-white/20 text-[10px]">
          {t.vbFooter as string}
        </div>

      </div>
    </div>
  );
}
