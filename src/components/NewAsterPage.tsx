import { useState, useCallback } from "react";
import BubbleCanvas from "./BubbleCanvas";
import TokenTooltip from "./TokenTooltip";
import type { Token } from "../lib/types";
import { useLang } from "../lib/i18n";
import type { ChatBotHandle } from "./ChatBot";
import type { PageView } from "./Header";
import { useNewAsterTokens } from "../hooks/useNewAsterTokens";

interface Props {
  chatBotRef: React.RefObject<ChatBotHandle | null>;
  onPageChange: (page: PageView) => void;
}

export default function NewAsterPage({ chatBotRef, onPageChange }: Props) {
  const { t } = useLang();
  const { tokens, newestIds, connected, refresh } = useNewAsterTokens();
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
      <div className="absolute top-[54px] left-1/2 -translate-x-1/2 z-40 pointer-events-none">
        <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-md rounded-full px-3 py-1 border border-[#7c5af3]/30">
          <img
            src="https://flap.sh/_next/image?url=%2Faster.png&w=32&q=75&dpl=dpl_DNeVASfzkRWjDN8WyKGk3PGnLB7H"
            alt="ASTER"
            className="w-4 h-4 rounded-full object-cover"
          />
          <span className="text-[10px] font-bold text-[#a78bfa]">ASTER</span>
          <span className="text-[10px] text-white/40">pair</span>
        </div>
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
              onPageChange("bswapaster");
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
          {tokens.length} {t.newTokens} &middot; ASTER pair
        </div>
      )}

      {tokens.length === 0 && connected && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <img
              src="https://flap.sh/_next/image?url=%2Faster.png&w=32&q=75&dpl=dpl_DNeVASfzkRWjDN8WyKGk3PGnLB7H"
              alt="ASTER"
              className="w-12 h-12 rounded-full mx-auto mb-3 opacity-40"
            />
            <div className="text-white/30 text-sm font-medium">No ASTER pair tokens yet</div>
            <div className="text-white/20 text-xs mt-1">New ASTER tokens will appear here</div>
          </div>
        </div>
      )}
    </>
  );
}
