import { useState, useRef, useEffect, useMemo } from "react";
import { Copy, HelpCircle, Send, Github, Mail, ChevronDown, Sparkles, Flame, BadgeDollarSign, Bot, ArrowLeftRight, FileText, Megaphone, Ticket, Coins, Gift, BookOpen, Trophy, LayoutDashboard, Clock } from "lucide-react";
import BubblingCA from "./BubblingCA";
import { useSettings } from "../hooks/useSettings";
import { useLang } from "../lib/i18n";

export type PageView = "new" | "hot" | "dexpaid" | "bflapswap" | "whitepaper" | "tokenomics" | "volumebot" | "lottery" | "staking" | "newaster" | "bondingaster" | "bswapaster" | "telegrambot" | "kolsrank" | "dashboard";

interface HeaderProps {
  onHowItWorks: () => void;
  currentPage: PageView;
  onPageChange: (page: PageView) => void;
}

const QUOTE_FILTERS = [
  { label: "BNB", icon: "https://flap.sh/bnb.svg", active: true },
  { label: "ASTER", icon: "https://flap.sh/_next/image?url=%2Faster.png&w=32&q=75&dpl=dpl_DNeVASfzkRWjDN8WyKGk3PGnLB7H", active: true },
  { label: "USDT", icon: "https://flap.sh/_next/image?url=%2Fusdt.webp&w=32&q=75&dpl=dpl_DNeVASfzkRWjDN8WyKGk3PGnLB7H", active: false },
  { label: "U", icon: "https://flap.sh/_next/image?url=%2Fu.png&w=32&q=75&dpl=dpl_DNeVASfzkRWjDN8WyKGk3PGnLB7H", active: false },
  { label: "USD1", icon: "https://flap.sh/_next/image?url=%2Fusd1.webp&w=32&q=75&dpl=dpl_DNeVASfzkRWjDN8WyKGk3PGnLB7H", active: false },
  { label: "币安人生", icon: "https://flap.sh/_next/image?url=%2Fbianrensheng.png&w=32&q=75&dpl=dpl_DNeVASfzkRWjDN8WyKGk3PGnLB7H", active: false },
];

const ASTER_PAGES = new Set<PageView>(["newaster", "bondingaster", "bswapaster"]);

function getAsterEquivalent(page: PageView): PageView {
  if (page === "hot") return "bondingaster";
  if (page === "bflapswap") return "bswapaster";
  return "newaster";
}

function getBnbEquivalent(page: PageView): PageView {
  if (page === "bondingaster") return "hot";
  if (page === "bswapaster") return "bflapswap";
  return "new";
}

const ASTER_ICON_URL = "https://flap.sh/_next/image?url=%2Faster.png&w=32&q=75&dpl=dpl_DNeVASfzkRWjDN8WyKGk3PGnLB7H";

