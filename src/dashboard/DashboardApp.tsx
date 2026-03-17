import { useState, useEffect, useRef } from "react";
import {
  Menu, X, Sparkles, Flame, Clock, BadgeDollarSign,
  ArrowLeftRight, Coins, Ticket, Bot, BookOpen, Trophy,
  FileText, Handshake, ChevronRight, Send, Github, Mail, Copy, Check
} from "lucide-react";
import type { DashSection } from "./types";
import type { PageView } from "../components/Header";

import GridBackground from "./GridBackground";
import BubblingCA from "../components/BubblingCA";
import DashRecentBonding from "./sections/RecentBonding";
import DashNewTokens from "./sections/NewTokens";
import DashBonding from "./sections/Bonding";
import DashDexPaid from "./sections/DexPaid";
import DashPartner from "./sections/Partner";
import DashInfoPage from "./sections/InfoPage";

interface DashboardAppProps {
  onNavigate: (page: PageView) => void;
}

interface NavItem {
  id: DashSection;
  label: string;
  icon: React.ReactNode;
  dividerBefore?: boolean;
}

const BFLAP_CA = "0xa2320fff1069ED5b4B02dDb386823E837A7e7777";

const NAV_ITEMS: NavItem[] = [
  { id: "newtokens",     label: "NEW",            icon: <Sparkles size={14} /> },
  { id: "bonding",       label: "Bonding",        icon: <Flame size={14} />, dividerBefore: true },
  { id: "dexpaid",       label: "Dex Paid",       icon: <BadgeDollarSign size={14} /> },
  { id: "partner",       label: "Partner",        icon: <Handshake size={14} /> },
  { id: "bswap",         label: "BSwap",          icon: <ArrowLeftRight size={14} />, dividerBefore: true },
  { id: "tokenomics",    label: "Tokenomics",     icon: <Coins size={14} /> },
  { id: "lottery",       label: "Lottery",        icon: <Ticket size={14} /> },
  { id: "staking",       label: "Staking",        icon: <Coins size={14} /> },
  { id: "volumebot",     label: "Volume Bot",     icon: <Bot size={14} />, dividerBefore: true },
  { id: "telegrambot",   label: "Telegram Bot",   icon: <BookOpen size={14} /> },
  { id: "kolsrank",      label: "KOLs Rank",      icon: <Trophy size={14} /> },
  { id: "whitepaper",    label: "Whitepaper",     icon: <FileText size={14} /> },
];

const SECTION_LABELS: Record<DashSection, string> = {
  home: "Dashboard", newtokens: "NEW", recentbonding: "Recent Bonding",
  bonding: "Bonding (Latest)", dexpaid: "Dex Paid", partner: "Partner",
  bswap: "BSwap", tokenomics: "Tokenomics", lottery: "Lottery",
  staking: "Staking", volumebot: "Volume Bot", telegrambot: "Telegram Bot",
  kolsrank: "KOLs Rank", whitepaper: "Whitepaper",
};

