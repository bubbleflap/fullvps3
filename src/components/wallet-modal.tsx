import React from "react";
import { createPortal } from "react-dom";
import { getAllProviders } from "../hooks/use-wallet";
import { useTranslation } from "@/lib/i18n";

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (provider: any) => void;
}

const WALLET_LIST = [
  { id: "metamask", name: "MetaMask", icon: "/images/wallets/metamask.png", detectKey: "isMetaMask", installUrl: "https://metamask.io/download/", deepLink: (url: string) => `https://metamask.app.link/dapp/${new URL(url).host}${new URL(url).pathname}?chainId=56` },
  { id: "trust", name: "Trust Wallet", icon: "/images/wallets/trust.png", detectKey: "isTrust", installUrl: "https://trustwallet.com/download", deepLink: (url: string) => `https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(url)}` },
  { id: "okx", name: "OKX Wallet", icon: "/images/wallets/okx.png", detectKey: "isOkxWallet", installUrl: "https://www.okx.com/web3", deepLink: (url: string) => `okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}&chainId=56` },
  { id: "coinbase", name: "Coinbase", icon: "/images/wallets/coinbase.png", detectKey: "isCoinbaseWallet", installUrl: "https://www.coinbase.com/wallet", deepLink: (url: string) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}&chainId=56` },
  { id: "safepal", name: "SafePal", icon: "/images/wallets/safepal.png", detectKey: "isSafePal", installUrl: "https://www.safepal.com/download", deepLink: null },
  { id: "tokenpocket", name: "TokenPocket", icon: "/images/wallets/tokenpocket.png", detectKey: "isTokenPocket", installUrl: "https://www.tokenpocket.pro/en/download/app", deepLink: null },
];

function findProviderForWallet(walletId: string, detectKey: string): any | null {
  const w = window as any;
  const detected = getAllProviders();

  if (walletId === "metamask") {
    const found = detected.find(p => p.provider?.isMetaMask && !p.provider?.isBraveWallet);
    if (found) return found.provider;
    if (w.ethereum?.isMetaMask && !w.ethereum?.isBraveWallet) return w.ethereum;
  }
  if (walletId === "trust") {
    const found = detected.find(p => p.provider?.isTrust || p.name.toLowerCase().includes("trust"));
    if (found) return found.provider;
    if (w.trustwallet?.ethereum) return w.trustwallet.ethereum;
  }
  if (walletId === "okx") {
    const found = detected.find(p => p.provider?.isOkxWallet || p.provider?.isOKExWallet);
    if (found) return found.provider;
    if (w.okxwallet) return w.okxwallet;
  }
  if (walletId === "coinbase") {
    const found = detected.find(p => p.name.toLowerCase().includes("coinbase"));
    if (found) return found.provider;
    if (w.coinbaseWalletExtension) return w.coinbaseWalletExtension;
  }
  if (walletId === "safepal") {
    if (w.safepalProvider) return w.safepalProvider;
  }
  if (walletId === "tokenpocket") {
    if (w.tokenpocket?.ethereum) return w.tokenpocket.ethereum;
  }

  if (detected.length === 1 && w.ethereum) {
    return w.ethereum;
  }

  return null;
}

export function WalletModal({ isOpen, onClose, onConnect }: WalletModalProps) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const handleWalletClick = (wallet: typeof WALLET_LIST[0]) => {
    const provider = findProviderForWallet(wallet.id, wallet.detectKey);
    if (provider) {
      onConnect(provider);
    } else if (isMobile && wallet.deepLink) {
      onClose();
      setTimeout(() => {
        window.location.href = wallet.deepLink!(window.location.href);
      }, 100);
    } else if (isMobile) {
      window.open(wallet.installUrl, "_blank");
      onClose();
    } else {
      window.open(wallet.installUrl, "_blank");
    }
  };

  const modalContent = (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={onClose} />
      <div style={{ position: "relative", width: "100%", maxWidth: "420px", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "24px", overflow: "hidden", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)" }}>
        <div style={{ padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
            <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#ffffff", margin: 0 }}>{t("walletBtn.connectWallet")}</h3>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: "4px" }}>
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {WALLET_LIST.map((wallet) => (
              <button
                key={wallet.id}
                onClick={() => handleWalletClick(wallet)}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px", borderRadius: "16px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", transition: "all 0.2s" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(245,166,35,0.5)"; e.currentTarget.style.background = "rgba(245,166,35,0.05)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              >
                <div style={{ width: "64px", height: "64px", borderRadius: "12px", background: "rgba(255,255,255,0.05)", padding: "8px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "8px" }}>
                  <img src={wallet.icon} alt={wallet.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                </div>
                <span style={{ fontWeight: 600, color: "#ffffff", fontSize: "14px" }}>{wallet.name}</span>
              </button>
            ))}
          </div>

          <div style={{ marginTop: "32px", paddingTop: "24px", borderTop: "1px solid rgba(255,255,255,0.05)", textAlign: "center" }}>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", margin: 0 }}>
              {t("walletBtn.termsNotice")}
              <br />
              {t("walletBtn.supportedNetwork")} <span style={{ color: "#f5a623", fontWeight: 700 }}>BSC BEP-20 (EVM)</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}