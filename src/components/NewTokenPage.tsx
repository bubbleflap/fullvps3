import { useState, useCallback } from "react";
import BubbleCanvas from "./BubbleCanvas";
import TokenTooltip from "./TokenTooltip";
import RecentBonding from "./RecentBonding";
import PartnerPanel from "./PartnerPanel";
import { useNewTokens } from "../hooks/useNewTokens";
import { useRecentBonding } from "../hooks/useRecentBonding";
import { usePartnerTokens } from "../hooks/usePartnerTokens";
import type { Token } from "../lib/types";
import { useLang } from "../lib/i18n";
import type { ChatBotHandle } from "./ChatBot";
import type { PageView } from "./Header";

interface Props {
  chatBotRef: React.RefObject<ChatBotHandle | null>;
  onPageChange: (page: PageView) => void;
}

export default function NewTokenPage({ chatBotRef, onPageChange }: Props) {
  const { t } = useLang();
  const { tokens, newestIds, connected, refresh } = useNewTokens();
  const { tokens: recentBondingTokens } = useRecentBonding();
  const { tokens: partnerTokens, loaded: partnerLoaded } = usePartnerTokens();
  const [pinnedToken, setPinnedToken] = useState<Token | null>(null);
  const [pinnedRect, setPinnedRect] = useState<DOMRect | null>(null);
  const [openPanel, setOpenPanel] = useState<"bonding" | "partner" | null>(null);

  const bondingOnlyTokens = recentBondingTokens.filter(
    (t) => !t.isPartner && (t.ca || "").toLowerCase() !== "0xa2320fff1069ed5b4b02ddb386823e837a7e7777"
  );

  const handleTokenClick = useCallback((token: Token, rect?: DOMRect) => {
    setPinnedToken(token);
    setPinnedRect(rect || null);
  }, []);

  const handleDismissTooltip = useCallback(() => {
    setPinnedToken(null);
    setPinnedRect(null);
  }, []);

  return (
    <>
      <div className="absolute top-[96px] sm:top-[114px] lg:top-[120px] left-1.5 sm:left-3 z-40 pointer-events-auto">
        <RecentBonding
          tokens={bondingOnlyTokens}
          onAskBot={(ca) => chatBotRef.current?.lookupCA(ca)}
          isOpen={openPanel === "bonding"}
          onToggle={() => setOpenPanel(openPanel === "bonding" ? null : "bonding")}
        />
      </div>

      <div className="absolute top-[96px] sm:top-[114px] lg:top-[120px] right-12 sm:right-14 z-40 pointer-events-auto flex justify-end">
        <PartnerPanel
          tokens={partnerTokens}
          bondingLoaded={partnerLoaded}
          onAskBot={(ca) => chatBotRef.current?.lookupCA(ca)}
          isOpen={openPanel === "partner"}
          onToggle={() => setOpenPanel(openPanel === "partner" ? null : "partner")}
        />
      </div>

      <BubbleCanvas
        tokens={tokens}
        newestIds={newestIds}
        onTokenClick={handleTokenClick}
        onRefresh={refresh}
      />

      {pinnedToken && pinnedRect && (
        <>
          <div className="fixed inset-0 z-[199]" onClick={handleDismissTooltip} onTouchStart={handleDismissTooltip} />
          <TokenTooltip 
            token={pinnedToken} 
            rect={pinnedRect} 
            onAskBot={(ca) => { handleDismissTooltip(); chatBotRef.current?.lookupCA(ca); }} 
            onQuickSwap={(_ca) => {
              handleDismissTooltip();
              onPageChange("bflapswap");
            }}
          />
        </>
      )}

      {!connected && (
        <div className="absolute bottom-20 sm:bottom-4 left-4 z-50 bg-red-500/20 border border-red-500/30 backdrop-blur-md rounded-lg px-3 py-1.5 text-xs text-red-300">
          {t.reconnecting}
        </div>
      )}

      {tokens.length > 0 && (
        <div className="absolute bottom-[72px] sm:bottom-4 left-1/2 -translate-x-1/2 sm:translate-x-0 sm:left-24 z-40 bg-black/50 backdrop-blur-md rounded-lg px-2.5 py-1 sm:px-3 sm:py-1.5 text-[9px] sm:text-[10px] text-white/30 border border-white/5 whitespace-nowrap">
          {tokens.length} {t.newTokens} &middot; BSC/BNB
        </div>
      )}
    </>
  );
}
