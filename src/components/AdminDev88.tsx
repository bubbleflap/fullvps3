import { useState, useEffect, useCallback } from "react";
import { Save, Loader2, Check, ArrowLeft, Link, AtSign, Globe, FileCode, Lock, RefreshCw, Sliders, Users, Trash2, Plus, Eye, EyeOff, Activity, Key, Shield } from "lucide-react";
import { refreshSettings } from "../hooks/useSettings";
import { useLang } from "../lib/i18n";

interface Settings {
  ca_address: string;
  telegram: string;
  twitter: string;
  github: string;
  email: string;
  bflap_link: string;
  flapsh_link: string;
}

const DEFAULT_SETTINGS: Settings = {
  ca_address: "",
  telegram: "",
  twitter: "",
  github: "",
  email: "",
  bflap_link: "",
  flapsh_link: "",
};

const FIELDS: { key: keyof Settings; label: string; icon: React.ReactNode; placeholder: string; group: string }[] = [
  { key: "ca_address", label: "Contract Address (CA)", icon: <FileCode size={16} />, placeholder: "0x...", group: "Contract" },
  { key: "telegram", label: "Telegram", icon: <Link size={16} />, placeholder: "https://t.me/...", group: "Social Links" },
  { key: "twitter", label: "Twitter / X", icon: <AtSign size={16} />, placeholder: "https://x.com/...", group: "Social Links" },
  { key: "github", label: "GitHub", icon: <Globe size={16} />, placeholder: "https://github.com/...", group: "Social Links" },
  { key: "email", label: "Email", icon: <AtSign size={16} />, placeholder: "dev@example.com", group: "Social Links" },
  { key: "bflap_link", label: "$BFLAP Button Link", icon: <Link size={16} />, placeholder: "https://flap.sh/bnb/...", group: "Button Links" },
  { key: "flapsh_link", label: "Flap.sh Button Link", icon: <Link size={16} />, placeholder: "https://flap.sh/bnb/...", group: "Button Links" },
];

interface VisitorStats {
  online_now: number;
  today_visitors: number;
  week_visitors: number;
  total_visitors: number;
  daily_stats: Array<{ date: string; visitors: number; page_views: number }>;
  top_pages: Array<{ page: string; views: number; unique_visitors: number }>;
  country_stats: Array<{ country: string; visitors: string }>;
  recent_visitors: Array<{ ip_hash: string; country: string; page: string; wallet_address: string | null; created_at: string }>;
}

interface OnlineUser {
  visitor_id: string;
  ip_hash: string;
  page: string;
  wallet: string | null;
  country: string;
  last_seen: string;
  idle_seconds: number;
}

const countryFlags: Record<string, string> = {US:'🇺🇸',CN:'🇨🇳',GB:'🇬🇧',DE:'🇩🇪',FR:'🇫🇷',JP:'🇯🇵',KR:'🇰🇷',IN:'🇮🇳',BR:'🇧🇷',CA:'🇨🇦',AU:'🇦🇺',RU:'🇷🇺',SG:'🇸🇬',HK:'🇭🇰',TW:'🇹🇼',MY:'🇲🇾',TH:'🇹🇭',VN:'🇻🇳',ID:'🇮🇩',PH:'🇵🇭',NL:'🇳🇱',IT:'🇮🇹',ES:'🇪🇸',TR:'🇹🇷',AE:'🇦🇪',NG:'🇳🇬',ZA:'🇿🇦',MX:'🇲🇽',AR:'🇦🇷',PL:'🇵🇱',UA:'🇺🇦',SE:'🇸🇪',CH:'🇨🇭',AT:'🇦🇹',BE:'🇧🇪',PT:'🇵🇹',CZ:'🇨🇿',RO:'🇷🇴',IL:'🇮🇱',SA:'🇸🇦',EG:'🇪🇬',PK:'🇵🇰',BD:'🇧🇩',CO:'🇨🇴',CL:'🇨🇱',PE:'🇵🇪',FI:'🇫🇮',DK:'🇩🇰',NO:'🇳🇴',IE:'🇮🇪',NZ:'🇳🇿',KE:'🇰🇪',GH:'🇬🇭',MM:'🇲🇲',KH:'🇰🇭',LK:'🇱🇰',NP:'🇳🇵'};
const countryNames: Record<string, string> = {US:'United States',CN:'China',GB:'United Kingdom',DE:'Germany',FR:'France',JP:'Japan',KR:'South Korea',IN:'India',BR:'Brazil',CA:'Canada',AU:'Australia',RU:'Russia',SG:'Singapore',HK:'Hong Kong',TW:'Taiwan',MY:'Malaysia',TH:'Thailand',VN:'Vietnam',ID:'Indonesia',PH:'Philippines',NL:'Netherlands',IT:'Italy',ES:'Spain',TR:'Turkey',AE:'UAE',NG:'Nigeria',ZA:'South Africa',MX:'Mexico',AR:'Argentina',PL:'Poland',UA:'Ukraine',SE:'Sweden',CH:'Switzerland',AT:'Austria',BE:'Belgium',PT:'Portugal',CZ:'Czech Republic',RO:'Romania',IL:'Israel',SA:'Saudi Arabia',EG:'Egypt',PK:'Pakistan',BD:'Bangladesh',CO:'Colombia',CL:'Chile',PE:'Peru',FI:'Finland',DK:'Denmark',NO:'Norway',IE:'Ireland',NZ:'New Zealand',KE:'Kenya',GH:'Ghana',MM:'Myanmar',KH:'Cambodia',LK:'Sri Lanka',NP:'Nepal'};

function getFlag(code: string) { return countryFlags[code] || '🌍'; }
function getCountryName(code: string) { return countryNames[code] || code || 'Unknown'; }

