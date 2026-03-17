import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "@/lib/i18n";

interface WalletButtonProps {
  address: string;
  onConnect: () => void;
  onDisconnect: () => void;
  variant?: "default" | "amber" | "primary" | "minimal";
  className?: string;
  showLiveIndicator?: boolean;
  connectLabel?: string;
  mobileCompact?: boolean;
}

export function WalletButton({
  address,
  onConnect,
  onDisconnect,
  variant = "default",
  className = "",
  showLiveIndicator = false,
  connectLabel,
  mobileCompact = false,
}: WalletButtonProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  const label = connectLabel || t("walletBtn.connectWallet");

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  const short = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";

  const copyAddress = () => {
    navigator.clipboard.writeText(address);
    setDropdownOpen(false);
  };

  const viewOnBscscan = () => {
    window.open(`https://bscscan.com/address/${address}`, "_blank");
    setDropdownOpen(false);
  };

  const handleDisconnect = () => {
    setDropdownOpen(false);
    onDisconnect();
  };

  const walletIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
      <circle cx="18" cy="15" r="1"/>
    </svg>
  );

  if (!address) {
    const btnStyles: Record<string, string> = {
      default: "px-4 py-1.5 rounded-lg bg-white/[0.08] border border-white/[0.12] text-white text-xs font-semibold hover:bg-white/[0.14] transition-colors",
      amber: "px-4 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-semibold hover:bg-amber-500/30 transition-colors",
      primary: "btn-staking-jelly flex items-center gap-1.5 text-xs bg-primary/20 text-primary border border-primary/30 px-4 py-2 rounded-full font-bold",
      minimal: "flex items-center gap-1 text-[10px] sm:text-xs bg-primary text-black px-2 sm:px-3 py-1.5 rounded-lg font-bold hover:bg-primary/90 transition-colors",
    };

    if (mobileCompact) {
      return (
        <button onClick={onConnect} className={`${btnStyles[variant]} ${className}`}>
          <span className="sm:hidden flex items-center">{walletIcon}</span>
          <span className="hidden sm:inline">{label}</span>
        </button>
      );
    }

    return (
      <button onClick={onConnect} className={`${btnStyles[variant]} ${className}`}>
        {variant === "primary" && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
        )}
        {variant === "minimal" && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
        )}
        {label}
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className={`flex items-center gap-2 ${mobileCompact ? "p-1.5 sm:px-3 sm:py-1.5" : "px-3 py-1.5"} rounded-lg bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.10] transition-colors cursor-pointer ${className}`}
      >
        {mobileCompact ? (
          <>
            <span className="sm:hidden text-green-400">{walletIcon}</span>
            <span className="hidden sm:flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-xs font-mono text-white/70">{short}</span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`text-white/40 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}>
                <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </>
        ) : (
          <>
            {showLiveIndicator && (
              <span className="text-[10px] text-green-400 items-center gap-1 hidden sm:flex">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" /> Live
              </span>
            )}
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 sm:hidden" />
            <span className="text-[10px] sm:text-xs font-mono text-white/70">{short}</span>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`text-white/40 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}>
              <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </>
        )}
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 top-full mt-1.5 bg-[#1a1a1a] border border-white/[0.12] rounded-xl shadow-2xl z-[9999] overflow-hidden min-w-[180px] animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-2.5 border-b border-white/[0.06]">
            <div className="text-[10px] text-white/40 mb-0.5">{t("walletBtn.connected")}</div>
            <div className="text-xs font-mono text-white/80">{short}</div>
          </div>
          <button
            onClick={copyAddress}
            className="w-full px-3 py-2.5 text-left text-xs text-white/70 hover:bg-white/[0.06] flex items-center gap-2.5 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            {t("walletBtn.copyAddress")}
          </button>
          <button
            onClick={viewOnBscscan}
            className="w-full px-3 py-2.5 text-left text-xs text-white/70 hover:bg-white/[0.06] flex items-center gap-2.5 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            {t("walletBtn.viewBscscan")}
          </button>
          <div className="border-t border-white/[0.06]">
            <button
              onClick={handleDisconnect}
              className="w-full px-3 py-2.5 text-left text-xs text-red-400 hover:bg-red-500/[0.08] flex items-center gap-2.5 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              {t("walletBtn.disconnect")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}