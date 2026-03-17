import { useState, useRef, useEffect, useCallback } from "react";
import { ethers } from "ethers";

export const BSC_CHAIN_ID = "0x38";
export const BSC_CHAIN_ID_DECIMAL = 56;
export const BSC_RPC = "https://bsc-dataseed.binance.org/";

const BSC_CHAIN_PARAMS = {
  chainId: BSC_CHAIN_ID,
  chainName: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: ["https://bsc-dataseed.binance.org/", "https://bsc-dataseed1.defibit.io/", "https://bsc-dataseed1.ninicoin.io/"],
  blockExplorerUrls: ["https://bscscan.com/"]
};

export function getAllProviders() {
  const w = window as any;
  const providers: { provider: any; name: string; icon: string }[] = [];

  const icons = {
    metamask: "/images/wallets/metamask.png",
    trust: "/images/wallets/trust.png",
    okx: "/images/wallets/okx.png",
    binance: "/images/wallets/binance.png",
    coinbase: "/images/wallets/coinbase.png",
    safepal: "/images/wallets/safepal.png",
    tokenpocket: "/images/wallets/tokenpocket.png",
    bitkeep: "/images/wallets/bitget.png",
    coin98: "/images/wallets/coin98.png",
    rabby: "/images/wallets/rabby.png",
    unknown: "/images/wallets/walletconnect.png"
  };

  if (w.ethereum?.providers && Array.isArray(w.ethereum.providers)) {
    for (const p of w.ethereum.providers) {
      if (p.isOkxWallet || p.isOKExWallet) providers.push({ provider: p, name: "OKX Wallet", icon: icons.okx });
      else if (p.isMetaMask && !p.isBraveWallet) providers.push({ provider: p, name: "MetaMask", icon: icons.metamask });
      else if (p.isTrust) providers.push({ provider: p, name: "Trust Wallet", icon: icons.trust });
      else if (p.isBinance) providers.push({ provider: p, name: "Binance Wallet", icon: icons.binance });
      else if (p.request) providers.push({ provider: p, name: "Web3 Wallet", icon: icons.unknown });
    }
  }

  if (w.okxwallet && !providers.find(p => p.name.toLowerCase().includes("okx"))) providers.push({ provider: w.okxwallet, name: "OKX Wallet", icon: icons.okx });
  if (w.BinanceChain && !providers.find(p => p.name.toLowerCase().includes("binance"))) providers.push({ provider: w.BinanceChain, name: "Binance Wallet", icon: icons.binance });
  if (w.trustwallet?.ethereum && !providers.find(p => p.name.toLowerCase().includes("trust"))) providers.push({ provider: w.trustwallet.ethereum, name: "Trust Wallet", icon: icons.trust });
  if (w.ethereum && !providers.find(p => p.provider === w.ethereum)) {
    const name = w.ethereum.isMetaMask ? "MetaMask" : w.ethereum.isOkxWallet ? "OKX Wallet" : w.ethereum.isTrust ? "Trust Wallet" : "Web3 Wallet";
    const iconKey = w.ethereum.isMetaMask ? "metamask" : w.ethereum.isOkxWallet ? "okx" : w.ethereum.isTrust ? "trust" : "unknown";
    providers.push({ provider: w.ethereum, name, icon: icons[iconKey as keyof typeof icons] });
  }
  if (w.bitkeep?.ethereum) providers.push({ provider: w.bitkeep.ethereum, name: "Bitget Wallet", icon: icons.bitkeep });
  if (w.coin98?.provider) providers.push({ provider: w.coin98.provider, name: "Coin98", icon: icons.coin98 });
  if (w.safepalProvider) providers.push({ provider: w.safepalProvider, name: "SafePal", icon: icons.safepal });
  if (w.tokenpocket?.ethereum) providers.push({ provider: w.tokenpocket.ethereum, name: "TokenPocket", icon: icons.tokenpocket });
  if (w.coinbaseWalletExtension) providers.push({ provider: w.coinbaseWalletExtension, name: "Coinbase Wallet", icon: icons.coinbase });

  const seen = new Set();
  return providers.filter(p => {
    if (seen.has(p.provider)) return false;
    seen.add(p.provider);
    return true;
  });
}

function normalizeChainId(chainId: string): string {
  if (!chainId) return "";
  if (chainId.startsWith("0x")) return chainId.toLowerCase();
  return "0x" + parseInt(chainId, 10).toString(16);
}