function SectionContent({ section, onNavigate }: { section: DashSection; onNavigate: (page: PageView) => void }) {
  switch (section) {
    case "newtokens":     return <DashNewTokens />;
    case "recentbonding": return <DashRecentBonding />;
    case "bonding":       return <DashBonding />;
    case "dexpaid":       return <DashDexPaid />;
    case "partner":       return <DashPartner />;
    case "bswap":       return <DashInfoPage icon="↔️" title="BSwap" description="Swap any BSC token directly with the Bubble Flap DEX aggregator. Best rates across PancakeSwap and other BSC DEXes." features={["Best price routing", "Slippage protection", "BFLAP, BNB, and all BSC tokens", "Fast execution"]} onNavigate={onNavigate} target="bflapswap" accentColor="#3b82f6" />;
    case "tokenomics":  return <DashInfoPage icon="🪙" title="Tokenomics" description="BFLAP token supply, distribution, and economic model." features={["Total supply breakdown", "Team & treasury allocation", "Staking rewards schedule", "Burn mechanics"]} onNavigate={onNavigate} target="tokenomics" accentColor="#6366f1" />;
    case "lottery":     return <DashInfoPage icon="🎫" title="Lottery" description="Spin the Bubble Flap wheel and win BNB, USDT or BFLAP prizes." features={["BNB / USDT / BFLAP prizes", "Jackpot pool", "Transparent on-chain results", "Multiple ticket tiers"]} onNavigate={onNavigate} target="lottery" accentColor="#ec4899" />;
    case "staking":     return <DashInfoPage icon="🥩" title="Staking" description="Stake your BFLAP tokens to earn passive rewards." features={["Passive BFLAP rewards", "Flexible lock periods", "Compounding options", "Boosted lottery tickets"]} onNavigate={onNavigate} target="staking" accentColor="#14b8a6" />;
    case "volumebot":   return <DashInfoPage icon="🤖" title="Volume Bot" description="Automated volume generation tool for your Flap.sh token." features={["Customizable volume targets", "Multi-wallet support", "Safe & undetectable patterns", "Real-time monitoring"]} onNavigate={onNavigate} target="volumebot" accentColor="#64748b" />;
    case "telegrambot": return <DashInfoPage icon="📱" title="Telegram Bot" description="Trade, snipe, set alerts and manage wallets via @BubbleFlapBot." features={["Buy / Sell on Flap.sh", "Sniper bot", "Price alerts", "Multi-wallet", "8 languages"]} onNavigate={onNavigate} target="telegrambot" accentColor="#0ea5e9" />;
    case "kolsrank":    return <DashInfoPage icon="🏆" title="KOLs Rank" description="Leaderboard of top crypto influencers and traders." features={["Real-time ranking", "Performance metrics", "Trading stats", "Weekly updates"]} onNavigate={onNavigate} target="kolsrank" accentColor="#eab308" />;
    case "whitepaper":  return <DashInfoPage icon="📄" title="Whitepaper" description="Full Bubble Flap project documentation." features={["Project vision", "Tokenomics details", "Roadmap", "Technical architecture"]} onNavigate={onNavigate} target="whitepaper" accentColor="#6b7280" />;
    default:            return <DashNewTokens />;
  }
}

