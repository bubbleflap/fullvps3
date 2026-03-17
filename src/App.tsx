import { useState, useRef, useEffect } from "react";
import Header from "./components/Header";
import type { PageView } from "./components/Header";
import HowItWorks from "./components/HowItWorks";
import NewTokenPage from "./components/NewTokenPage";
import BondingPage from "./components/BondingPage";
import NewAsterPage from "./components/NewAsterPage";
import BondingAsterPage from "./components/BondingAsterPage";
import BswapAsterPage from "./components/BswapAsterPage";
import ChatBot from "./components/ChatBot";
import type { ChatBotHandle } from "./components/ChatBot";
import DexPaid from "./components/DexPaid";
import Whitepaper from "./components/Whitepaper";
import Tokenomics from "./components/Tokenomics";
import BFlapSwap from "./components/BFlapSwap";
import type { SwapInitialToken } from "./components/BFlapSwap";
import AdminDev88 from "./components/AdminDev88";
import VolumeBot from "./components/VolumeBot";
import Lottery from "./components/Lottery";
import Staking from "./components/Staking";
import BotDocs from "./components/BotDocs";
import KolsRank from "./components/KolsRank";
import DashboardApp from "./dashboard/index";
import { useLang } from "./lib/i18n";
import { useTracker } from "./hooks/useTracker";

export default function App() {
  const { t } = useLang();
  useTracker();
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [swapToken, setSwapToken] = useState<SwapInitialToken | undefined>(undefined);

  const getPageFromPath = (): PageView => {
    const path = window.location.pathname.toLowerCase().replace(/\/$/, "");
    if (path === "/bswap" || path === "/swap" || path === "/bflapswap" || path === "/bflap-swap") return "bflapswap";
    if (path === "/bonding" || path === "/hot") return "hot";
    if (path === "/dexpaid") return "dexpaid";
    if (path === "/whitepaper") return "whitepaper";
    if (path === "/tokenomics") return "tokenomics";
    if (path === "/volumebot") return "volumebot";
    if (path === "/lottery") return "lottery";
    if (path === "/staking") return "staking";
    if (path === "/newaster") return "newaster";
    if (path === "/bondingaster") return "bondingaster";
    if (path === "/bswapaster") return "bswapaster";
    if (path === "/@bubbleflapbot" || path === "/telegrambot") return "telegrambot";
    if (path === "/kols" || path === "/kolsrank") return "kolsrank";
    if (path === "/dashboard") return "dashboard";
    return "new";
  };

  const [currentPage, setCurrentPage] = useState<PageView>(getPageFromPath());

  useEffect(() => {
    setCurrentPage(getPageFromPath());
  }, []);
  const [isAdmin, setIsAdmin] = useState(false);
  const chatBotRef = useRef<ChatBotHandle | null>(null);

  const handlePageChange = (page: PageView) => {
    setCurrentPage(page);
    const pathMap: Record<PageView, string> = {
      new: "/",
      hot: "/bonding",
      dexpaid: "/dexpaid",
      bflapswap: "/bswap",
      whitepaper: "/whitepaper",
      tokenomics: "/tokenomics",
      volumebot: "/volumebot",
      lottery: "/lottery",
      staking: "/staking",
      newaster: "/newaster",
      bondingaster: "/bondingaster",
      bswapaster: "/bswapaster",
      telegrambot: "/@BubbleFlapbot",
      kolsrank: "/kols",
      dashboard: "/dashboard",
    };
    window.history.pushState({}, "", pathMap[page]);
  };

  useEffect(() => {
    const onPopState = () => {
      setCurrentPage(getPageFromPath());
      setIsAdmin(window.location.hash === "#dev88");
    };
    window.addEventListener("popstate", onPopState);

    const checkHash = () => {
      setIsAdmin(window.location.hash === "#dev88");
    };
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("hashchange", checkHash);
    };
  }, []);

  useEffect(() => {
    const handleQuickSwap = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.ca) {
        setSwapToken({
          address: detail.ca,
          name: detail.name || "",
          ticker: detail.ticker || "",
          image: detail.image || "",
        });
        handlePageChange("bflapswap");
      }
    };
    window.addEventListener("quick-swap", handleQuickSwap);
    return () => window.removeEventListener("quick-swap", handleQuickSwap);
  }, []);

  if (isAdmin) {
    return (
      <div className="relative w-screen h-screen bg-black overflow-hidden font-sans text-white">
          <Header
          onHowItWorks={() => setShowHowItWorks(true)}
          currentPage={currentPage}
          onPageChange={handlePageChange}
        />
        <AdminDev88 onBack={() => { window.location.hash = ""; setIsAdmin(false); }} />
      </div>
    );
  }

  return (
    <div id="app-root" className="relative w-screen h-screen bg-black overflow-hidden font-sans text-white">
      <Header
        onHowItWorks={() => setShowHowItWorks(true)}
        currentPage={currentPage}
        onPageChange={handlePageChange}
      />

      {currentPage === "new" && <NewTokenPage chatBotRef={chatBotRef} onPageChange={handlePageChange} />}
      {currentPage === "hot" && <BondingPage chatBotRef={chatBotRef} onPageChange={handlePageChange} />}
      {currentPage === "dexpaid" && <DexPaid chatBotRef={chatBotRef} onPageChange={handlePageChange} />}
      {currentPage === "bflapswap" && <BFlapSwap initialToken={swapToken} />}
      {currentPage === "whitepaper" && <Whitepaper />}
      {currentPage === "tokenomics" && <Tokenomics />}
      {currentPage === "volumebot" && <VolumeBot />}
      {currentPage === "lottery" && <Lottery />}
      {currentPage === "staking" && <Staking />}
      {currentPage === "newaster" && <NewAsterPage chatBotRef={chatBotRef} onPageChange={handlePageChange} />}
      {currentPage === "bondingaster" && <BondingAsterPage chatBotRef={chatBotRef} onPageChange={handlePageChange} />}
      {currentPage === "bswapaster" && <BswapAsterPage />}
      {currentPage === "telegrambot" && <BotDocs />}
      {currentPage === "kolsrank" && <KolsRank />}
      {currentPage === "dashboard" && <DashboardApp onNavigate={handlePageChange} />}

      <ChatBot onRef={(handle) => { chatBotRef.current = handle; }} />
      <HowItWorks open={showHowItWorks} onClose={() => setShowHowItWorks(false)} currentPage={currentPage} />
    </div>
  );
}
