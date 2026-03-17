import { useState, useCallback } from "react";
import BubbleCanvas from "./BubbleCanvas";
import TokenTooltip from "./TokenTooltip";
import { useBondingTokens } from "../hooks/useBondingTokens";
import type { Token } from "../lib/types";
import { useLang } from "../lib/i18n";
import type { ChatBotHandle } from "./ChatBot";
import type { PageView } from "./Header";

interface Props {
  chatBotRef: React.RefObject<ChatBotHandle | null>;
  onPageChange: (page: PageView) => void;
}

export default function BondingPage({ chatBotRef, onPageChange }: Props) {
  const { t } = useLang();
  const { tokens, newestIds, connected, refresh } = useBondingTokens();
  const [pinnedToken, setPinnedToken] = useState<Token | null>(null);
  const [pinnedRect, setPinnedRect] = useState<DOMRect | null>(null);

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
            onQuickSwap={(ca) => {
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
          {tokens.length} {t.bondingTokens} &middot; BSC/BNB
        </div>
      )}
    </>
  );
}