async function forceBscChain(provider: any): Promise<boolean> {
  try {
    const currentChain = await provider.request({ method: "eth_chainId" });
    if (normalizeChainId(currentChain) === BSC_CHAIN_ID) return true;
  } catch (e) {}

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BSC_CHAIN_ID }],
    });
    return true;
  } catch (switchErr: any) {
    if (switchErr.code === 4902 || switchErr.code === -32603) {
      try {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [BSC_CHAIN_PARAMS]
        });
        return true;
      } catch (addErr) {
        return false;
      }
    }
    if (switchErr.code === 4001) return false;
    return false;
  }
}

const WALLET_STORAGE_KEY = "bflap_wallet_address";

export function useWallet() {
  const [address, setAddress] = useState<string>(() => {
    try { return localStorage.getItem(WALLET_STORAGE_KEY) || ""; } catch { return ""; }
  });
  const [chainId, setChainId] = useState<string>("");
  const [pendingWallet, setPendingWallet] = useState<string | null>(null);
  const providerRef = useRef<any>(null);
  const addressRef = useRef<string>(address);

  useEffect(() => { addressRef.current = address; }, [address]);

  useEffect(() => {
    try {
      if (address) localStorage.setItem(WALLET_STORAGE_KEY, address);
      else localStorage.removeItem(WALLET_STORAGE_KEY);
    } catch {}
  }, [address]);

  const connect = useCallback(async (preferredProvider?: any) => {
    try {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const allProviders = getAllProviders();

      if (allProviders.length === 0) {
        if (!isMobile) {
          alert("Please install a BSC-compatible wallet like MetaMask, Trust Wallet, or OKX.");
        }
        return null;
      }

      let chosen = preferredProvider || allProviders[0].provider;

      let accounts: string[];
      try {
        const timeoutMs = isMobile ? 30000 : 60000;
        try {
          await Promise.race([
            chosen.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] }),
            new Promise<any>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))
          ]);
        } catch (permErr: any) {
          if (permErr.code === 4001) return null;
        }
        accounts = await Promise.race([
          chosen.request({ method: "eth_requestAccounts" }),
          new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs))
        ]);
      } catch (err: any) {
        if (err.code === 4001) return null;
        if (err.message === "timeout") return null;
        return null;
      }

      if (!accounts?.[0]) return null;

      const switched = await forceBscChain(chosen);
      if (!switched) {
        alert("This app requires BNB Smart Chain (BSC). Please switch to BSC in your wallet and try again.");
        return null;
      }

      const finalChain = await chosen.request({ method: "eth_chainId" });
      if (finalChain !== BSC_CHAIN_ID) {
        alert("Failed to switch to BSC. Please manually switch your wallet to BNB Smart Chain and reconnect.");
        return null;
      }

      providerRef.current = chosen;
      const newAddr = accounts[0].toLowerCase();
      setAddress(newAddr);
      setChainId(finalChain);
      return { address: newAddr, provider: chosen };
    } catch (err: any) {
      console.error("Connection error", err);
    }
    return null;
  }, []);

  const disconnect = useCallback(() => {
    setAddress("");
    providerRef.current = null;
    setPendingWallet(null);
  }, []);

  const approvePendingWallet = useCallback(() => {
    if (pendingWallet) {
      setAddress(pendingWallet);
      setPendingWallet(null);
    }
  }, [pendingWallet]);

  const rejectPendingWallet = useCallback(() => {
    setPendingWallet(null);
  }, []);

  const handleChainChanged = useCallback((hexId: string) => {
    setChainId(normalizeChainId(hexId));
  }, []);

  useEffect(() => {
    const providers = getAllProviders();
    if (providers.length > 0) {
      const p = providers[0].provider;

      p.on?.("accountsChanged", (accounts: string[]) => {
        if (accounts.length > 0) {
          const newAddr = accounts[0].toLowerCase();
          const currentAddr = addressRef.current.toLowerCase();
          if (currentAddr && newAddr !== currentAddr) {
            setPendingWallet(newAddr);
          } else if (currentAddr) {
            setAddress(newAddr);
          }
        }
      });
      p.on?.("chainChanged", handleChainChanged);
    }
  }, []);

  return { address, chainId, connect, disconnect, provider: providerRef.current, pendingWallet, approvePendingWallet, rejectPendingWallet };
}