function DashHeader({ onNavigate }: {
  onNavigate: (page: PageView) => void;
}) {
  const [settings, setSettings] = useState<{ telegram?: string; twitter?: string; github?: string; email?: string; ca_address?: string }>({});
  const [copied, setCopied] = useState(false);
  const logoRef = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(d => setSettings(d)).catch(() => {});
  }, []);

  useEffect(() => {
    const el = logoRef.current;
    if (!el) return;
    const COLORS = ["rgba(213,247,4,0.6)", "rgba(91,49,254,0.5)", "rgba(122,51,250,0.5)", "rgba(207,183,243,0.4)"];
    const interval = setInterval(() => {
      const size = [3, 4, 5, 6][Math.floor(Math.random() * 4)];
      const left = Math.floor(Math.random() * Math.max(el.offsetWidth - size, 10));
      const bubble = document.createElement("div");
      bubble.style.cssText = `position:absolute;border-radius:100%;bottom:2px;left:${left}px;width:${size}px;height:${size}px;background-color:${COLORS[Math.floor(Math.random() * COLORS.length)]};z-index:5;pointer-events:none;`;
      bubble.className = "bubble-rise";
      el.appendChild(bubble);
      setTimeout(() => bubble.remove(), 3100);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const copyCA = () => {
    const ca = settings.ca_address || BFLAP_CA;
    navigator.clipboard.writeText(ca).catch(() => {});
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const ca = settings.ca_address || BFLAP_CA;
  const shortCA = `${ca.slice(0, 6)}...${ca.slice(-4)}`;

  return (
    <header className="flex-shrink-0 border-b border-[#1a1a2e]" style={{ background: "#080813" }}>
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3">

        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div
            ref={logoRef}
            onClick={() => onNavigate("new")}
            className="relative flex items-center gap-2 sm:gap-3 rounded-xl px-2.5 sm:px-4 py-2 sm:py-2.5 border border-[#1a1a2e] cursor-pointer hover:border-[#5b31fe]/40 hover:scale-[1.02] transition-all overflow-hidden"
            style={{ background: "#0f0f1e" }}
          >
            <img src="/assets/logo.png" alt="Bubble Flap" className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover flex-shrink-0" />
            <div className="flex-shrink-0">
              <div className="font-bold text-[11px] sm:text-sm leading-none tracking-tight uppercase text-white">BUBBLE FLAP</div>
              <div className="flex items-center gap-2 mt-1">
                {settings.telegram && (
                  <a href={settings.telegram} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-white/40 hover:text-[#d5f704] transition-colors">
                    <Send size={10} />
                  </a>
                )}
                {settings.twitter && (
                  <a href={settings.twitter} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-white/40 hover:text-[#d5f704] transition-colors text-[10px] font-bold leading-none">𝕏</a>
                )}
                {settings.github && (
                  <a href={settings.github} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-white/40 hover:text-[#d5f704] transition-colors">
                    <Github size={10} />
                  </a>
                )}
                {settings.email && (
                  <a href={`mailto:${settings.email}`} onClick={e => e.stopPropagation()} className="text-white/40 hover:text-[#d5f704] transition-colors">
                    <Mail size={10} />
                  </a>
                )}
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 ml-1 px-2 py-0.5 rounded-md bg-[#5b31fe]/20 border border-[#5b31fe]/30">
              <span className="text-[9px] font-bold text-[#5b31fe] tracking-wider uppercase">Dashboard</span>
            </div>
          </div>
        </div>

        {/* CA Address — center */}
        <div className="hidden lg:flex flex-1 items-center justify-center overflow-hidden px-2">
          <div
            className="max-w-xl w-full rounded-xl border border-[#2a2a4a] hover:border-[#5b31fe]/50 transition-colors overflow-hidden"
            style={{ background: "rgba(15,15,30,0.7)" }}
          >
            <BubblingCA address={ca} onCopy={copyCA} className="w-full px-3 py-2" />
          </div>
        </div>

        {/* Right controls */}
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          {/* Mobile CA copy */}
          <button onClick={copyCA} className="lg:hidden flex items-center gap-1 border border-[#1a1a2e] rounded-lg px-2 py-1.5 text-[10px] text-white/40 hover:text-white transition-colors" style={{ background: "#0f0f1e" }}>
            {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
            <span className="hidden sm:block font-mono">{shortCA}</span>
          </button>

          {/* BSC Mainnet */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#1a1a2e] text-[10px] font-bold text-white/50" style={{ background: "#0f0f1e" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            BSC
          </div>

          {/* $BFLAP */}
          <a
            href={`https://flap.sh/bnb/${BFLAP_CA}`}
            target="_blank" rel="noopener noreferrer"
            className="bg-[#d5f704] hover:bg-[#d5f704]/80 text-black font-bold rounded-full px-3 py-1.5 text-[10px] sm:text-xs transition-colors whitespace-nowrap"
          >
            $BFLAP
          </a>

          {/* Flap.sh */}
          <a
            href="https://flap.sh"
            target="_blank" rel="noopener noreferrer"
            className="bg-[#5b31fe] hover:bg-[#5b31fe]/80 text-white font-bold rounded-full px-3 py-1.5 text-[10px] sm:text-xs transition-colors whitespace-nowrap"
          >
            Flap.sh
          </a>

          {/* Exit */}
          <button
            onClick={() => onNavigate("new")}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#1a1a2e] hover:border-[#5b31fe]/40 text-[10px] text-white/40 hover:text-white transition-all"
            style={{ background: "#0f0f1e" }}
          >
            ← Bubble Mode
          </button>
        </div>
      </div>
    </header>
  );
}

export default function DashboardApp({ onNavigate }: DashboardAppProps) {
  const initSection = (): DashSection => {
    const validSections: DashSection[] = ["home","newtokens","recentbonding","bonding","dexpaid","partner","bflapswap","tokenomics","staking","lottery","volumebot","telegrambot","kolsrank","whitepaper"];
    if (typeof window !== "undefined") {
      const tab = new URLSearchParams(window.location.search).get("tab") || window.location.hash.replace("#", "");
      if (validSections.includes(tab as DashSection)) return tab as DashSection;
    }
    return "newtokens";
  };
  const [section, setSection] = useState<DashSection>(initSection);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 640 : false);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== "undefined" ? window.innerWidth >= 640 : true);

  useEffect(() => {
    const fn = () => {
      const mobile = window.innerWidth < 640;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(true);
    };
    window.addEventListener("resize", fn);

    const onHash = () => {
      const hash = window.location.hash.replace("#", "");
      const validSections: DashSection[] = ["home","newtokens","recentbonding","bonding","dexpaid","partner","bflapswap","tokenomics","staking","lottery","volumebot","telegrambot","kolsrank","whitepaper"];
      if (validSections.includes(hash as DashSection)) setSection(hash as DashSection);
    };
    window.addEventListener("hashchange", onHash);

    return () => {
      window.removeEventListener("resize", fn);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  const handleNav = (id: DashSection) => {
    setSection(id);
    window.history.replaceState(null, "", `/dashboard#${id}`);
    if (isMobile) setSidebarOpen(false);
  };

  return (
    <div
      className="fixed inset-0 flex flex-col text-white overflow-hidden"
      style={{ background: "#080813", fontFamily: "Inter, system-ui, sans-serif", zIndex: 60 }}
    >
      <GridBackground />
      <div className="relative z-10 flex flex-col flex-1 overflow-hidden">
      <DashHeader onNavigate={onNavigate} />

      <div className="relative flex flex-1 overflow-hidden">

        {/* Mobile backdrop */}
        {isMobile && sidebarOpen && (
          <div
            className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className="flex-shrink-0 border-r border-[#1e1e3a] flex flex-col transition-all duration-300"
          style={{
            position: isMobile ? "absolute" : "relative",
            top: 0, bottom: 0, left: 0,
            width: isMobile ? "208px" : sidebarOpen ? "208px" : "48px",
            transform: isMobile && !sidebarOpen ? "translateX(-100%)" : "translateX(0)",
            zIndex: isMobile ? 50 : "auto",
            background: "rgba(8,8,19,0.97)",
            backdropFilter: "blur(8px)",
          }}
        >
          {/* Scrollable nav */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col py-3 gap-0.5 px-1.5">
            {NAV_ITEMS.map(item => (
              <div key={item.id}>
                {item.dividerBefore && <div className="border-t border-[#1e1e3a] my-1.5 mx-1" />}
                <button
                  onClick={() => handleNav(item.id as DashSection)}
                  title={!sidebarOpen ? item.label : undefined}
                  className={`w-full flex items-center gap-2.5 py-2 rounded-lg text-sm transition-all duration-150 group ${
                    sidebarOpen ? "px-3 text-left" : "px-0 justify-center"
                  } ${
                    section === item.id
                      ? "bg-[#5b31fe]/20 text-white border border-[#5b31fe]/40"
                      : "text-white/50 hover:text-white hover:bg-white/[0.06] border border-transparent"
                  }`}
                >
                  <span className={`flex-shrink-0 ${section === item.id ? "text-[#5b31fe]" : "text-white/30 group-hover:text-white/60"}`}>
                    {item.icon}
                  </span>
                  {sidebarOpen && (
                    <>
                      <span className="truncate">{item.label}</span>
                      {section === item.id && <ChevronRight size={12} className="ml-auto flex-shrink-0 text-[#5b31fe]" />}
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t border-[#1e1e3a] px-1.5 py-2">
            <button
              onClick={() => onNavigate("new")}
              title={!sidebarOpen ? "← Back to Bubble Mode" : undefined}
              className={`w-full text-white/20 hover:text-white/50 py-1.5 transition-colors flex items-center ${
                sidebarOpen ? "justify-center text-[11px]" : "justify-center"
              }`}
            >
              {sidebarOpen ? "← Bubble Mode" : <ArrowLeftRight size={14} />}
            </button>
          </div>
        </aside>

        {/* Unified sidebar tab toggle — always visible at sidebar's right edge */}
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="absolute top-1/2 -translate-y-1/2 z-30 w-5 h-12 flex items-center justify-center rounded-r-xl shadow-lg transition-all duration-300 hover:w-7"
          style={{
            left: sidebarOpen ? (isMobile ? "208px" : "208px") : (isMobile ? "0px" : "48px"),
            background: "#5b31fe",
            border: "1px solid rgba(91,49,254,0.5)",
          }}
          title={sidebarOpen ? "Close menu" : "Open menu"}
        >
          <ChevronRight
            size={13}
            className="text-white transition-transform duration-300"
            style={{ transform: sidebarOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </button>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="px-4 sm:px-6 py-5">
            <SectionContent section={section} onNavigate={onNavigate} />
          </div>
        </main>
      </div>
      </div>
    </div>
  );
}
