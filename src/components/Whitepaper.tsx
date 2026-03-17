import { useState } from "react";
import { Sparkles, TrendingUp, Zap, Shield, Rocket, Globe, Bot, BarChart3, Users, Layers, Activity, Ticket, Heart } from "lucide-react";
import { useLang } from "../lib/i18n";

export default function Whitepaper() {
  const { t } = useLang();
  const [toast, setToast] = useState<string | null>(null);

  function copyAddress(addr: string, label: string) {
    navigator.clipboard.writeText(addr);
    setToast(`${label} address copied!`);
    setTimeout(() => setToast(null), 2000);
  }

  return (
    <div className="w-full h-full overflow-y-auto pt-20 pb-24 px-4">
      <div className="max-w-3xl mx-auto space-y-10">

        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <img src="/assets/logo.png" alt="Bubble Flap" className="w-14 h-14 rounded-xl" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Bubble Flap</h1>
          <p className="text-white/50 text-sm max-w-md mx-auto">
            {t.wpSubtitle as string}
          </p>
          <div className="flex items-center justify-center gap-3 text-xs text-white/30">
            <span>{t.wpVersion as string}</span>
            <span>·</span>
            <span>{t.wpDate as string}</span>
            <span>·</span>
            <span>{t.wpChain as string}</span>
          </div>
        </div>

        <Section
          icon={<Sparkles size={20} className="text-[#5b31fe]" />}
          title={t.wpVision as string}
          color="bg-[#5b31fe]/10 border-[#5b31fe]/20"
        >
          <p>{t.wpVisionP1 as string}</p>
          <p>{t.wpVisionP2 as string}</p>
        </Section>

        <Section
          icon={<Globe size={20} className="text-sky-400" />}
          title={t.wpPlatform as string}
          color="bg-sky-500/10 border-sky-500/20"
        >
          <p>{t.wpPlatformIntro as string}</p>
          <div className="space-y-3 mt-3">
            <Feature
              title={t.wpNewTokenTitle as string}
              desc={t.wpNewTokenDesc as string}
            />
            <Feature
              title={t.wpBondingTitle as string}
              desc={t.wpBondingDesc as string}
            />
            <Feature
              title={t.wpDexPaidTitle as string}
              desc={t.wpDexPaidDesc as string}
            />
            <Feature
              title={t.wpBFlapSwapTitle as string}
              desc={t.wpBFlapSwapDesc as string}
            />
            <Feature
              title={t.wpNewAsterTitle as string}
              desc={t.wpNewAsterDesc as string}
            />
            <Feature
              title={t.wpBondingAsterTitle as string}
              desc={t.wpBondingAsterDesc as string}
            />
            <Feature
              title={t.wpSwapAsterTitle as string}
              desc={t.wpSwapAsterDesc as string}
            />
            <Feature
              title={t.wpVolumeBotTitle as string}
              desc={t.wpVolumeBotDesc as string}
            />
            <Feature
              title={t.wpLotteryTitle as string}
              desc={t.wpLotteryIntro as string}
            />
          </div>
        </Section>

        <Section
          icon={<Activity size={20} className="text-[#d5f704]" />}
          title={t.wpVBSection as string}
          color="bg-[#d5f704]/10 border-[#d5f704]/20"
        >
          <p>{t.wpVBIntro as string}</p>
          <div className="space-y-2 mt-3">
            <Feature
              title={t.wpVBWallet as string}
              desc={t.wpVBWalletDesc as string}
            />
            <Feature
              title={t.wpVBConfig as string}
              desc={t.wpVBConfigDesc as string}
            />
            <Feature
              title={t.wpVBGas as string}
              desc={t.wpVBGasDesc as string}
            />
            <Feature
              title={t.wpVBExec as string}
              desc={t.wpVBExecDesc as string}
            />
          </div>
        </Section>

        <Section
          icon={<Ticket size={20} className="text-[#f0b90b]" />}
          title={t.wpLotteryTitle as string}
          color="bg-[#f0b90b]/10 border-[#f0b90b]/20"
        >
          <p>{t.wpLotteryIntro as string}</p>
          <div className="space-y-2 mt-3">
            <Feature
              title={t.wpLotteryTiers as string}
              desc={t.wpLotteryTiersDesc as string}
            />
            <Feature
              title={t.wpLotteryPayment as string}
              desc={t.wpLotteryPaymentDesc as string}
            />
            <Feature
              title={t.wpLotteryPrizes as string}
              desc={t.wpLotteryPrizesDesc as string}
            />
          </div>
        </Section>

        <Section
          icon={<TrendingUp size={20} className="text-purple-400" />}
          title={t.wpStaking as string}
          color="bg-purple-500/10 border-purple-500/20"
        >
          <p>{t.wpStakingIntro as string}</p>
          <div className="space-y-2 mt-3">
            <Feature title={t.wpStakingFlexible as string} desc={t.wpStakingFlexibleDesc as string} />
            <Feature title={t.wpStaking7d as string} desc={t.wpStaking7dDesc as string} />
            <Feature title={t.wpStaking15d as string} desc={t.wpStaking15dDesc as string} />
            <Feature title={t.wpStakingRewards as string} desc={t.wpStakingRewardsDesc as string} />
            <Feature title={t.wpStakingEmergency as string} desc={t.wpStakingEmergencyDesc as string} />
          </div>
        </Section>

        <Section
          icon={<BarChart3 size={20} className="text-green-400" />}
          title={t.wpBubbleMech as string}
          color="bg-green-500/10 border-green-500/20"
        >
          <p>{t.wpBubbleMechIntro as string}</p>
          <div className="space-y-2 mt-3">
            <Stat label={t.wpSize as string} value={t.wpSizeDesc as string} />
            <Stat label={t.wpBorderColor as string} value={t.wpBorderColorDesc as string} />
            <Stat label={t.wpNewDetection as string} value={t.wpNewDetectionDesc as string} />
            <Stat label={t.wpPhysics as string} value={t.wpPhysicsDesc as string} />
            <Stat label={t.wpInteraction as string} value={t.wpInteractionDesc as string} />
          </div>
        </Section>

        <Section
          icon={<Layers size={20} className="text-purple-400" />}
          title={t.wpTechArch as string}
          color="bg-purple-500/10 border-purple-500/20"
        >
          <div className="space-y-2">
            <Stat label={t.wpFrontend as string} value={t.wpFrontendDesc as string} />
            <Stat label={t.wpBackend as string} value={t.wpBackendDesc as string} />
            <Stat label={t.wpDataSource as string} value={t.wpDataSourceDesc as string} />
            <Stat label={t.wpRealtime as string} value={t.wpRealtimeDesc as string} />
            <Stat label={t.wpDatabase as string} value={t.wpDatabaseDesc as string} />
            <Stat label={t.wpAIModel as string} value={t.wpAIModelDesc as string} />
            <Stat label={t.wpSwapEngine as string} value={t.wpSwapEngineDesc as string} />
          </div>
        </Section>

        <Section
          icon={<Bot size={20} className="text-[#5b31fe]" />}
          title={t.wpAITitle as string}
          color="bg-[#5b31fe]/10 border-[#5b31fe]/20"
        >
          <p>{t.wpAIIntro as string}</p>
          <div className="space-y-2 mt-3">
            <Feature
              title={t.wpTokenLookup as string}
              desc={t.wpTokenLookupDesc as string}
            />
            <Feature
              title={t.wpDeepAnalysis as string}
              desc={t.wpDeepAnalysisDesc as string}
            />
            <Feature
              title={t.wpQuickSwapChat as string}
              desc={t.wpQuickSwapChatDesc as string}
            />
            <Feature
              title={t.wpFAQ as string}
              desc={t.wpFAQDesc as string}
            />
          </div>
        </Section>

        <Section
          icon={<Shield size={20} className="text-[#d5f704]" />}
          title={t.wpSecurity as string}
          color="bg-[#d5f704]/10 border-[#d5f704]/20"
        >
          <div className="space-y-2">
            <Feature
              title={t.wpReadOnly as string}
              desc={t.wpReadOnlyDesc as string}
            />
            <Feature
              title={t.wpPublicData as string}
              desc={t.wpPublicDataDesc as string}
            />
            <Feature
              title={t.wpOpenSource as string}
              desc={t.wpOpenSourceDesc as string}
            />
          </div>
        </Section>

        <Section
          icon={<Rocket size={20} className="text-orange-400" />}
          title={t.wpRoadmap as string}
          color="bg-orange-500/10 border-orange-500/20"
        >
          <div className="space-y-3">
            <RoadmapItem phase={t.wpPhase1 as string} status="done" statusLabel={t.wpComplete as string} items={t.wpP1Items as string[]} />
            <RoadmapItem phase={t.wpPhase2 as string} status="progress" statusLabel={t.wpInProgress as string} items={t.wpP2Items as string[]} />
            <RoadmapItem phase={t.wpPhase3 as string} status="planned" statusLabel={t.wpPlanned as string} items={t.wpP3Items as string[]} />
          </div>
        </Section>

        <Section
          icon={<Users size={20} className="text-pink-400" />}
          title={t.wpCommunity as string}
          color="bg-pink-500/10 border-pink-500/20"
        >
          <div className="grid grid-cols-2 gap-3">
            <LinkCard label="Telegram" href="https://t.me/BubbleFlap" />
            <LinkCard label="Twitter / X" href="https://x.com/BubbleFlapFun" />
            <LinkCard label="GitHub" href="https://github.com/bubbleflap" />
            <LinkCard label="Email" href="mailto:dev@bubbleflap.fun" />
          </div>
        </Section>

        <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Heart size={20} className="text-pink-400" />
            <h2 className="text-lg font-bold text-pink-300">{t.donate as string}</h2>
          </div>
          <p className="text-sm text-white/50">Support Bubble Flap development by donating on BNB or Solana chain.</p>
          <div className="flex gap-3">
            <button
              onClick={() => copyAddress("0x9f3b24722a6e66b68bc4001a1cd955c2e588e33d", "BNB")}
              className="flex-1 flex items-center justify-center gap-2 bg-[#f0b90b]/10 hover:bg-[#f0b90b]/20 border border-[#f0b90b]/20 hover:border-[#f0b90b]/40 rounded-xl px-4 py-3 hover:scale-[1.02] active:scale-100 transition-all duration-150"
            >
              <img src="https://flap.sh/bnb.svg" alt="BNB" className="w-5 h-5" />
              <span className="text-sm font-bold text-[#f0b90b]">BNB</span>
            </button>
            <button
              onClick={() => copyAddress("3aFRKufbsNqmNP7NmChpJQsP6UBMP4JxahWtNXjkURz9", "SOL")}
              className="flex-1 flex items-center justify-center gap-2 bg-[#9945FF]/10 hover:bg-[#9945FF]/20 border border-[#9945FF]/20 hover:border-[#9945FF]/40 rounded-xl px-4 py-3 hover:scale-[1.02] active:scale-100 transition-all duration-150"
            >
              <img src="/assets/sol-icon.png" alt="SOL" className="w-5 h-5 rounded-full" />
              <span className="text-sm font-bold text-[#9945FF]">SOL</span>
            </button>
          </div>
          {toast && (
            <div className="text-center text-xs text-pink-300 animate-pulse">{toast}</div>
          )}
        </div>

        <div className="text-center text-white/20 text-xs pb-4">
          {t.wpFooter as string}
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, color, children }: {
  icon: React.ReactNode;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border ${color} p-5 sm:p-6 space-y-3`}>
      <div className="flex items-center gap-3">
        {icon}
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <div className="text-sm text-white/60 leading-relaxed space-y-2">
        {children}
      </div>
    </div>
  );
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex items-start gap-2">
      <Zap size={12} className="text-[#d5f704] mt-1 flex-shrink-0" />
      <div>
        <span className="text-white font-medium text-sm">{title}</span>
        <span className="text-white/50 text-sm"> — {desc}</span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-white font-medium text-sm w-24 flex-shrink-0">{label}</span>
      <span className="text-white/50 text-sm">{value}</span>
    </div>
  );
}

function RoadmapItem({ phase, status, statusLabel, items }: { phase: string; status: "done" | "progress" | "planned"; statusLabel: string; items: string[] }) {
  const statusColor = status === "done" ? "bg-green-500" : status === "progress" ? "bg-[#d5f704]" : "bg-white/20";
  return (
    <div className="bg-white/[0.03] rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-bold text-sm">{phase}</span>
        <span className={`${statusColor} text-black text-[10px] font-bold px-2 py-0.5 rounded-full`}>{statusLabel}</span>
      </div>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-white/50 flex items-start gap-2">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${status === "done" ? "bg-green-400" : status === "progress" ? "bg-[#d5f704]" : "bg-white/20"}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LinkCard({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-3 text-sm font-medium text-white/70 hover:text-white hover:border-[#5b31fe]/30 hover:bg-white/[0.05] transition-all text-center"
    >
      {label}
    </a>
  );
}