export default function AdminDev88({ onBack }: { onBack: () => void }) {
  const { t } = useLang();
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  const [currentTab, setCurrentTab] = useState<"settings" | "traffic" | "lottery" | "partners" | "system">("settings");

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [visitorStats, setVisitorStats] = useState<VisitorStats | null>(null);
  const [onlineUsersList, setOnlineUsersList] = useState<OnlineUser[]>([]);
  const [trafficLoading, setTrafficLoading] = useState(false);

  const [lotteryRTP, setLotteryRTP] = useState(100);
  const [lotteryRTPInput, setLotteryRTPInput] = useState(100);
  const [rtpSaving, setRtpSaving] = useState(false);
  const [rtpSaved, setRtpSaved] = useState(false);
  const [lotteryUsers, setLotteryUsers] = useState<any[]>([]);
  const [lotteryLoading, setLotteryLoading] = useState(false);
  const [playersPage, setPlayersPage] = useState(1);
  const PLAYERS_PER_PAGE = 6;
  const [liveBnbPrice, setLiveBnbPrice] = useState(0);
  const [liveBflapPrice, setLiveBflapPrice] = useState(0);
  const [platformPnl, setPlatformPnl] = useState<any>(null);

  const [addSpinsWallet, setAddSpinsWallet] = useState("");
  const [addSpinsTier, setAddSpinsTier] = useState<"049"|"099"|"150">("099");
  const [addSpinsQty, setAddSpinsQty] = useState(1);
  const [addSpinsLoading, setAddSpinsLoading] = useState(false);
  const [addSpinsResult, setAddSpinsResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [bulkWallets, setBulkWallets] = useState("");
  const [bulkTier, setBulkTier] = useState<"049"|"099"|"150">("099");
  const [bulkQty, setBulkQty] = useState(1);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [banningWallet, setBanningWallet] = useState<string | null>(null);

  const [partnerList, setPartnerList] = useState<{ address: string; name: string; created_at: string }[]>([]);
  const [partnerLoading, setPartnerLoading] = useState(false);
  const [newPartnerCA, setNewPartnerCA] = useState("");
  const [newPartnerName, setNewPartnerName] = useState("");
  const [partnerAddLoading, setPartnerAddLoading] = useState(false);
  const [partnerAddResult, setPartnerAddResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [partnerDeleteLoading, setPartnerDeleteLoading] = useState<string | null>(null);

  // System tab state
  type PageRow = { id: string; visible: boolean };
  const [pages, setPages] = useState<PageRow[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pageToggling, setPageToggling] = useState<string | null>(null);

  type HealthError = { time: number; method: string; url: string; status: number };
  type HealthData = {
    uptime_human: string; req_per_min: number; req_per_5min: number;
    total_requests: number; total_errors: number; recent_errors: HealthError[]; memory_mb: number; heap_mb: number;
    load_1m: string; load_5m: string; cpu_cores: number; db_ok: boolean; node_version: string; alert: string | null;
  };
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [showErrorLog, setShowErrorLog] = useState(false);

  type OrKey = { id: string; masked: string; active: boolean };
  const [orKeys, setOrKeys] = useState<OrKey[]>([]);
  const [orKeysLoading, setOrKeysLoading] = useState(false);
  const [newOrKey, setNewOrKey] = useState("");
  const [newOrLabel, setNewOrLabel] = useState("");
  const [orKeyAdding, setOrKeyAdding] = useState(false);
  const [orKeyDeleting, setOrKeyDeleting] = useState<string | null>(null);
  const [orKeyActivating, setOrKeyActivating] = useState<string | null>(null);

  const groupLabels: Record<string, string> = {
    "Contract": t.contract as string,
    "Social Links": t.socialLinks as string,
    "Button Links": t.buttonLinks as string,
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setAuthenticated(true);
      } else {
        setLoginError(t.wrongPassword as string);
      }
    } catch {
      setLoginError("Connection error");
    } finally {
      setLoginLoading(false);
    }
  };

  useEffect(() => {
    if (!authenticated) return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings({ ...DEFAULT_SETTINGS, ...data });
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load settings");
        setLoading(false);
      });
  }, [authenticated]);

  const loadTrafficData = useCallback(async () => {
    setTrafficLoading(true);
    try {
      const [vRes, oRes] = await Promise.all([
        fetch(`/api/dev88/visitors?password=${encodeURIComponent(password)}`).then(r => r.json()),
        fetch(`/api/dev88/online?password=${encodeURIComponent(password)}`).then(r => r.json()),
      ]);
      setVisitorStats(vRes);
      setOnlineUsersList(oRes.users || []);
    } catch (e) {
      console.error("Traffic load error:", e);
    } finally {
      setTrafficLoading(false);
    }
  }, [password]);

  const loadLotteryData = useCallback(async () => {
    setLotteryLoading(true);
    try {
      const [rtpRes, usersRes] = await Promise.all([
        fetch(`/api/dev88/rtp?password=${encodeURIComponent(password)}`).then(r => r.json()),
        fetch(`/api/dev88/lottery-users?password=${encodeURIComponent(password)}`).then(r => r.json()),
      ]);
      if (rtpRes.rtp !== undefined) { setLotteryRTP(rtpRes.rtp); setLotteryRTPInput(rtpRes.rtp); }
      if (usersRes.users) {
        setLotteryUsers(usersRes.users);
        setLiveBnbPrice(usersRes.bnbPrice || 0);
        setLiveBflapPrice(usersRes.bflapPrice || 0);
        if (usersRes.platform) setPlatformPnl(usersRes.platform);
      } else {
        setLotteryUsers(Array.isArray(usersRes) ? usersRes : []);
      }
    } catch (e) {
      console.error("Lottery load error:", e);
    } finally {
      setLotteryLoading(false);
    }
  }, [password]);

  const loadSystemData = useCallback(async () => {
    setPagesLoading(true);
    setHealthLoading(true);
    setOrKeysLoading(true);
    try {
      const [pRes, hRes, kRes] = await Promise.all([
        fetch(`/api/dev88/pages?password=${encodeURIComponent(password)}`).then(r => r.json()),
        fetch(`/api/dev88/health?password=${encodeURIComponent(password)}`).then(r => r.json()),
        fetch(`/api/dev88/openrouter-keys?password=${encodeURIComponent(password)}`).then(r => r.json()),
      ]);
      if (pRes.pages) setPages(pRes.pages);
      setHealth(hRes.uptime_human !== undefined ? hRes : null);
      if (kRes.keys) setOrKeys(kRes.keys);
    } catch (e) {
      console.error("System load error:", e);
    } finally {
      setPagesLoading(false);
      setHealthLoading(false);
      setOrKeysLoading(false);
    }
  }, [password]);

  const togglePage = async (id: string, visible: boolean) => {
    setPageToggling(id);
    try {
      await fetch(`/api/dev88/pages?password=${encodeURIComponent(password)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: id, visible }),
      });
      setPages(prev => prev.map(p => p.id === id ? { ...p, visible } : p));
    } catch {}
    finally { setPageToggling(null); }
  };

  const addOrKey = async () => {
    if (!newOrKey.trim()) return;
    setOrKeyAdding(true);
    try {
      const res = await fetch(`/api/dev88/openrouter-keys?password=${encodeURIComponent(password)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: newOrKey.trim(), label: newOrLabel.trim() }),
      });
      const data = await res.json();
      if (data.ok) { setNewOrKey(""); setNewOrLabel(""); await loadSystemData(); }
    } catch {}
    finally { setOrKeyAdding(false); }
  };

  const activateOrKey = async (id: string) => {
    setOrKeyActivating(id);
    try {
      await fetch(`/api/dev88/openrouter-keys/activate?password=${encodeURIComponent(password)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setOrKeys(prev => prev.map(k => ({ ...k, active: k.id === id })));
    } catch {}
    finally { setOrKeyActivating(null); }
  };

  const deleteOrKey = async (id: string) => {
    setOrKeyDeleting(id);
    try {
      await fetch(`/api/dev88/openrouter-keys/${id}?password=${encodeURIComponent(password)}`, { method: "DELETE" });
      setOrKeys(prev => prev.filter(k => k.id !== id));
    } catch {}
    finally { setOrKeyDeleting(null); }
  };

  const saveRTP = async () => {
    setRtpSaving(true);
    setRtpSaved(false);
    try {
      const res = await fetch(`/api/dev88/rtp?password=${encodeURIComponent(password)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rtp: lotteryRTPInput }),
      });
      if (res.ok) {
        const d = await res.json();
        setLotteryRTP(d.rtp);
        setRtpSaved(true);
        setTimeout(() => setRtpSaved(false), 3000);
      }
    } catch (e) { console.error("RTP save error:", e); }
    finally { setRtpSaving(false); }
  };

  const handleAddSpins = async () => {
    if (addSpinsLoading) return;
    setAddSpinsLoading(true);
    setAddSpinsResult(null);
    try {
      const res = await fetch(`/api/dev88/add-spins?password=${encodeURIComponent(password)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: addSpinsWallet.trim(), tier: addSpinsTier, qty: addSpinsQty }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        setAddSpinsResult({ ok: true, msg: `✓ Added ${d.qty} spin${d.qty > 1 ? "s" : ""} (${d.tier === "049" ? "$0.49" : d.tier === "150" ? "$1.50" : "$0.99"}) to ${d.wallet.slice(0,6)}...${d.wallet.slice(-4)} — new balance: ${d.newBalance}` });
        setAddSpinsWallet("");
        setAddSpinsQty(1);
        loadLotteryData();
      } else {
        setAddSpinsResult({ ok: false, msg: d.error || "Failed" });
      }
    } catch (e: any) {
      setAddSpinsResult({ ok: false, msg: e.message || "Network error" });
    } finally {
      setAddSpinsLoading(false);
    }
  };

  const handleBulkAddSpins = async () => {
    if (bulkLoading) return;
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const res = await fetch(`/api/dev88/add-spins-bulk?password=${encodeURIComponent(password)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallets: bulkWallets, tier: bulkTier, qty: bulkQty }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        setBulkResult({ ok: true, msg: `✓ Added ${d.qty} spin${d.qty > 1 ? "s" : ""} (${d.tier === "049" ? "$0.49" : d.tier === "150" ? "$1.50" : "$0.99"}) to ${d.count} wallets` });
        setBulkWallets("");
        setBulkQty(1);
        loadLotteryData();
      } else {
        setBulkResult({ ok: false, msg: d.error || "Failed" });
      }
    } catch (e: any) {
      setBulkResult({ ok: false, msg: e.message || "Network error" });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleToggleBan = async (wallet: string, field: "wd_banned" | "deposit_banned", currentVal: boolean) => {
    setBanningWallet(wallet + field);
    try {
      const res = await fetch(`/api/dev88/lottery-ban?password=${encodeURIComponent(password)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, field, ban: !currentVal }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        setLotteryUsers(prev => prev.map(u => u.wallet_address === wallet ? { ...u, [field]: !currentVal } : u));
      }
    } catch (e) { console.error("Ban error:", e); }
    finally { setBanningWallet(null); }
  };

  useEffect(() => {
    if (authenticated && currentTab === "traffic") {
      loadTrafficData();
    }
  }, [authenticated, currentTab, loadTrafficData]);

  useEffect(() => {
    if (authenticated && currentTab === "system") {
      loadSystemData();
    }
  }, [authenticated, currentTab, loadSystemData]);

  const loadPartnerList = useCallback(async () => {
    setPartnerLoading(true);
    try {
      const res = await fetch(`/api/dev88/partners?password=${encodeURIComponent(password)}`).then(r => r.json());
      setPartnerList(res.partners || []);
    } catch (e) {
      console.error("Partner load error:", e);
    } finally {
      setPartnerLoading(false);
    }
  }, [password]);

  const handleAddPartner = async () => {
    if (partnerAddLoading) return;
    setPartnerAddLoading(true);
    setPartnerAddResult(null);
    try {
      const res = await fetch(`/api/dev88/partners?password=${encodeURIComponent(password)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: newPartnerCA.trim(), name: newPartnerName.trim() }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        setPartnerList(d.partners || []);
        setPartnerAddResult({ ok: true, msg: `✓ Partner added: ${newPartnerCA.slice(0, 6)}...${newPartnerCA.slice(-4)}` });
        setNewPartnerCA("");
        setNewPartnerName("");
      } else {
        setPartnerAddResult({ ok: false, msg: d.error || "Failed to add partner" });
      }
    } catch (e: any) {
      setPartnerAddResult({ ok: false, msg: e.message || "Network error" });
    } finally {
      setPartnerAddLoading(false);
    }
  };

  const handleRemovePartner = async (address: string) => {
    setPartnerDeleteLoading(address);
    try {
      const res = await fetch(`/api/dev88/partners/${address}?password=${encodeURIComponent(password)}`, {
        method: "DELETE",
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        setPartnerList(d.partners || []);
      }
    } catch (e) {
      console.error("Remove partner error:", e);
    } finally {
      setPartnerDeleteLoading(null);
    }
  };

  useEffect(() => {
    if (authenticated && currentTab === "lottery") {
      loadLotteryData();
    }
  }, [authenticated, currentTab, loadLotteryData]);

  useEffect(() => {
    if (authenticated && currentTab === "partners") {
      loadPartnerList();
    }
  }, [authenticated, currentTab, loadPartnerList]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Save failed");
      }
      refreshSettings();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: keyof Settings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const groups = [...new Set(FIELDS.map((f) => f.group))];

  if (!authenticated) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <form onSubmit={handleLogin} className="w-full max-w-sm mx-auto px-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 space-y-5">
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-[#5b31fe]/20 flex items-center justify-center">
                <Lock size={24} className="text-[#5b31fe]" />
              </div>
              <div className="text-center">
                <h1 className="text-lg font-bold">{t.adminLogin}</h1>
                <p className="text-xs text-white/40 mt-1">dev88</p>
              </div>
            </div>
            <div className="space-y-2">
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setLoginError(null); }}
                placeholder={t.enterPassword as string}
                autoFocus
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#5b31fe]/50 focus:ring-1 focus:ring-[#5b31fe]/30 transition-colors"
              />
              {loginError && (
                <p className="text-xs text-red-400">{loginError}</p>
              )}
            </div>
            <button
              type="submit"
              disabled={loginLoading || !password}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm bg-[#d5f704] hover:bg-[#d5f704]/80 text-black transition-colors disabled:opacity-50"
            >
              {loginLoading ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
              {loginLoading ? t.checking : t.unlock}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="w-full text-center text-xs text-white/30 hover:text-white/50 transition-colors"
            >
              {t.backToSite}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#5b31fe]" />
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto pt-20 pb-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="text-xl font-bold">{t.adminPanel}</h1>
              <p className="text-xs text-white/40">dev88</p>
            </div>
          </div>
          {currentTab === "settings" && (
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-colors ${
                saved
                  ? "bg-green-500 text-white"
                  : "bg-[#d5f704] hover:bg-[#d5f704]/80 text-black"
              }`}
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : saved ? (
                <Check size={14} />
              ) : (
                <Save size={14} />
              )}
              {saving ? t.saving : saved ? t.saved : t.save}
            </button>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {(["settings", "traffic", "lottery", "partners", "system"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setCurrentTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                currentTab === tab
                  ? "bg-[#d5f704] text-black"
                  : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70"
              }`}
            >
              {tab === "settings" ? "Settings" : tab === "traffic" ? "Traffic" : tab === "lottery" ? "Lottery" : tab === "partners" ? "Partners" : "System"}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {currentTab === "settings" && (
          <>
            {groups.map((group) => (
              <div key={group} className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.03]">
                  <h2 className="text-sm font-bold text-white/70">{groupLabels[group] || group}</h2>
                </div>
                <div className="p-4 space-y-4">
                  {FIELDS.filter((f) => f.group === group).map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <label className="flex items-center gap-2 text-xs text-white/50 font-medium">
                        {field.icon}
                        {field.label}
                      </label>
                      <input
                        type="text"
                        value={settings[field.key]}
                        onChange={(e) => handleChange(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#5b31fe]/50 focus:ring-1 focus:ring-[#5b31fe]/30 transition-colors font-mono"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="text-center text-white/20 text-xs pt-2">
              {t.changesImmediate}
            </div>
          </>
        )}

        {currentTab === "traffic" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Online Now" value={visitorStats?.online_now ?? "-"} color="#8b5cf6" />
              <StatCard label="Today" value={visitorStats?.today_visitors ?? "-"} color="#f5a623" />
              <StatCard label="7 Days" value={visitorStats?.week_visitors ?? "-"} color="#3b82f6" />
              <StatCard label="Total" value={visitorStats?.total_visitors ?? "-"} color="#22c55e" />
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.03] flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#8b5cf6]">Online Now ({onlineUsersList.length})</h2>
                <button onClick={loadTrafficData} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">
                  <RefreshCw size={12} className={trafficLoading ? "animate-spin" : ""} />
                  Refresh
                </button>
              </div>
              {onlineUsersList.length === 0 ? (
                <div className="p-6 text-center text-white/30 text-sm">No users online right now</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5">
                        {["Status", "Location", "Page", "Idle"].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[10px] text-white/30 uppercase tracking-wider font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {onlineUsersList.map((u, i) => (
                        <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                          <td className="px-3 py-2.5">
                            <span className="inline-flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${u.idle_seconds < 60 ? "bg-green-500" : u.idle_seconds < 180 ? "bg-yellow-500" : "bg-red-500"}`} />
                              <span className="text-xs text-white/50">{u.idle_seconds < 60 ? "Active" : u.idle_seconds < 180 ? "Idle" : "Away"}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            {u.country && u.country !== "Unknown" ? getFlag(u.country) + " " + getCountryName(u.country) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-blue-400">{u.page || "/"}</td>
                          <td className="px-3 py-2.5 text-xs text-white/30">
                            {u.idle_seconds < 60 ? "Just now" : u.idle_seconds < 3600 ? Math.floor(u.idle_seconds / 60) + "m ago" : Math.floor(u.idle_seconds / 3600) + "h ago"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.03]">
                <h2 className="text-sm font-bold text-[#f5a623]">Site Traffic (Last 30 Days)</h2>
              </div>
              {!visitorStats?.daily_stats?.length ? (
                <div className="p-6 text-center text-white/30 text-sm">No traffic data yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5">
                        {["Date", "Unique Visitors", "Page Views"].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[10px] text-white/30 uppercase tracking-wider font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visitorStats.daily_stats.map((d, i) => (
                        <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                          <td className="px-3 py-2.5 text-xs">{new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                          <td className="px-3 py-2.5 text-xs font-mono">{d.visitors}</td>
                          <td className="px-3 py-2.5 text-xs font-mono">{d.page_views}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.03]">
                <h2 className="text-sm font-bold text-[#f5a623]">Top Pages</h2>
              </div>
              {!visitorStats?.top_pages?.length ? (
                <div className="p-6 text-center text-white/30 text-sm">No page data yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5">
                        {["Page", "Views", "Unique Visitors"].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[10px] text-white/30 uppercase tracking-wider font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visitorStats.top_pages.map((p, i) => (
                        <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                          <td className="px-3 py-2.5 text-xs text-blue-400">{p.page}</td>
                          <td className="px-3 py-2.5 text-xs font-mono">{p.views}</td>
                          <td className="px-3 py-2.5 text-xs font-mono">{p.unique_visitors}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.03]">
                <h2 className="text-sm font-bold text-[#f5a623]">Countries</h2>
              </div>
              {!visitorStats?.country_stats?.length ? (
                <div className="p-6 text-center text-white/30 text-sm">No country data yet — new visitors will be tracked automatically</div>
              ) : (
                <div className="p-4 space-y-2">
                  {(() => {
                    const countries = visitorStats.country_stats;
                    const totalVis = countries.reduce((s, c) => s + parseInt(c.visitors), 0);
                    const maxVis = Math.max(...countries.map(c => parseInt(c.visitors)));
                    return countries.map((c, i) => {
                      const pct = totalVis > 0 ? ((parseInt(c.visitors) / totalVis) * 100).toFixed(1) : "0";
                      const barWidth = maxVis > 0 ? ((parseInt(c.visitors) / maxVis) * 100) : 0;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-xl w-8 text-center">{getFlag(c.country)}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-white">{getCountryName(c.country)}</span>
                              <span className="text-[10px] text-white/40">{pct}%</span>
                            </div>
                            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div className="h-full bg-[#f5a623] rounded-full transition-all" style={{ width: `${barWidth}%` }} />
                            </div>
                          </div>
                          <span className="text-xs text-white/30 min-w-[60px] text-right">{c.visitors}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.03]">
                <h2 className="text-sm font-bold text-[#f5a623]">Recent Visitors</h2>
              </div>
              {!visitorStats?.recent_visitors?.length ? (
                <div className="p-6 text-center text-white/30 text-sm">No visitor data yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5">
                        {["Visitor", "Country", "Page", "Time"].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[10px] text-white/30 uppercase tracking-wider font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visitorStats.recent_visitors.map((v, i) => (
                        <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                          <td className="px-3 py-2.5 text-xs font-mono text-white/40">{(v.ip_hash || "").substring(0, 10)}...</td>
                          <td className="px-3 py-2.5 text-xs">
                            {v.country && v.country !== "Unknown" ? getFlag(v.country) + " " + getCountryName(v.country) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-blue-400">{v.page || "/"}</td>
                          <td className="px-3 py-2.5 text-xs text-white/30">
                            {v.created_at ? new Date(v.created_at).toLocaleString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {currentTab === "lottery" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.03] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders size={14} className="text-[#d5f704]" />
                  <h2 className="text-sm font-bold text-[#d5f704]">RTP Setting</h2>
                </div>
                <button onClick={loadLotteryData} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">
                  <RefreshCw size={12} className={lotteryLoading ? "animate-spin" : ""} />
                  Refresh
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex justify-between mb-2">
                      <span className="text-xs text-white/50">Prize payout rate</span>
                      <span className="text-sm font-bold" style={{ color: lotteryRTPInput >= 70 ? "#ef4444" : lotteryRTPInput >= 50 ? "#f5a623" : "#22c55e" }}>
                        {lotteryRTPInput}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={100}
                      value={lotteryRTPInput}
                      onChange={e => setLotteryRTPInput(Number(e.target.value))}
                      className="w-full accent-[#d5f704]"
                    />
                    <div className="flex justify-between text-[10px] text-white/20 mt-1">
                      <span>1% (House wins most)</span>
                      <span>100% (Full payout)</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-white/40">
                  <span>Active RTP: <span className="text-white font-bold">{lotteryRTP}%</span></span>
                  <span>•</span>
                  <span>House edge: <span className="text-[#d5f704] font-bold">{100 - lotteryRTP}%</span></span>
                  <span>•</span>
                  <span>Per $0.99 spin → ~${(0.99 * lotteryRTPInput / 100).toFixed(2)} avg payout</span>
                </div>
                <button
                  onClick={saveRTP}
                  disabled={rtpSaving}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-colors ${rtpSaved ? "bg-green-500 text-white" : "bg-[#d5f704] hover:bg-[#d5f704]/80 text-black"}`}
                >
                  {rtpSaving ? <Loader2 size={14} className="animate-spin" /> : rtpSaved ? <Check size={14} /> : <Save size={14} />}
                  {rtpSaving ? "Saving..." : rtpSaved ? "Saved!" : "Apply RTP"}
                </button>
              </div>
            </div>

            {/* ── Spin Decision Engine ───────────────────────────── */}
            {(() => {
              const ZONK_IDS = new Set(['try_again','try_again_2','try_again_3']);
              const SEGMENTS = [
                { id: "try_again",   title: "Try Again",     dropRate: 30 },
                { id: "bnb_002",     title: "0.02 BNB",      dropRate: 2  },
                { id: "bflap_500",   title: "500 BFLAP",     dropRate: 8  },
                { id: "usd_010",     title: "$0.10",          dropRate: 20 },
                { id: "bnb_001",     title: "0.01 BNB",      dropRate: 3  },
                { id: "bflap_3k",    title: "3000 BFLAP",    dropRate: 5  },
                { id: "try_again_2", title: "Try Again",     dropRate: 15 },
                { id: "bnb_0005",    title: "0.005 BNB",     dropRate: 5  },
                { id: "usd_050",     title: "$0.50",          dropRate: 12 },
                { id: "bflap_1k",    title: "1000 BFLAP",    dropRate: 7  },
                { id: "bnb_0003",    title: "0.003 BNB",     dropRate: 8  },
                { id: "try_again_3", title: "Try Again",     dropRate: 15 },
                { id: "bflap_10k",   title: "10000 BFLAP",   dropRate: 5  },
                { id: "usd_100",     title: "$1.00",          dropRate: 8  },
                { id: "bnb_01",      title: "0.1 BNB",       dropRate: 0.4 },
                { id: "bflap_50k",   title: "50000 BFLAP",   dropRate: 5  },
                { id: "usd_1000",    title: "$10.00",         dropRate: 6  },
                { id: "free_spin",   title: "Free Spin ×2",  dropRate: 12 },
              ];
              const winSegs  = SEGMENTS.filter(s => !ZONK_IDS.has(s.id));
              const zonkSegs = SEGMENTS.filter(s =>  ZONK_IDS.has(s.id));
              const winTotal  = winSegs.reduce((a, s) => a + s.dropRate, 0);
              const zonkTotal = zonkSegs.reduce((a, s) => a + s.dropRate, 0);
              const grandTotal = winTotal + zonkTotal;
              const zonkBaseChance = ((zonkTotal / grandTotal) * 100).toFixed(1);
              const winBaseChance  = ((winTotal  / grandTotal) * 100).toFixed(1);
              const isPending = lotteryRTPInput !== lotteryRTP;
              const steps = [
                { n:1, color:"#a78bfa", label:"Adaptive RTP (per-user)", desc:`Start with global RTP (${lotteryRTPInput}%). If wallet has won more than spent → reduce effectiveRTP proportionally (min 5% floor). Protects house against lucky streaks.` },
                { n:2, color:"#d5f704", label:"WIN or ZONK?",            desc:`Roll random 0–100. If roll ≤ effectiveRTP → WIN spin. If roll > effectiveRTP → ZONK spin. This is the real RTP gate.` },
                { n:3, color:"#f97316", label:"Anti-Zonk Guard",          desc:`Check last 2 spins for this wallet. If any ZONK found in those 2 → force WIN regardless of step 2. No more than 2 ZONKs in a row.` },
                { n:4, color:"#22c55e", label:"Segment Pick (weighted)",  desc:`Pick one segment from the correct pool (win or zonk) using dropRate weights. Higher dropRate = higher chance of landing on that segment.` },
              ];
              return (
                <div className={`rounded-xl border overflow-hidden transition-colors ${isPending ? "border-[#d5f704]/30 bg-[#d5f704]/[0.02]" : "border-white/10 bg-white/[0.02]"}`}>
                  <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.03] flex items-center gap-2">
                    <Sliders size={14} className="text-white/50" />
                    <h2 className="text-sm font-bold text-white/70">Spin Decision Engine</h2>
                    {isPending
                      ? <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-[#d5f704]/15 border border-[#d5f704]/30 text-[#d5f704] font-bold">preview: {lotteryRTPInput}% (saved: {lotteryRTP}%)</span>
                      : <span className="ml-auto text-[10px] text-white/20">RTP={lotteryRTP}% active</span>
                    }
                  </div>
                  <div className="p-4 space-y-5">

                    {/* 4-step flow */}
                    <div className="grid grid-cols-2 gap-2">
                      {steps.map(st => (
                        <div key={st.n} className="rounded-lg border border-white/[0.06] bg-black/30 p-3 flex gap-3">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0 mt-0.5" style={{ background: st.color + '22', color: st.color, border:`1px solid ${st.color}44` }}>{st.n}</div>
                          <div>
                            <div className="text-[11px] font-bold mb-0.5" style={{ color: st.color }}>{st.label}</div>
                            <div className="text-[10px] text-white/40 leading-relaxed">{st.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* ── WIN / LOSE probability display ─────────────── */}
                    {(() => {
                      const rtp = lotteryRTPInput;
                      const winPct  = rtp;
                      const losePct = 100 - rtp;
                      const isHighRtp = rtp >= 90;
                      const rampStart = isHighRtp ? 110 : 90;   // % of budget where gate opens
                      const rampStop  = isHighRtp ? 150 : 120;  // % of budget where wins cut to 0
                      const gateColor = isHighRtp ? "#22c55e" : "#f97316";
                      const winColor  = winPct >= 70 ? "#22c55e" : winPct >= 50 ? "#d5f704" : "#f97316";
                      return (
                        <div className="space-y-3">
                          {/* Big probability bar */}
                          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-[11px] uppercase tracking-wider text-white/40 font-bold">Spin Outcome Probability</span>
                              <span className="text-[10px] text-white/20">{isPending ? `preview: ${rtp}%` : `active: ${rtp}%`}</span>
                            </div>
                            {/* Bar */}
                            <div className="relative h-9 rounded-lg overflow-hidden bg-red-500/20 border border-white/10 mb-3">
                              <div className="absolute left-0 top-0 h-full rounded-l-lg transition-all duration-500 flex items-center justify-start px-3"
                                style={{ width: `${winPct}%`, background: `linear-gradient(90deg, ${winColor}99, ${winColor}cc)` }}>
                                {winPct >= 20 && <span className="text-xs font-black text-white drop-shadow">{winPct}% WIN</span>}
                              </div>
                              <div className="absolute right-0 top-0 h-full flex items-center justify-end px-3"
                                style={{ width: `${losePct}%` }}>
                                {losePct >= 15 && <span className="text-xs font-black text-red-300 drop-shadow">{losePct}% LOSE</span>}
                              </div>
                            </div>
                            {/* Stat boxes */}
                            <div className="grid grid-cols-3 gap-2">
                              <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2.5 text-center">
                                <div className="text-xl font-black" style={{ color: winColor }}>{winPct}%</div>
                                <div className="text-[10px] text-green-400/60 uppercase tracking-wider mt-0.5">Win chance</div>
                              </div>
                              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2.5 text-center">
                                <div className="text-xl font-black text-red-400">{losePct}%</div>
                                <div className="text-[10px] text-red-400/60 uppercase tracking-wider mt-0.5">Lose chance</div>
                              </div>
                              <div className="rounded-lg bg-white/5 border border-white/10 p-2.5 text-center">
                                <div className="text-xl font-black text-white/70">≤2</div>
                                <div className="text-[10px] text-white/30 uppercase tracking-wider mt-0.5">Max ZONKs row</div>
                              </div>
                            </div>
                          </div>

                          {/* Budget gate thresholds */}
                          <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: gateColor + '33', background: gateColor + '08' }}>
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-2 h-2 rounded-full" style={{ background: gateColor }} />
                              <span className="text-[11px] font-bold" style={{ color: gateColor }}>
                                Budget Gate — {isHighRtp ? 'High RTP Mode (≥90%)' : 'Normal Mode (<90%)'}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-[10px]">
                              <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2">
                                <div className="text-green-400 font-bold mb-0.5">Full Win Rate</div>
                                <div className="text-white/50">budget &lt; {rampStart}%</div>
                                <div className="text-green-300 font-mono mt-0.5">{winPct}% win chance</div>
                              </div>
                              <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-2">
                                <div className="text-yellow-400 font-bold mb-0.5">Ramping Down</div>
                                <div className="text-white/50">{rampStart}% → {rampStop}% budget</div>
                                <div className="text-yellow-300 font-mono mt-0.5">{winPct}% → 0%</div>
                              </div>
                              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2">
                                <div className="text-red-400 font-bold mb-0.5">Wins Paused</div>
                                <div className="text-white/50">budget ≥ {rampStop}%</div>
                                <div className="text-red-300 font-mono mt-0.5">0% win chance</div>
                              </div>
                            </div>
                            <div className="text-[9px] text-white/20 pt-1">
                              Budget = (total paid out ÷ total revenue) ÷ RTP target. High RTP mode gives wider tolerance before cutting wins.
                            </div>
                          </div>

                          {/* Pool counts */}
                          <div className="flex gap-2 text-[10px]">
                            <div className="flex-1 rounded-lg bg-green-500/[0.07] border border-green-500/20 p-2 text-center">
                              <div className="font-black text-green-400">{winSegs.length} prizes</div>
                              <div className="text-white/30">in WIN pool</div>
                            </div>
                            <div className="flex-1 rounded-lg bg-red-500/[0.07] border border-red-500/20 p-2 text-center">
                              <div className="font-black text-red-400">{zonkSegs.length} zonks</div>
                              <div className="text-white/30">in LOSE pool</div>
                            </div>
                            <div className="flex-1 rounded-lg bg-white/5 border border-white/10 p-2 text-center">
                              <div className="font-black text-white/60">{winTotal + zonkTotal}</div>
                              <div className="text-white/30">total weight</div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Segment table */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-green-400/60 mb-2 px-1">WIN Segments — if spin is a WIN</div>
                        <div className="rounded-lg border border-white/[0.06] overflow-hidden">
                          <table className="w-full text-[10px]">
                            <thead><tr className="border-b border-white/5 bg-white/[0.02]">
                              <th className="text-left px-2 py-1.5 text-white/20 font-medium">Prize</th>
                              <th className="text-right px-2 py-1.5 text-white/20 font-medium">In-pool</th>
                              <th className="text-right px-2 py-1.5 text-white/20 font-medium">Overall</th>
                            </tr></thead>
                            <tbody>
                              {winSegs.map(s => {
                                const inPool = (s.dropRate / winTotal) * 100;
                                const overall = (lotteryRTPInput / 100) * inPool;
                                const isBig = s.dropRate <= 6 && !s.id.includes('bnb');
                                return (
                                  <tr key={s.id} className={`border-b border-white/[0.03] hover:bg-white/[0.02] ${isBig ? 'bg-yellow-500/[0.04]' : ''}`}>
                                    <td className={`px-2 py-1.5 font-medium ${isBig ? 'text-yellow-300' : 'text-green-300/80'}`}>{s.title}{isBig ? ' ★' : ''}</td>
                                    <td className="px-2 py-1.5 text-right text-white/40 font-mono">{inPool.toFixed(1)}%</td>
                                    <td className="px-2 py-1.5 text-right font-mono font-bold" style={{ color: isBig ? '#fbbf24' : '#86efac' }}>{overall.toFixed(1)}%</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-1.5 text-[9px] text-white/20 px-1">
                          In-pool = chance among WIN spins only. Overall = per every spin (RTP × in-pool). ★ = big prize.
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-red-400/60 mb-2 px-1">LOSE Segments — if spin is a LOSE</div>
                        <div className="rounded-lg border border-white/[0.06] overflow-hidden">
                          <table className="w-full text-[10px]">
                            <thead><tr className="border-b border-white/5 bg-white/[0.02]">
                              <th className="text-left px-2 py-1.5 text-white/20 font-medium">Segment</th>
                              <th className="text-right px-2 py-1.5 text-white/20 font-medium">In-pool</th>
                              <th className="text-right px-2 py-1.5 text-white/20 font-medium">Overall</th>
                            </tr></thead>
                            <tbody>
                              {zonkSegs.map(s => {
                                const inPool = (s.dropRate / zonkTotal) * 100;
                                const overall = ((100 - lotteryRTPInput) / 100) * inPool;
                                return (
                                  <tr key={s.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                                    <td className="px-2 py-1.5 text-red-300/80">{s.title}</td>
                                    <td className="px-2 py-1.5 text-right text-white/40 font-mono">{inPool.toFixed(1)}%</td>
                                    <td className="px-2 py-1.5 text-right text-red-400/70 font-mono font-bold">{overall.toFixed(1)}%</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-2 text-[10px] text-white/20 px-1 space-y-0.5">
                          <div>• Anti-zonk: max 2 ZONKs in a row, then forced WIN</div>
                          <div>• Budget gate: cuts WIN% when payout &gt; target</div>
                          <div>• Overall % = chance per any spin at current RTP</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="rounded-xl border border-[#5b31fe]/30 bg-[#5b31fe]/[0.05] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#5b31fe]/20 bg-[#5b31fe]/[0.08] flex items-center gap-2">
                <Save size={14} className="text-[#a78bfa]" />
                <h2 className="text-sm font-bold text-[#a78bfa]">Add Spins to Wallet</h2>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1 block">Wallet Address</label>
                  <input
                    type="text"
                    value={addSpinsWallet}
                    onChange={e => { setAddSpinsWallet(e.target.value); setAddSpinsResult(null); }}
                    placeholder="0x..."
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#5b31fe]/50 font-mono"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1 block">Tier</label>
                    <div className="flex gap-1.5">
                      {(["049","099","150"] as const).map(tk => (
                        <button
                          key={tk}
                          onClick={() => setAddSpinsTier(tk)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${addSpinsTier === tk ? "bg-[#5b31fe] text-white" : "bg-white/5 text-white/40 hover:bg-white/10"}`}
                        >
                          {tk === "049" ? "$0.49" : tk === "150" ? "$1.50" : "$0.99"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="w-28">
                    <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1 block">Quantity</label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={addSpinsQty}
                      onChange={e => setAddSpinsQty(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#5b31fe]/50 font-mono"
                    />
                  </div>
                </div>
                {addSpinsResult && (
                  <div className={`text-xs px-3 py-2 rounded-lg font-mono ${addSpinsResult.ok ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                    {addSpinsResult.msg}
                  </div>
                )}
                <button
                  onClick={handleAddSpins}
                  disabled={addSpinsLoading || !addSpinsWallet.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm bg-[#5b31fe] hover:bg-[#5b31fe]/80 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {addSpinsLoading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {addSpinsLoading ? "Adding..." : `Add ${addSpinsQty} Spin${addSpinsQty > 1 ? "s" : ""}`}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.03] flex items-center gap-2">
                <Users size={14} className="text-emerald-400" />
                <h2 className="text-sm font-bold text-emerald-400">Bulk Add Spins</h2>
                <span className="text-[10px] text-white/30 ml-1">paste up to 100 wallets</span>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1 block">Wallet Addresses (one per line or comma separated)</label>
                  <textarea
                    value={bulkWallets}
                    onChange={e => { setBulkWallets(e.target.value); setBulkResult(null); }}
                    placeholder={"0x...\n0x...\n0x..."}
                    rows={5}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-emerald-500/50 font-mono resize-none"
                  />
                  <div className="text-[10px] text-white/30 mt-1">
                    {bulkWallets.split(/[\n,]+/).map(w => w.trim()).filter(w => w.startsWith('0x') && w.length === 42).length} valid wallets detected
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1 block">Tier</label>
                    <div className="flex gap-1.5">
                      {(["049","099","150"] as const).map(tk => (
                        <button key={tk} onClick={() => setBulkTier(tk)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${bulkTier === tk ? "bg-emerald-600 text-white" : "bg-white/5 text-white/40 hover:bg-white/10"}`}>
                          {tk === "049" ? "$0.49" : tk === "150" ? "$1.50" : "$0.99"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="w-28">
                    <label className="text-[10px] uppercase tracking-wider text-white/30 mb-1 block">Qty / wallet</label>
                    <input type="number" min={1} max={500} value={bulkQty}
                      onChange={e => setBulkQty(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50 font-mono" />
                  </div>
                </div>
                {bulkResult && (
                  <div className={`text-xs px-3 py-2 rounded-lg font-mono ${bulkResult.ok ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                    {bulkResult.msg}
                  </div>
                )}
                <button onClick={handleBulkAddSpins}
                  disabled={bulkLoading || !bulkWallets.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {bulkLoading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {bulkLoading ? "Adding..." : `Bulk Add ${bulkQty} Spin${bulkQty > 1 ? "s" : ""} to All`}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/10 bg-white/[0.03] flex items-center gap-2 flex-wrap">
                <Users size={14} className="text-[#8b5cf6]" />
                <h2 className="text-sm font-bold text-[#8b5cf6]">Lottery Players ({lotteryUsers.length})</h2>
                <div className="ml-auto flex items-center gap-2 text-[10px]">
                  {liveBnbPrice > 0 && <span className="px-2 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 font-mono">BNB ${liveBnbPrice.toFixed(0)}</span>}
                  {liveBflapPrice > 0 && <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400 font-mono">BFLAP ${liveBflapPrice.toFixed(6)}</span>}
                  {liveBnbPrice === 0 && liveBflapPrice === 0 && <span className="text-white/20">prices loading...</span>}
                  <button
                    onClick={loadLotteryData}
                    disabled={lotteryLoading}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-[#8b5cf6]/15 border border-[#8b5cf6]/25 text-[#8b5cf6] hover:bg-[#8b5cf6]/25 transition-colors disabled:opacity-40"
                  >
                    <RefreshCw size={10} className={lotteryLoading ? "animate-spin" : ""} />
                    Refresh
                  </button>
                </div>
              </div>

              {/* Platform Cashflow Summary */}
              {!lotteryLoading && platformPnl && (() => {
                const dep   = platformPnl.totalDeposits    as number;
                const won   = platformPnl.totalWonInUsd    as number;
                const wd    = platformPnl.totalWdInUsd     as number;
                const pnl   = platformPnl.platformPnl      as number;   // deposits - won (accrued)
                const cash  = platformPnl.platformCashPnl  as number;   // deposits - withdrawn (actual cash out)
                const pnlPos   = pnl  >= 0;
                const cashPos  = cash >= 0;
                return (
                  <div className="px-4 py-3 border-b border-white/10 bg-black/30">
                    <div className="text-[9px] uppercase tracking-widest text-white/30 mb-2 font-semibold">Platform Cashflow</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2.5 flex flex-col gap-0.5">
                        <span className="text-[9px] uppercase tracking-wider text-white/30">Total Deposits</span>
                        <span className="text-base font-bold font-mono text-[#f5a623]">${dep.toFixed(2)}</span>
                        <span className="text-[9px] text-white/20">All player buys</span>
                      </div>
                      <div className="rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2.5 flex flex-col gap-0.5">
                        <span className="text-[9px] uppercase tracking-wider text-white/30">Total Won (accrued)</span>
                        <span className="text-base font-bold font-mono text-red-300">${won.toFixed(2)}</span>
                        <span className="text-[9px] text-white/20">All prizes accumulated</span>
                      </div>
                      <div className="rounded-lg bg-white/[0.03] border border-white/10 px-3 py-2.5 flex flex-col gap-0.5">
                        <span className="text-[9px] uppercase tracking-wider text-white/30">Total Withdrawn</span>
                        <span className="text-base font-bold font-mono text-cyan-300">${wd.toFixed(2)}</span>
                        <span className="text-[9px] text-white/20">Actual cash out</span>
                      </div>
                      <div className={`rounded-lg border px-3 py-2.5 flex flex-col gap-0.5 ${pnlPos ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"}`}>
                        <span className="text-[9px] uppercase tracking-wider text-white/30">Our P&amp;L (accrued)</span>
                        <span className={`text-base font-bold font-mono ${pnlPos ? "text-green-400" : "text-red-400"}`}>
                          {pnlPos ? "+" : ""}${pnl.toFixed(2)}
                        </span>
                        <span className="text-[9px] text-white/20">Deposits − Total Won</span>
                      </div>
                    </div>
                    <div className={`mt-2 rounded-lg border px-3 py-2 flex items-center justify-between ${cashPos ? "bg-green-500/[0.07] border-green-500/20" : "bg-red-500/[0.07] border-red-500/20"}`}>
                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-white/30">Real Cash P&amp;L&nbsp;</span>
                        <span className="text-[9px] text-white/20">(Deposits − Withdrawn = actual money in pocket)</span>
                      </div>
                      <span className={`text-xl font-black font-mono ${cashPos ? "text-green-400" : "text-red-400"}`}>
                        {cashPos ? "+" : ""}${cash.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Unused spins summary by tier */}
              {!lotteryLoading && lotteryUsers.length > 0 && (() => {
                const tot049 = lotteryUsers.reduce((s, u) => s + parseInt(u.spins_left_049 || 0), 0);
                const tot099 = lotteryUsers.reduce((s, u) => s + parseInt(u.spins_left_099 || 0), 0);
                const tot150 = lotteryUsers.reduce((s, u) => s + parseInt(u.spins_left_150 || 0), 0);
                const total  = tot049 + tot099 + tot150;
                return (
                  <div className="px-4 py-3 border-b border-white/5 bg-black/20 flex flex-wrap gap-3 items-center">
                    <span className="text-[10px] uppercase tracking-wider text-white/30 mr-1">Unused spins:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-1 rounded-lg bg-blue-500/15 border border-blue-500/20 text-blue-300 text-xs font-bold font-mono">$0.49 — {tot049}</span>
                      <span className="px-2 py-1 rounded-lg bg-purple-500/15 border border-purple-500/20 text-purple-300 text-xs font-bold font-mono">$0.99 — {tot099}</span>
                      <span className="px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/20 text-amber-300 text-xs font-bold font-mono">$1.50 — {tot150}</span>
                      <span className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs font-bold font-mono">Total — {total}</span>
                    </div>
                  </div>
                );
              })()}

              {lotteryLoading ? (
                <div className="p-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[#5b31fe]" /></div>
              ) : lotteryUsers.length === 0 ? (
                <div className="p-6 text-center text-white/30 text-sm">No players yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left px-3 py-2 text-[10px] text-white/30 uppercase tracking-wider font-medium whitespace-nowrap">Wallet</th>
                        <th className="text-left px-3 py-2 text-[10px] text-white/30 uppercase tracking-wider font-medium whitespace-nowrap">Deposited</th>
                        <th className="text-left px-3 py-2 text-[10px] text-white/30 uppercase tracking-wider font-medium whitespace-nowrap">Purchased (by tier)</th>
                        <th className="text-left px-3 py-2 text-[10px] text-white/30 uppercase tracking-wider font-medium whitespace-nowrap">Left (unused)</th>
                        <th className="text-left px-3 py-2 text-[10px] text-white/30 uppercase tracking-wider font-medium whitespace-nowrap">Won ($)</th>
                        <th className="text-left px-3 py-2 text-[10px] text-white/30 uppercase tracking-wider font-medium whitespace-nowrap">Won (BFLAP)</th>
                        <th className="text-left px-3 py-2 text-[10px] text-white/30 uppercase tracking-wider font-medium whitespace-nowrap">Won (BNB)</th>
                        <th className="text-left px-3 py-2 text-[10px] text-[#d5f704]/70 uppercase tracking-wider font-medium whitespace-nowrap">Total Win ($)</th>
                        <th className="text-left px-3 py-2 text-[10px] text-cyan-400/70 uppercase tracking-wider font-medium whitespace-nowrap">Withdrawn $</th>
                        <th className="text-left px-3 py-2 text-[10px] text-cyan-400/70 uppercase tracking-wider font-medium whitespace-nowrap">Withdrawn BFLAP</th>
                        <th className="text-left px-3 py-2 text-[10px] text-cyan-400/70 uppercase tracking-wider font-medium whitespace-nowrap">Withdrawn BNB</th>
                        <th className="text-left px-3 py-2 text-[10px] text-emerald-400/80 uppercase tracking-wider font-medium whitespace-nowrap">Available</th>
                        <th className="text-left px-3 py-2 text-[10px] text-white/30 uppercase tracking-wider font-medium whitespace-nowrap">Our P&amp;L</th>
                        <th className="text-left px-3 py-2 text-[10px] text-white/30 uppercase tracking-wider font-medium whitespace-nowrap">Last Active</th>
                        <th className="text-left px-3 py-2 text-[10px] text-red-400/70 uppercase tracking-wider font-medium whitespace-nowrap">WD</th>
                        <th className="text-left px-3 py-2 text-[10px] text-orange-400/70 uppercase tracking-wider font-medium whitespace-nowrap">Deposit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lotteryUsers.slice((playersPage - 1) * PLAYERS_PER_PAGE, playersPage * PLAYERS_PER_PAGE).map((u, i) => {
                        const deposited      = parseFloat(u.total_spent_usd || 0);
                        const wonUsd         = parseFloat(u.total_won_usd || 0);
                        const wonBnb         = parseFloat(u.total_bnb_won || 0);
                        const wonBflap       = parseInt(u.total_bflap_won || 0);
                        const bnbUsdVal      = wonBnb   * (liveBnbPrice   || 0);
                        const bflapUsdVal    = wonBflap * (liveBflapPrice || 0);
                        const totalWinUsd    = wonUsd + bnbUsdVal + bflapUsdVal;
                        const withdrawnUsdt  = parseFloat(u.withdrawn_usdt || 0);
                        const withdrawnBflap = parseInt(u.withdrawn_bflap || 0);
                        const withdrawnBnb   = parseFloat(u.withdrawn_bnb || 0);
                        const availUsdt      = Math.max(0, wonUsd - withdrawnUsdt);
                        const availBflap     = Math.max(0, wonBflap - withdrawnBflap);
                        const availBnb       = Math.max(0, wonBnb - withdrawnBnb);
                        const availUsd       = availUsdt + availBflap * (liveBflapPrice || 0) + availBnb * (liveBnbPrice || 0);
                        const pnl            = deposited - totalWinUsd; // platform view: +green=we won, -red=we lost
                        const b049 = parseInt(u.bought_049 || 0);
                        const b099 = parseInt(u.bought_099 || 0);
                        const b150 = parseInt(u.bought_150 || 0);
                        const l049 = parseInt(u.spins_left_049 || 0);
                        const l099 = parseInt(u.spins_left_099 || 0);
                        const l150 = parseInt(u.spins_left_150 || 0);
                        const totalLeft   = parseInt(u.total_spins_left || 0);
                        const totalBought = parseInt(u.total_spins_bought || 0);
                        return (
                          <tr key={i} className={`border-b border-white/[0.03] hover:bg-white/[0.02] ${(u.wd_banned || u.deposit_banned) ? "bg-red-500/5" : ""}`}>
                            <td className="px-3 py-2.5 font-mono text-white/70">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {u.wallet_address ? u.wallet_address.slice(0, 6) + "..." + u.wallet_address.slice(-4) : "—"}
                                {u.wd_banned && <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-red-500/20 text-red-400 border border-red-500/20">WD OFF</span>}
                                {u.deposit_banned && <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/20">DEP OFF</span>}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-[#f5a623] font-mono">${deposited.toFixed(2)}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-white/60 font-mono font-bold">{totalBought} total</span>
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {b049 > 0 && <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[9px] font-bold">$0.49 ×{b049}</span>}
                                  {b099 > 0 && <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[9px] font-bold">$0.99 ×{b099}</span>}
                                  {b150 > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">$1.50 ×{b150}</span>}
                                  {totalBought === 0 && <span className="text-white/20 text-[9px]">—</span>}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-col gap-0.5">
                                <span className={`font-mono font-bold text-[11px] ${totalLeft > 0 ? "text-green-400" : "text-white/20"}`}>{totalLeft} left</span>
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {l049 > 0 && <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 text-[9px] font-bold">$0.49 ×{l049}</span>}
                                  {l099 > 0 && <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 text-[9px] font-bold">$0.99 ×{l099}</span>}
                                  {l150 > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[9px] font-bold">$1.50 ×{l150}</span>}
                                  {totalLeft === 0 && <span className="text-white/20 text-[9px]">none</span>}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-green-400 font-mono">${wonUsd.toFixed(4)}</td>
                            <td className="px-3 py-2.5 font-mono">
                              <div className="text-purple-400">{wonBflap.toLocaleString()}</div>
                              {bflapUsdVal > 0 && <div className="text-[9px] text-purple-400/50">≈${bflapUsdVal.toFixed(2)}</div>}
                            </td>
                            <td className="px-3 py-2.5 font-mono">
                              <div className="text-yellow-400">{wonBnb.toFixed(4)}</div>
                              {bnbUsdVal > 0 && <div className="text-[9px] text-yellow-400/50">≈${bnbUsdVal.toFixed(2)}</div>}
                            </td>
                            <td className="px-3 py-2.5 font-mono font-bold text-[#d5f704]">
                              ${totalWinUsd.toFixed(2)}
                              <div className="text-[9px] font-normal text-white/20 leading-none mt-0.5">
                                {wonUsd > 0 && `$${wonUsd.toFixed(2)} USD`}
                                {bnbUsdVal > 0 && ` + $${bnbUsdVal.toFixed(2)} BNB`}
                                {bflapUsdVal > 0 && ` + $${bflapUsdVal.toFixed(2)} BFLAP`}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-cyan-400">
                              {withdrawnUsdt > 0 ? `$${withdrawnUsdt.toFixed(2)}` : <span className="text-white/20">—</span>}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-cyan-400">
                              {withdrawnBflap > 0 ? withdrawnBflap.toLocaleString() : <span className="text-white/20">—</span>}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-cyan-400">
                              {withdrawnBnb > 0 ? withdrawnBnb.toFixed(4) : <span className="text-white/20">—</span>}
                            </td>
                            <td className="px-3 py-2.5 font-mono font-bold text-emerald-400">
                              {availUsd > 0 ? `$${availUsd.toFixed(2)}` : <span className="text-white/20">—</span>}
                            </td>
                            <td className={`px-3 py-2.5 font-mono font-bold ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                            </td>
                            <td className="px-3 py-2.5 text-white/30 whitespace-nowrap">
                              {u.last_active ? new Date(u.last_active).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                            </td>
                            <td className="px-3 py-2.5">
                              <button
                                onClick={() => u.wallet_address && handleToggleBan(u.wallet_address, "wd_banned", !!u.wd_banned)}
                                disabled={banningWallet === u.wallet_address + "wd_banned"}
                                title={u.wd_banned ? "Click to enable withdrawals" : "Click to disable withdrawals"}
                                className={`px-2 py-1 rounded text-[10px] font-bold transition-colors whitespace-nowrap ${
                                  u.wd_banned
                                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                    : "bg-white/5 text-white/20 border border-white/10 hover:bg-red-500/20 hover:text-red-400"
                                }`}
                              >
                                {banningWallet === u.wallet_address + "wd_banned" ? "…" : u.wd_banned ? "OFF" : "ON"}
                              </button>
                            </td>
                            <td className="px-3 py-2.5">
                              <button
                                onClick={() => u.wallet_address && handleToggleBan(u.wallet_address, "deposit_banned", !!u.deposit_banned)}
                                disabled={banningWallet === u.wallet_address + "deposit_banned"}
                                title={u.deposit_banned ? "Click to enable deposits" : "Click to disable deposits"}
                                className={`px-2 py-1 rounded text-[10px] font-bold transition-colors whitespace-nowrap ${
                                  u.deposit_banned
                                    ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                                    : "bg-white/5 text-white/20 border border-white/10 hover:bg-orange-500/20 hover:text-orange-400"
                                }`}
                              >
                                {banningWallet === u.wallet_address + "deposit_banned" ? "…" : u.deposit_banned ? "OFF" : "ON"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {!lotteryLoading && lotteryUsers.length > PLAYERS_PER_PAGE && (() => {
                const totalPages = Math.ceil(lotteryUsers.length / PLAYERS_PER_PAGE);
                return (
                  <div className="px-4 py-3 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[10px] text-white/30">
                      Page {playersPage} of {totalPages} &nbsp;·&nbsp; {lotteryUsers.length} players
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPlayersPage(1)}
                        disabled={playersPage === 1}
                        className="px-2 py-1 rounded text-[10px] bg-white/5 border border-white/10 text-white/50 disabled:opacity-30 hover:bg-white/10 transition-colors"
                      >«</button>
                      <button
                        onClick={() => setPlayersPage(p => Math.max(1, p - 1))}
                        disabled={playersPage === 1}
                        className="px-2 py-1 rounded text-[10px] bg-white/5 border border-white/10 text-white/50 disabled:opacity-30 hover:bg-white/10 transition-colors"
                      >‹</button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(pg => (
                        <button
                          key={pg}
                          onClick={() => setPlayersPage(pg)}
                          className={`px-2 py-1 rounded text-[10px] border transition-colors ${pg === playersPage ? "bg-[#8b5cf6]/20 border-[#8b5cf6]/40 text-[#8b5cf6] font-bold" : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"}`}
                        >{pg}</button>
                      ))}
                      <button
                        onClick={() => setPlayersPage(p => Math.min(totalPages, p + 1))}
                        disabled={playersPage === totalPages}
                        className="px-2 py-1 rounded text-[10px] bg-white/5 border border-white/10 text-white/50 disabled:opacity-30 hover:bg-white/10 transition-colors"
                      >›</button>
                      <button
                        onClick={() => setPlayersPage(totalPages)}
                        disabled={playersPage === totalPages}
                        className="px-2 py-1 rounded text-[10px] bg-white/5 border border-white/10 text-white/50 disabled:opacity-30 hover:bg-white/10 transition-colors"
                      >»</button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {currentTab === "partners" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#00c9a7]/30 bg-[#00c9a7]/[0.04] overflow-hidden">
              <div className="px-5 py-4 border-b border-[#00c9a7]/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe size={16} className="text-[#00c9a7]" />
                  <span className="text-sm font-bold text-[#00c9a7]">Partner Tokens ({partnerList.length})</span>
                </div>
                <button onClick={loadPartnerList} disabled={partnerLoading} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors disabled:opacity-40">
                  <RefreshCw size={12} className={partnerLoading ? "animate-spin" : ""} />
                  Refresh
                </button>
              </div>
              <div className="p-5 space-y-4">
                {partnerLoading && (
                  <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-[#00c9a7]" /></div>
                )}
                {!partnerLoading && partnerList.length === 0 && (
                  <div className="text-sm text-white/30 text-center py-4">No partner tokens added yet</div>
                )}
                {partnerList.length > 0 && (
                  <div className="space-y-2">
                    {partnerList.map((p, i) => (
                      <div key={p.address} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-black/30 border border-white/[0.07]">
                        <div className="w-7 h-7 rounded-full bg-[#00c9a7]/20 border border-[#00c9a7]/30 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-[#00c9a7]">{i + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-[#00c9a7] truncate">{p.name || "Unnamed"}</div>
                          <div className="text-[11px] font-mono text-white/40 truncate">{p.address}</div>
                          {p.created_at && (
                            <div className="text-[10px] text-white/20 mt-0.5">
                              Added {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemovePartner(p.address)}
                          disabled={partnerDeleteLoading === p.address}
                          className="flex-shrink-0 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40"
                        >
                          {partnerDeleteLoading === p.address ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new partner */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                  <div className="text-xs font-bold text-white/50 uppercase tracking-wider">Add Partner Token</div>
                  <input
                    type="text"
                    value={newPartnerCA}
                    onChange={e => { setNewPartnerCA(e.target.value); setPartnerAddResult(null); }}
                    placeholder="Contract address (0x...)"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#00c9a7]/50 font-mono"
                  />
                  <input
                    type="text"
                    value={newPartnerName}
                    onChange={e => { setNewPartnerName(e.target.value); setPartnerAddResult(null); }}
                    placeholder="Display name (e.g. FlapVault)"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#00c9a7]/50"
                  />
                  {partnerAddResult && (
                    <div className={`text-sm px-3 py-2.5 rounded-lg font-mono ${partnerAddResult.ok ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                      {partnerAddResult.msg}
                    </div>
                  )}
                  <button
                    onClick={handleAddPartner}
                    disabled={partnerAddLoading || !newPartnerCA.trim()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm bg-[#00c9a7] hover:bg-[#00c9a7]/80 text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {partnerAddLoading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                    {partnerAddLoading ? "Adding..." : "Add Partner Token"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentTab === "system" && (
          <div className="space-y-6">

            {/* Page Visibility */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[#d5f704]" />
                  <span className="text-sm font-bold text-white">Page Visibility</span>
                </div>
                <button onClick={loadSystemData} className="text-white/30 hover:text-white/60 transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
              </div>
              {pagesLoading ? (
                <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[#d5f704]" /></div>
              ) : (
                <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {pages.map(p => (
                    <div key={p.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                      <span className="text-sm font-medium text-white capitalize">{p.id}</span>
                      <button
                        onClick={() => togglePage(p.id, !p.visible)}
                        disabled={pageToggling === p.id}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${p.visible ? "bg-[#d5f704]" : "bg-white/10"}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-black transition-transform ${p.visible ? "translate-x-4" : "translate-x-1"}`} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Server Health */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-bold text-white">Server Health</span>
                  {health?.alert && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">{health.alert}</span>}
                </div>
                <button onClick={loadSystemData} className="text-white/30 hover:text-white/60 transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
              </div>
              {healthLoading ? (
                <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-green-400" /></div>
              ) : health ? (
                <>
                <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Uptime", value: health.uptime_human, color: "#d5f704" },
                    { label: "Req/min", value: health.req_per_min, color: health.req_per_min > 100 ? "#f87171" : "#4ade80" },
                    { label: "Req/5min", value: health.req_per_5min, color: "#94a3b8" },
                    { label: "Total Reqs", value: health.total_requests?.toLocaleString(), color: "#94a3b8" },
                    { label: "RAM", value: `${health.memory_mb} MB`, color: health.memory_mb > 400 ? "#f87171" : "#4ade80" },
                    { label: "Heap", value: `${health.heap_mb} MB`, color: "#94a3b8" },
                    { label: "Load 1m", value: health.load_1m, color: parseFloat(health.load_1m) > 2 ? "#f87171" : "#4ade80" },
                    { label: "CPU Cores", value: health.cpu_cores, color: "#94a3b8" },
                    { label: "Node", value: health.node_version, color: "#94a3b8" },
                    { label: "DB", value: health.db_ok ? "OK" : "ERROR", color: health.db_ok ? "#4ade80" : "#f87171" },
                  ].map((item, i) => (
                    <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                      <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1">{item.label}</div>
                      <div className="text-lg font-bold font-mono" style={{ color: item.color }}>{item.value}</div>
                    </div>
                  ))}
                  <div
                    className="rounded-xl border border-white/10 bg-white/[0.02] p-3 cursor-pointer hover:bg-white/[0.05] transition-colors"
                    onClick={() => setShowErrorLog(v => !v)}
                    title="Click to see error details"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1 flex items-center gap-1">
                      Errors <span className="text-white/20">{showErrorLog ? "▲" : "▼"}</span>
                    </div>
                    <div className="text-lg font-bold font-mono" style={{ color: health.total_errors > 0 ? "#f87171" : "#4ade80" }}>{health.total_errors}</div>
                  </div>
                </div>
                {showErrorLog && (
                  <div className="px-4 pb-4">
                    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                      <div className="text-[10px] uppercase tracking-wider text-white/30 mb-2">Recent HTTP 500 Errors (last 30)</div>
                      {(!health.recent_errors || health.recent_errors.length === 0) ? (
                        <div className="text-xs text-green-400 font-mono">No errors recorded since last restart</div>
                      ) : (
                        <div className="space-y-1 max-h-64 overflow-y-auto">
                          {health.recent_errors.map((e, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs font-mono text-white/70 border-b border-white/5 pb-1">
                              <span className="text-red-400 font-bold">{e.status}</span>
                              <span className="text-yellow-400">{e.method}</span>
                              <span className="text-white/50 truncate flex-1">{e.url}</span>
                              <span className="text-white/30 whitespace-nowrap">{new Date(e.time).toLocaleTimeString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                </>
              ) : (
                <div className="p-6 text-center text-white/30 text-sm">No health data available</div>
              )}
            </div>

            {/* OpenRouter Keys */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-bold text-white">OpenRouter Keys</span>
                </div>
                <button onClick={loadSystemData} className="text-white/30 hover:text-white/60 transition-colors"><RefreshCw className="w-3.5 h-3.5" /></button>
              </div>
              <div className="p-4 space-y-3">
                {orKeysLoading ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-purple-400" /></div>
                ) : orKeys.length === 0 ? (
                  <div className="text-center text-white/30 text-sm py-2">No API keys stored yet</div>
                ) : (
                  <div className="space-y-2">
                    {orKeys.map(k => (
                      <div key={k.id} className={`flex items-center justify-between rounded-xl px-4 py-3 border ${k.active ? "border-purple-500/40 bg-purple-500/10" : "border-white/10 bg-white/[0.02]"}`}>
                        <div className="flex items-center gap-3">
                          {k.active && <Shield className="w-3.5 h-3.5 text-purple-400" />}
                          <span className="font-mono text-sm text-white/70">{k.masked}</span>
                          {k.active && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">ACTIVE</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {!k.active && (
                            <button
                              onClick={() => activateOrKey(k.id)}
                              disabled={orKeyActivating === k.id}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                            >
                              {orKeyActivating === k.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Set Active"}
                            </button>
                          )}
                          <button
                            onClick={() => deleteOrKey(k.id)}
                            disabled={orKeyDeleting === k.id}
                            className="px-2 py-1 rounded-lg text-[11px] bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                          >
                            {orKeyDeleting === k.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                  <div className="text-xs font-bold text-white/50 uppercase tracking-wider">Add New Key</div>
                  <input
                    type="password"
                    placeholder="sk-or-... (OpenRouter API key)"
                    value={newOrKey}
                    onChange={e => setNewOrKey(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/40"
                  />
                  <input
                    type="text"
                    placeholder="Label (optional, e.g. 'Main key')"
                    value={newOrLabel}
                    onChange={e => setNewOrLabel(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-purple-500/40"
                  />
                  <button
                    onClick={addOrKey}
                    disabled={orKeyAdding || !newOrKey.trim()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition-colors disabled:opacity-50"
                  >
                    {orKeyAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Add Key
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>
      <div className="h-16" />
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-[10px] uppercase tracking-wider text-white/30 mb-1">{label}</div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