export default function Header({ onHowItWorks, currentPage, onPageChange }: HeaderProps) {
  const { t, lang, setLang } = useLang();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterToast, setFilterToast] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState(ASTER_PAGES.has(currentPage) ? "ASTER" : "BNB");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const filterToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoBoxRef = useRef<HTMLDivElement>(null);
  const settings = useSettings();

  useEffect(() => {
    const container = logoBoxRef.current;
    if (!container) return;
    const COLORS = ["rgba(213,247,4,0.6)", "rgba(91,49,254,0.5)", "rgba(122,51,250,0.5)", "rgba(207,183,243,0.4)"];
    const SIZES = [3, 4, 5, 6, 7];
    const interval = setInterval(() => {
      const size = SIZES[Math.floor(Math.random() * SIZES.length)];
      const left = Math.floor(Math.random() * Math.max(container.offsetWidth - size, 10));
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const bubble = document.createElement("div");
      bubble.className = "bubble-rise";
      bubble.style.cssText = `position:absolute;border-radius:100%;bottom:2px;left:${left}px;width:${size}px;height:${size}px;background-color:${color};z-index:20;pointer-events:none;`;
      container.appendChild(bubble);
      setTimeout(() => bubble.remove(), 3100);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const copyCA = () => {
    navigator.clipboard.writeText(settings.ca_address);
    setFilterToast(t.caCopied as string);
    if (filterToastTimer.current) clearTimeout(filterToastTimer.current);
    filterToastTimer.current = setTimeout(() => setFilterToast(null), 2000);
  };

  const ASTER_ICON_NODE = <img src={ASTER_ICON_URL} alt="ASTER" className="w-[11px] h-[11px] sm:w-[14px] sm:h-[14px] rounded-full object-cover flex-shrink-0" />;

  const PAGE_LABELS: Record<PageView, { label: string; short: string; icon: React.ReactNode }> = useMemo(() => ({
    new: { label: t.shortNew as string, short: t.shortNew as string, icon: <Sparkles size={11} className="sm:w-[14px] sm:h-[14px]" /> },
    hot: { label: t.bonding as string, short: t.shortBonded as string, icon: <Flame size={11} className="sm:w-[14px] sm:h-[14px]" /> },
    dexpaid: { label: t.dexPaid as string, short: t.shortDexPaid as string, icon: <BadgeDollarSign size={11} className="sm:w-[14px] sm:h-[14px]" /> },
    bflapswap: { label: t.shortSwap as string, short: t.shortSwap as string, icon: <ArrowLeftRight size={11} className="sm:w-[14px] sm:h-[14px]" /> },
    whitepaper: { label: t.whitepaper as string, short: t.shortPaper as string, icon: <FileText size={11} className="sm:w-[14px] sm:h-[14px]" /> },
    tokenomics: { label: t.tokenomics as string, short: t.shortTokenomics as string, icon: <Coins size={11} className="sm:w-[14px] sm:h-[14px]" /> },
    volumebot: { label: t.volumeBot as string, short: "VBot", icon: <Bot size={11} className="sm:w-[14px] sm:h-[14px]" /> },
    lottery: { label: t.lottery as string, short: "Lottery", icon: <Ticket size={11} className="sm:w-[14px] sm:h-[14px]" /> },
    staking: { label: t.tgBot as string, short: "Stake", icon: <Coins size={11} className="sm:w-[14px] sm:h-[14px]" /> },
    newaster: { label: t.navNewAster as string, short: "New·A", icon: ASTER_ICON_NODE },
    bondingaster: { label: t.navBondingAster as string, short: "Bond·A", icon: ASTER_ICON_NODE },
    bswapaster: { label: t.navSwapAster as string, short: "Swap·A", icon: ASTER_ICON_NODE },
    telegrambot: { label: "Telegram Bot", short: "Bot", icon: <BookOpen size={11} className="sm:w-[14px] sm:h-[14px]" /> },
    kolsrank: { label: "KOLs Rank", short: "KOLs", icon: <Trophy size={11} className="sm:w-[14px] sm:h-[14px]" /> },
    dashboard: { label: "Dashboard", short: "Dash", icon: <LayoutDashboard size={11} className="sm:w-[14px] sm:h-[14px]" /> },
  }), [t]);

  const activeFilterData = QUOTE_FILTERS.find((f) => f.label === activeFilter) || QUOTE_FILTERS[1];

  const handleFilterClick = (filter: typeof QUOTE_FILTERS[number]) => {
    if (!filter.active) {
      setFilterToast(`${filter.label} ${t.comingSoon}`);
      if (filterToastTimer.current) clearTimeout(filterToastTimer.current);
      filterToastTimer.current = setTimeout(() => setFilterToast(null), 2000);
      setFilterOpen(false);
      return;
    }
    setActiveFilter(filter.label);
    setFilterOpen(false);
    if (filter.label === "ASTER") {
      onPageChange(getAsterEquivalent(currentPage));
    } else if (filter.label === "BNB") {
      if (ASTER_PAGES.has(currentPage)) {
        onPageChange(getBnbEquivalent(currentPage));
      }
    }
  };

  useEffect(() => {
    setActiveFilter(ASTER_PAGES.has(currentPage) ? "ASTER" : "BNB");
  }, [currentPage]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const navBtn = (page: PageView) => (
    <button
      key={page}
      onClick={() => { onPageChange(page); setDropdownOpen(false); }}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border transition-all duration-150 hover:scale-[1.03] active:scale-100 ${
        currentPage === page
          ? "bg-[#5b31fe]/25 border-[#5b31fe]/40 text-white"
          : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20 hover:text-white"
      }`}
    >
      {PAGE_LABELS[page].icon}
      {PAGE_LABELS[page].label}
      {currentPage === page && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#5b31fe]" />}
    </button>
  );

  return (
    <header className="absolute top-0 left-0 right-0 z-50 pointer-events-none">
      <div className="flex items-center justify-between px-1.5 sm:px-3 py-1.5 sm:py-2.5 lg:py-4 pointer-events-auto gap-1 sm:gap-1.5">
        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 flex-shrink">
          <div ref={logoBoxRef} onClick={() => onPageChange("new")} className="relative flex items-center gap-1.5 sm:gap-2.5 lg:gap-4 bg-black/60 backdrop-blur-md rounded-xl px-2 sm:px-4 lg:px-6 py-1.5 sm:py-2.5 lg:py-4 border border-white/10 flex-shrink-0 cursor-pointer transition-transform duration-200 hover:scale-[1.04] active:scale-100" id="header-logo-box">
            <img
              src="/assets/logo.png"
              alt="Bubble Flap"
              className="w-6 h-6 sm:w-9 sm:h-9 lg:w-12 lg:h-12 rounded-full object-cover flex-shrink-0"
            />
            <div className="min-w-0 flex-shrink-0">
              <h1 className="font-bold text-[10px] sm:text-sm lg:text-lg leading-none tracking-tight whitespace-nowrap uppercase">BUBBLE FLAP</h1>
              <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 mt-0.5 sm:mt-1 lg:mt-1.5">
                <a href={settings.telegram} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-[#d5f704] transition-colors">
                  <Send size={11} className="sm:w-[13px] sm:h-[13px] lg:w-[16px] lg:h-[16px]" />
                </a>
                <a href={settings.twitter} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-[#d5f704] transition-colors text-[11px] sm:text-xs lg:text-sm font-bold">𝕏</a>
                <a href={settings.github} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-[#d5f704] transition-colors">
                  <Github size={11} className="sm:w-[13px] sm:h-[13px] lg:w-[16px] lg:h-[16px]" />
                </a>
                <a href={`mailto:${settings.email}`} className="text-white/60 hover:text-[#d5f704] transition-colors">
                  <Mail size={11} className="sm:w-[13px] sm:h-[13px] lg:w-[16px] lg:h-[16px]" />
                </a>
              </div>
            </div>
          </div>

          <div className="relative z-[100]" ref={dropdownRef}>
            <button
              onClick={() => { setDropdownOpen(!dropdownOpen); setFilterOpen(false); }}
              className="btn-jelly flex items-center gap-1 sm:gap-1.5 bg-[#5b31fe]/80 hover:bg-[#5b31fe] backdrop-blur-md rounded-full px-2 sm:px-3 lg:px-5 py-1.5 sm:py-2 lg:py-3 border border-[#5b31fe]/40 transition-colors text-[10px] sm:text-xs lg:text-sm font-bold whitespace-nowrap"
            >
              {PAGE_LABELS[currentPage].icon}
              <span className="hidden sm:inline">{PAGE_LABELS[currentPage].label}</span>
              <span className="sm:hidden">{PAGE_LABELS[currentPage].short}</span>
              <ChevronDown size={12} className={`transition-transform lg:w-4 lg:h-4 ${dropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {dropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 z-[100] bg-black/90 backdrop-blur-xl rounded-2xl border border-white/10 min-w-[190px] shadow-xl shadow-black/50 p-1.5 flex flex-col gap-0.5">

                {activeFilter === "ASTER" ? (
                  <>
                    {(["newaster", "bondingaster", "bswapaster"] as PageView[]).map(navBtn)}
                    <div className="border-t border-white/10 my-0.5 mx-1" />
                    <p className="text-[10px] text-white/20 px-3 py-1">ASTER pair tokens on Flap.sh</p>
                  </>
                ) : (
                  <>
                    {navBtn("dashboard")}
                    <div className="border-t border-white/10 my-0.5 mx-1" />
                    {(["new", "hot", "dexpaid", "bflapswap", "tokenomics", "lottery"] as PageView[]).map(navBtn)}

                    <div className="border-t border-white/10 my-0.5 mx-1" />

                    {navBtn("staking")}

                    <button
                      onClick={() => { onPageChange("volumebot"); setDropdownOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border transition-all duration-150 hover:scale-[1.03] active:scale-100 ${currentPage === "volumebot" ? "bg-[#5b31fe]/25 border-[#5b31fe]/40 text-white" : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/20 hover:text-white"}`}
                    >
                      <Bot size={11} />{t.volumeBot}
                      {currentPage === "volumebot" && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#5b31fe]" />}
                    </button>

                    <button
                      onClick={() => { onPageChange("telegrambot"); setDropdownOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border transition-all duration-150 hover:scale-[1.03] active:scale-100 ${currentPage === "telegrambot" ? "bg-[#5b31fe]/20 border-[#5b31fe]/40 text-white" : "bg-white/[0.03] border-white/[0.08] text-white/70 hover:bg-white/5 hover:border-white/15 hover:text-white"}`}
                    >
                      <Bot size={11} />Telegram Bot
                      {currentPage === "telegrambot" && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#5b31fe]" />}
                    </button>

                    <button
                      onClick={() => { onPageChange("kolsrank"); setDropdownOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border transition-all duration-150 hover:scale-[1.03] active:scale-100 ${currentPage === "kolsrank" ? "bg-yellow-500/20 border-yellow-500/40 text-yellow-300" : "bg-white/[0.03] border-white/[0.08] text-white/70 hover:bg-yellow-500/10 hover:border-yellow-500/20 hover:text-yellow-300"}`}
                    >
                      <Trophy size={11} className={currentPage === "kolsrank" ? "text-yellow-400" : ""} />
                      KOLs Rank
                      {currentPage === "kolsrank" && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-yellow-400" />}
                    </button>

                    {navBtn("whitepaper")}

                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="hidden lg:flex items-center bg-black/60 backdrop-blur-md rounded-xl px-3 py-2 border border-white/10 min-w-0 flex-1 max-w-xl">
          <BubblingCA address={settings.ca_address} onCopy={copyCA} className="w-full" />
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
          <button
            onClick={() => setLang(lang === "en" ? "zh" : "en")}
            className="flex items-center justify-center bg-black/60 backdrop-blur-md rounded-full px-2 sm:px-3 py-1 sm:py-1.5 border border-white/10 hover:bg-white/10 transition-colors text-[10px] sm:text-xs font-bold text-white/60 hover:text-white whitespace-nowrap"
            title={lang === "en" ? "切换中文" : "Switch to English"}
          >
            {lang === "en" ? "中文" : "ENG"}
          </button>
          <div className="relative z-[100]" ref={filterRef}>
            <button
              onClick={() => { setFilterOpen(!filterOpen); setDropdownOpen(false); }}
              className="flex items-center justify-center bg-black/60 backdrop-blur-md rounded-full w-8 h-8 sm:w-9 sm:h-9 border border-white/10 hover:bg-white/10 transition-colors"
              title={t.quoteFilter as string}
            >
              <img src={activeFilterData.icon} alt={activeFilterData.label} className="w-5 h-5 sm:w-5 sm:h-5 rounded-full object-cover" />
            </button>

            {filterOpen && (
              <div className="absolute top-full right-0 mt-1.5 z-[100] bg-black/90 backdrop-blur-xl rounded-xl border border-white/10 overflow-hidden min-w-[160px] shadow-xl shadow-black/50">
                <div className="px-3.5 py-1.5 text-[10px] text-white/30 uppercase tracking-wider">{t.quoteFilter}</div>
                {QUOTE_FILTERS.map((f) => (
                  <button
                    key={f.label}
                    onClick={() => handleFilterClick(f)}
                    className={`w-full flex items-center gap-2 px-3.5 py-2 text-sm transition-colors ${
                      activeFilter === f.label
                        ? "text-white bg-white/10"
                        : f.active
                        ? "text-white/70 hover:bg-white/10 hover:text-white"
                        : "text-white/40 hover:bg-white/5 hover:text-white/50"
                    }`}
                  >
                    <img src={f.icon} alt={f.label} className={`w-4 h-4 rounded-full object-cover ${!f.active ? "opacity-40" : ""}`} />
                    {f.label}
                    {activeFilter === f.label && <span className="ml-auto text-[9px] text-green-400 font-medium">✓</span>}
                    {!f.active && <span className="ml-auto text-[9px] text-white/20 font-medium">{t.soon}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onHowItWorks}
            className="hidden lg:flex items-center gap-1.5 bg-black/60 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/10 hover:bg-white/10 transition-colors text-xs"
          >
            <HelpCircle size={13} />
            {t.howItWorks}
          </button>
          <button
            onClick={onHowItWorks}
            className="lg:hidden flex items-center justify-center bg-black/60 backdrop-blur-md rounded-full w-8 h-8 sm:w-9 sm:h-9 border border-white/10 hover:bg-white/10 transition-colors"
          >
            <HelpCircle size={14} />
          </button>
          <div className="hidden sm:flex items-center gap-1.5">
            <a
              href="https://flap.sh/bnb/0xa2320fff1069ED5b4B02dDb386823E837A7e7777"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-jelly bg-[#d5f704] hover:bg-[#d5f704]/80 text-black font-bold rounded-full px-3 py-1.5 text-xs transition-colors"
            >
              $BFLAP
            </a>
            <a
              href={settings.flapsh_link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-jelly bg-[#5b31fe] hover:bg-[#5b31fe]/80 text-white font-bold rounded-full px-3 py-1.5 text-xs transition-colors"
            >
              Flap.sh
            </a>
          </div>
          <div className="flex sm:hidden flex-col gap-1">
            <a
              href="https://flap.sh/bnb/0xa2320fff1069ED5b4B02dDb386823E837A7e7777"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-jelly bg-[#d5f704] hover:bg-[#d5f704]/80 text-black font-bold rounded-full px-2.5 py-1 text-[9px] transition-colors text-center leading-tight whitespace-nowrap"
            >
              $BFLAP
            </a>
            <a
              href={settings.flapsh_link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-jelly bg-[#5b31fe] hover:bg-[#5b31fe]/80 text-white font-bold rounded-full px-2.5 py-1 text-[9px] transition-colors text-center leading-tight whitespace-nowrap"
            >
              Flap.sh
            </a>
          </div>
        </div>
      </div>

      <div className="lg:hidden flex items-center justify-center pointer-events-auto px-6 sm:px-4 pb-1">
        <div className="w-full max-w-sm bg-black/60 backdrop-blur-md rounded-lg px-3 py-1 border border-white/10">
          <BubblingCA address={settings.ca_address} onCopy={copyCA} className="w-full" />
        </div>
      </div>
      {filterToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[300] animate-fade-in pointer-events-auto">
          <div className="bg-[#5b31fe]/90 backdrop-blur-md text-white text-sm font-bold px-5 py-2.5 rounded-full shadow-lg">
            {filterToast}
          </div>
        </div>
      )}
    </header>
  );
}
