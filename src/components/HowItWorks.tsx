import * as Dialog from "@radix-ui/react-dialog";
import { X, Sparkles, TrendingUp, MousePointer2, Zap, Search, Move, AlertCircle, MessageSquare, Layers, Flame, BadgeDollarSign, Clock, Filter, ArrowLeftRight, ListChecks, Bot, Wallet, Play, Square, Ticket, Gift, Download } from "lucide-react";
import type { PageView } from "./Header";
import { useLang } from "../lib/i18n";

interface HowItWorksProps {
  open: boolean;
  onClose: () => void;
  currentPage: PageView;
}

interface InfoItem {
  icon: React.ReactNode;
  bgClass: string;
  title: string;
  desc: React.ReactNode;
}

export default function HowItWorks({ open, onClose, currentPage }: HowItWorksProps) {
  const { t } = useLang();

  const SHARED_ITEMS: InfoItem[] = [
    {
      icon: <MessageSquare size={16} className="text-[#5b31fe]" />,
      bgClass: "bg-[#5b31fe]/20",
      title: t.botBubbleFlap as string,
      desc: <>{t.botBubbleFlapDesc}</>,
    },
    {
      icon: <Search size={16} className="text-orange-400" />,
      bgClass: "bg-orange-500/20",
      title: t.realTimeUpdates as string,
      desc: <>{t.realTimeUpdatesDesc}</>,
    },
  ];

  const PAGE_CONFIG: Record<PageView, { title: string; items: InfoItem[] }> = {
    whitepaper: {
      title: t.whitepaper as string,
      items: [
        {
          icon: <Layers size={16} className="text-[#5b31fe]" />,
          bgClass: "bg-[#5b31fe]/20",
          title: t.projectDoc as string,
          desc: <>{t.projectDocDesc}</>,
        },
      ],
    },
    bflapswap: {
      title: "BFlapSwap",
      items: [
        {
          icon: <ArrowLeftRight size={16} className="text-green-400" />,
          bgClass: "bg-green-500/20",
          title: t.howToSwapTitle as string,
          desc: (
            <div className="space-y-1">
              <p>{t.howToSwapStep1}</p>
              <p>{t.howToSwapStep2}</p>
              <p>{t.howToSwapStep3}</p>
              <p>{t.howToSwapStep4}</p>
            </div>
          ),
        },
        {
          icon: <Zap size={16} className="text-[#5b31fe]" />,
          bgClass: "bg-[#5b31fe]/20",
          title: "BFlapSwap",
          desc: <>{t.bflapSwapDesc}</>,
        },
      ],
    },
    new: {
      title: t.newToken as string,
      items: [
        {
          icon: <Sparkles size={16} className="text-[#5b31fe]" />,
          bgClass: "bg-[#5b31fe]/20",
          title: t.liveTokenBubbles as string,
          desc: <>{t.liveTokenBubblesDesc}</>,
        },
        {
          icon: <TrendingUp size={16} className="text-green-400" />,
          bgClass: "bg-green-500/20",
          title: t.sizeMarketCap as string,
          desc: <>{t.sizeMarketCapDescNew}</>,
        },
        {
          icon: <Zap size={16} className="text-[#d5f704]" />,
          bgClass: "bg-[#d5f704]/20",
          title: t.colorCodedActivity as string,
          desc: (
            <>
              <span className="text-green-400 font-medium">{t.colorGreen}</span> {t.colorBorderBuys}{" "}
              <span className="text-red-400 font-medium">{t.colorRed}</span> {t.colorBorderSells}{" "}
              <span className="text-[#5b31fe] font-medium">{t.colorPurple}</span> {t.colorIdle}{" "}
              <span className="text-[#d5f704] font-medium">{t.colorGold}</span> {t.colorNewest}
            </>
          ),
        },
        {
          icon: <AlertCircle size={16} className="text-red-400" />,
          bgClass: "bg-red-500/20",
          title: t.newTokenAlert as string,
          desc: <>{t.newTokenAlertDesc}</>,
        },
        {
          icon: <MousePointer2 size={16} className="text-sky-400" />,
          bgClass: "bg-sky-500/20",
          title: t.hoverClick as string,
          desc: <>{t.hoverClickDescNew}</>,
        },
        {
          icon: <Move size={16} className="text-pink-400" />,
          bgClass: "bg-pink-500/20",
          title: t.dragZoomPan as string,
          desc: <>{t.dragZoomPanDesc}</>,
        },
      ],
    },
    hot: {
      title: t.bonding as string,
      items: [
        {
          icon: <Flame size={16} className="text-orange-400" />,
          bgClass: "bg-orange-500/20",
          title: t.graduatedTokens as string,
          desc: <>{t.graduatedTokensDesc}</>,
        },
        {
          icon: <TrendingUp size={16} className="text-green-400" />,
          bgClass: "bg-green-500/20",
          title: t.sizeMarketCap as string,
          desc: <>{t.sizeMarketCapDescHot}</>,
        },
        {
          icon: <Zap size={16} className="text-[#d5f704]" />,
          bgClass: "bg-[#d5f704]/20",
          title: t.colorCodedActivity as string,
          desc: (
            <>
              <span className="text-green-400 font-medium">{t.colorGreen}</span> {t.colorBorderBuys}{" "}
              <span className="text-red-400 font-medium">{t.colorRed}</span> {t.colorBorderSells}{" "}
              <span className="text-[#5b31fe] font-medium">{t.colorPurple}</span> {t.colorIdleTrack}
            </>
          ),
        },
        {
          icon: <MousePointer2 size={16} className="text-sky-400" />,
          bgClass: "bg-sky-500/20",
          title: t.hoverClick as string,
          desc: <>{t.hoverClickDescHot}</>,
        },
        {
          icon: <Move size={16} className="text-pink-400" />,
          bgClass: "bg-pink-500/20",
          title: t.dragZoomPan as string,
          desc: <>{t.dragZoomPanDesc}</>,
        },
      ],
    },
    volumebot: {
      title: t.vbTitle as string,
      items: [
        {
          icon: <Wallet size={16} className="text-[#d5f704]" />,
          bgClass: "bg-[#d5f704]/20",
          title: t.vbStep1Title as string,
          desc: <>{t.vbStep1Desc}</>,
        },
        {
          icon: <BadgeDollarSign size={16} className="text-green-400" />,
          bgClass: "bg-green-500/20",
          title: t.vbStep2Title as string,
          desc: <>{t.vbStep2Desc}</>,
        },
        {
          icon: <ListChecks size={16} className="text-sky-400" />,
          bgClass: "bg-sky-500/20",
          title: t.vbStep3Title as string,
          desc: <>{t.vbStep3Desc}</>,
        },
        {
          icon: <Play size={16} className="text-[#5b31fe]" />,
          bgClass: "bg-[#5b31fe]/20",
          title: t.vbStep4Title as string,
          desc: <>{t.vbStep4Desc}</>,
        },
        {
          icon: <Square size={16} className="text-orange-400" />,
          bgClass: "bg-orange-500/20",
          title: t.vbStep5Title as string,
          desc: <>{t.vbStep5Desc}</>,
        },
      ],
    },
    tokenomics: {
      title: t.tokenomics as string,
      items: [
        {
          icon: <Layers size={16} className="text-[#5b31fe]" />,
          bgClass: "bg-[#5b31fe]/20",
          title: t.tokenomics as string,
          desc: <>{t.projectDocDesc}</>,
        },
      ],
    },
    lottery: {
      title: t.lotteryHIWTitle as string,
      items: [
        {
          icon: <Wallet size={16} className="text-[#7a33fb]" />,
          bgClass: "bg-[#7a33fb]/20",
          title: t.lotteryHIW1Title as string,
          desc: <>{t.lotteryHIW1Desc}</>,
        },
        {
          icon: <Ticket size={16} className="text-[#f0b90b]" />,
          bgClass: "bg-[#f0b90b]/20",
          title: t.lotteryHIW2Title as string,
          desc: <>{t.lotteryHIW2Desc}</>,
        },
        {
          icon: <Gift size={16} className="text-green-400" />,
          bgClass: "bg-green-500/20",
          title: t.lotteryHIW3Title as string,
          desc: <>{t.lotteryHIW3Desc}</>,
        },
        {
          icon: <Download size={16} className="text-sky-400" />,
          bgClass: "bg-sky-500/20",
          title: t.lotteryHIW5Title as string,
          desc: <>{t.lotteryHIW5Desc}</>,
        },
      ],
    },
    staking: {
      title: "Stake $BFLAP",
      items: [
        {
          icon: <Wallet size={16} className="text-[#d5f704]" />,
          bgClass: "bg-[#d5f704]/20",
          title: "Connect Your Wallet",
          desc: <>Connect your wallet (MetaMask) and make sure you are on the BNB Smart Chain network.</>,
        },
        {
          icon: <Layers size={16} className="text-sky-400" />,
          bgClass: "bg-sky-500/20",
          title: "Choose a Pool",
          desc: <>Select a staking pool — <span className="text-white font-medium">Flexible</span> (no lock), <span className="text-white font-medium">7 Days</span>, or <span className="text-white font-medium">15 Days</span>. Longer locks earn higher APY.</>,
        },
        {
          icon: <BadgeDollarSign size={16} className="text-green-400" />,
          bgClass: "bg-green-500/20",
          title: "Enter Amount",
          desc: <>Enter the amount of BFLAP you want to stake. Your wallet balance is shown for reference.</>,
        },
        {
          icon: <Zap size={16} className="text-[#5b31fe]" />,
          bgClass: "bg-[#5b31fe]/20",
          title: "Approve & Stake",
          desc: <>Click <span className="text-white font-medium">Approve</span> to allow the contract to use your tokens, then click <span className="text-white font-medium">Stake</span> to deposit and start earning rewards.</>,
        },
        {
          icon: <TrendingUp size={16} className="text-[#a78bfa]" />,
          bgClass: "bg-[#a78bfa]/20",
          title: "Claim or Compound",
          desc: <>Use <span className="text-white font-medium">Claim Rewards</span> to withdraw earned BFLAP, or <span className="text-white font-medium">Compound</span> to reinvest rewards and grow your stake faster.</>,
        },
      ],
    },
    newaster: {
      title: "New · ASTER Pair",
      items: [
        {
          icon: <Sparkles size={16} className="text-[#a78bfa]" />,
          bgClass: "bg-[#7c5af3]/20",
          title: "ASTER Pair New Tokens",
          desc: <>Newly created tokens that use ASTER as the quote currency on Flap.sh. Bubbles represent ASTER-based bonding curve tokens in real time.</>,
        },
        {
          icon: <ArrowLeftRight size={16} className="text-[#a78bfa]" />,
          bgClass: "bg-[#7c5af3]/20",
          title: "Switch Quote",
          desc: <>Use the QUOTE FILTER button (top right) to switch between BNB and ASTER pair views on any page.</>,
        },
      ],
    },
    bondingaster: {
      title: "Bonding · ASTER Pair",
      items: [
        {
          icon: <Flame size={16} className="text-[#a78bfa]" />,
          bgClass: "bg-[#7c5af3]/20",
          title: "ASTER Pair Bonding Tokens",
          desc: <>Tokens graduating on the ASTER bonding curve. When they reach 100%, they list on a DEX with an ASTER pair.</>,
        },
      ],
    },
    bswapaster: {
      title: "Swap · ASTER Pair",
      items: [
        {
          icon: <ArrowLeftRight size={16} className="text-[#a78bfa]" />,
          bgClass: "bg-[#7c5af3]/20",
          title: "Trade ASTER Pair Tokens",
          desc: <>Select any ASTER pair token to view its details and trading links. Bonding curve tokens trade on Flap.sh with ASTER as the quote currency.</>,
        },
      ],
    },
    dexpaid: {
      title: t.dexPaid as string,
      items: [
        {
          icon: <BadgeDollarSign size={16} className="text-green-400" />,
          bgClass: "bg-green-500/20",
          title: t.paidDexProfiles as string,
          desc: <>{t.paidDexProfilesDesc}</>,
        },
        {
          icon: <Filter size={16} className="text-[#5b31fe]" />,
          bgClass: "bg-[#5b31fe]/20",
          title: t.sortTabs as string,
          desc: (
            <>
              <span className="text-white font-medium">{t.pairCreated}</span> {t.sortPairCreated}{" "}
              <span className="text-white font-medium">{t.timeDexPaid}</span> {t.sortTimeDexPaid}
            </>
          ),
        },
        {
          icon: <Zap size={16} className="text-[#d5f704]" />,
          bgClass: "bg-[#d5f704]/20",
          title: t.boostBadges as string,
          desc: <>{t.boostBadgesDesc}</>,
        },
        {
          icon: <Clock size={16} className="text-sky-400" />,
          bgClass: "bg-sky-500/20",
          title: t.tokenCards as string,
          desc: <>{t.tokenCardsDesc}</>,
        },
        {
          icon: <MousePointer2 size={16} className="text-pink-400" />,
          bgClass: "bg-pink-500/20",
          title: t.quickActions as string,
          desc: <>{t.quickActionsDesc}</>,
        },
      ],
    },
  };

  const config = PAGE_CONFIG[currentPage] || PAGE_CONFIG["new"];
  const allItems = [...config.items, ...SHARED_ITEMS];

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-full max-w-md max-h-[85vh] overflow-y-auto bg-black/95 border border-white/20 rounded-2xl p-6 shadow-2xl">
          <Dialog.Title className="flex items-center gap-3 text-xl font-bold mb-5">
            <img
              src="/assets/logo.png"
              alt="Bubble Flap"
              className="w-9 h-9 rounded-lg"
            />
            <div>
              <div>{t.howItWorksTitle as string}</div>
              <div className="text-xs font-normal text-[#5b31fe]">{config.title} {t.page as string}</div>
            </div>
          </Dialog.Title>

          <div className="space-y-4">
            {allItems.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg ${item.bgClass} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  {item.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white mb-0.5">{item.title}</p>
                  <p className="text-xs text-white/60">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <Dialog.Close asChild>
            <button className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors">
              <X size={18} />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
