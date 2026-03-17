import { useRef, useEffect } from "react";
import { Copy } from "lucide-react";

interface BubblingCAProps {
  address: string;
  onCopy: () => void;
  className?: string;
}

const SIZE_OPTIONS = [3, 4, 5, 6];

export default function BubblingCA({ address, onCopy, className = "" }: BubblingCAProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const interval = setInterval(() => {
      const size = SIZE_OPTIONS[Math.floor(Math.random() * SIZE_OPTIONS.length)];
      const left = Math.floor(Math.random() * Math.max(container.offsetWidth - size, 10));

      const bubble = document.createElement("div");
      bubble.className = "bubble-rise";
      bubble.style.cssText = `
        position: absolute;
        border-radius: 100%;
        bottom: 2px;
        left: ${left}px;
        width: ${size}px;
        height: ${size}px;
        background-color: rgba(213,247,4,0.5);
        z-index: 1;
      `;
      container.appendChild(bubble);
      setTimeout(() => bubble.remove(), 3100);
    }, 400);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      ref={containerRef}
      onClick={onCopy}
      title="Click to copy address"
      className={`relative cursor-pointer select-none flex items-center justify-center gap-1 sm:gap-1.5 transition-transform duration-200 hover:scale-[1.04] active:scale-[0.97] ${className}`}
    >
      <img
        src="/assets/bot.png"
        alt="bot"
        className="relative z-10 flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 bot-float-left"
      />

      <span
        className="relative z-10 font-bold whitespace-nowrap flex-shrink-0 text-[11px] sm:text-[13px] bflap-gradient-text"
        style={{ fontFamily: "'Luckiest Guy', cursive", letterSpacing: "0.04em" }}
      >
        $BFLAP :
      </span>

      <span className="relative z-10 font-mono text-white/85 text-[6px] sm:text-[8px] lg:text-[10px] whitespace-nowrap flex-shrink min-w-0">
        {address}
      </span>

      <Copy size={9} className="relative z-10 text-white/35 hover:text-white transition-colors flex-shrink-0" />

      <img
        src="/assets/bot.png"
        alt="bot"
        className="relative z-10 flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 bot-float-right"
      />
    </div>
  );
}
