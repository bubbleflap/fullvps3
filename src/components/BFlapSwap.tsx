import { useState, useEffect, useRef, useCallback } from "react";
import { Settings, X, Search, Loader2, ChevronDown, Wallet, MessageCircle, BarChart3, Copy, ExternalLink, HelpCircle, ArrowLeftRight } from "lucide-react";
import { useLang } from "../lib/i18n";
import HowItWorks from "./HowItWorks";

interface TokenOption {
  symbol: string;
  name: string;
  image: string;
  address?: string;
  graduated?: boolean;
  mcap?: number;
  price?: number;
  taxRate?: number;
  holders?: number;
}

interface QuoteResult {
  router: string;
  routerName: string;
  routerAddress: string;
  outputAmount: number;
  currentPrice: number;
  currentPriceUsd: number;
  priceImpact: number;
  fee: string;
  taxRate: string;
  bondProgress: number;
  graduated: boolean;
  bnbPrice: number;
  mcap: number;
  error?: string;
}

const BNB_TOKEN: TokenOption = {
  symbol: "BNB",
  name: "BNB Chain",
  image: "https://flap.sh/bnb.svg",
};

function formatNum(n: number, decimals = 4): string {
  if (!n || isNaN(n)) return "0";
  if (n < 0.000001) return n.toExponential(2);
  if (n < 1) return n.toFixed(Math.min(decimals, 8));
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(decimals);
}

export interface SwapInitialToken {
  address: string;
  name: string;
  ticker: string;
  image: string;
}

interface BFlapSwapProps {
  initialToken?: SwapInitialToken;
}

export default function BFlapSwap({ initialToken }: BFlapSwapProps) {
  const { t } = useLang();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState<TokenOption | null>({
    symbol: "BFLAP",
    name: "BubbleFlap",
    image: "/assets/bflap-logo.png",
    address: "0xa2320fff1069ED5b4B02dDb386823E837A7e7777",
    graduated: false,
    mcap: 0,
    price: 0,
    taxRate: 3,
    holders: 0,
  });
  const [slippage, setSlippage] = useState("15.00");
  const [showSettings, setShowSettings] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [showTokenSelect, setShowTokenSelect] = useState(false);
  const [tokenSearch, setTokenSearch] = useState("");
  const [apiTokens, setApiTokens] = useState<TokenOption[]>([]);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [showHowToUse, setShowHowToUse] = useState(false);
  const [bnbPrice, setBnbPrice] = useState(0);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/swap/tokens")
      .then(res => res.json())
      .then(data => {
        if (data.tokens) {
          const mapped: TokenOption[] = data.tokens.map((tk: any) => ({
            symbol: tk.ticker || tk.name,
            name: tk.name,
            image: tk.image || "",
            address: tk.address,
            graduated: tk.graduated,
            mcap: tk.mcap,
            price: tk.price,
            taxRate: tk.taxRate,
            holders: tk.holders,
          }));
          setApiTokens(mapped);
        }
        if (data.bnbPrice) setBnbPrice(data.bnbPrice);
        if (data.tokens && data.tokens.length > 0 && !selectedToken) {
          const first = data.tokens[0];
          setSelectedToken({
            symbol: first.ticker || first.name,
            name: first.name,
            image: first.image || "",
            address: first.address,
            graduated: first.graduated,
            mcap: first.mcap,
            price: first.price,
            taxRate: first.taxRate,
            holders: first.holders,
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!initialToken?.address) return;
    setSelectedToken({
      symbol: initialToken.ticker || initialToken.name,
      name: initialToken.name,
      image: initialToken.image || "",
      address: initialToken.address,
      graduated: true,
      mcap: 0,
      price: 0,
      taxRate: 0,
      holders: 0,
    });
    setSide("buy");
    fetch(`/api/swap/token-info?address=${initialToken.address}`)
      .then(res => res.json())
      .then(data => {
        if (data && !data.error) {
          setSelectedToken(prev => prev && prev.address === initialToken.address ? {
            ...prev,
            mcap: data.mcap || 0,
            price: data.price || 0,
            taxRate: data.taxRate || 0,
            holders: data.holders || 0,
            graduated: data.graduated ?? true,
            image: data.image || prev.image,
          } : prev);
        }
      })
      .catch(() => {});
  }, [initialToken?.address]);

  const BSC_CHAIN_ID = "0x38";
  const BSC_CHAIN_CONFIG = {
    chainId: BSC_CHAIN_ID,
    chainName: "BNB Smart Chain",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    rpcUrls: ["https://bsc-dataseed.binance.org/"],
    blockExplorerUrls: ["https://bscscan.com/"],
  };

  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [bnbBalance, setBnbBalance] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<string | null>(null);
  const rawTokenBalanceRef = useRef<number>(0);

  const detectWallets = useCallback(() => {
    const w = window as any;
    const wallets: { id: string; name: string; icon: string; provider: any }[] = [];

    if (w.ethereum?.isMetaMask) {
      wallets.push({ id: "metamask", name: "MetaMask", icon: "🦊", provider: w.ethereum });
    }
    if (w.trustwallet?.isTrust || w.ethereum?.isTrust) {
      wallets.push({ id: "trust", name: "Trust Wallet", icon: "🛡️", provider: w.trustwallet || w.ethereum });
    }
    if (w.BinanceChain) {
      wallets.push({ id: "binance", name: "Binance Wallet", icon: "💛", provider: w.BinanceChain });
    }
    if (w.okxwallet) {
      wallets.push({ id: "okx", name: "OKX Wallet", icon: "⚡", provider: w.okxwallet });
    }
    if (w.ethereum && !w.ethereum.isMetaMask && !w.ethereum.isTrust) {
      wallets.push({ id: "injected", name: "Browser Wallet", icon: "🌐", provider: w.ethereum });
    }
    if (wallets.length === 0 && w.ethereum) {
      wallets.push({ id: "ethereum", name: "Web3 Wallet", icon: "🔗", provider: w.ethereum });
    }
    return wallets;
  }, []);

  const switchToBSC = useCallback(async (provider: any) => {
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CHAIN_ID }] });
    } catch (err: any) {
      if (err.code === 4902) {
        await provider.request({ method: "wallet_addEthereumChain", params: [BSC_CHAIN_CONFIG] });
      } else {
        throw err;
      }
    }
  }, []);

  const fetchBnbBalance = useCallback(async (provider: any, address: string) => {
    try {
      const bal = await provider.request({ method: "eth_getBalance", params: [address, "latest"] });
      const bnb = parseInt(bal, 16) / 1e18;
      setBnbBalance(bnb.toFixed(3));
    } catch {
      setBnbBalance(null);
    }
  }, []);

  const fetchTokenBalance = useCallback(async (provider: any, address: string, tokenAddr: string) => {
    try {
      const data = "0x70a08231" + address.replace("0x", "").padStart(64, "0");
      const result = await provider.request({
        method: "eth_call",
        params: [{ to: tokenAddr, data }, "latest"],
      });
      const bal = parseInt(result, 16) / 1e18;
      rawTokenBalanceRef.current = bal;
      if (bal >= 1e9) setTokenBalance((bal / 1e9).toFixed(1) + "B");
      else if (bal >= 1e6) setTokenBalance((bal / 1e6).toFixed(1) + "M");
      else if (bal >= 1e3) setTokenBalance((bal / 1e3).toFixed(1) + "K");
      else setTokenBalance(bal.toFixed(1));
    } catch {
      rawTokenBalanceRef.current = 0;
      setTokenBalance(null);
    }
  }, []);

  useEffect(() => {
    if (walletAddress && selectedToken?.address) {
      const w = window as any;
      const provider = w.ethereum;
      if (provider) fetchTokenBalance(provider, walletAddress, selectedToken.address);
    } else {
      setTokenBalance(null);
    }
  }, [walletAddress, selectedToken, fetchTokenBalance]);

  const connectWallet = useCallback(async (provider: any) => {
    setWalletConnecting(true);
    setWalletError(null);
    try {
      await switchToBSC(provider);
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      if (accounts && accounts.length > 0) {
        setWalletAddress(accounts[0]);
        setShowWalletModal(false);
        fetchBnbBalance(provider, accounts[0]);
        provider.on?.("accountsChanged", (accs: string[]) => {
          if (accs.length === 0) { setWalletAddress(null); setBnbBalance(null); }
          else { setWalletAddress(accs[0]); fetchBnbBalance(provider, accs[0]); }
        });
        provider.on?.("chainChanged", () => { window.location.reload(); });
      }
    } catch (err: any) {
      setWalletError(err.message || "Connection failed");
    } finally {
      setWalletConnecting(false);
    }
  }, [switchToBSC, fetchBnbBalance]);

  const disconnectWallet = useCallback(() => {
    setWalletAddress(null);
    setBnbBalance(null);
  }, []);

  const [txPending, setTxPending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
  const FLAP_PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
  const PANCAKE_V2 = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
  const PLATFORM_FEE_WALLET = "0xe7d9770e0c217c508b19aedb245c1476f4360bc6";
  const PLATFORM_FEE_PCT = 0.01;

  const toHex = (val: number | string) => "0x" + BigInt(Math.floor(Number(val))).toString(16);
  const toWei = (bnb: string) => "0x" + BigInt(Math.floor(parseFloat(bnb) * 1e18)).toString(16);

  const encodeFunctionCall = (sig: string, params: string[]) => {
    const hash = sig.split("").reduce((h, c) => { h = ((h << 5) - h) + c.charCodeAt(0); return h & h; }, 0);
    void hash;
    return sig + params.map(p => p.replace("0x", "").padStart(64, "0")).join("");
  };

  const executeSwap = useCallback(async () => {
    if (!walletAddress || !selectedToken?.address || !amount || !quote) return;
    const provider = (window as any).ethereum || (window as any).trustwallet || (window as any).BinanceChain || (window as any).okxwallet;
    if (!provider) return;

    setTxPending(true);
    setTxHash(null);
    setTxError(null);

    try {
      const slippageFactor = 1 - parseFloat(slippage) / 100;
      const tokenAddr = selectedToken.address;
      const inputBnb = parseFloat(amount);

      if (side === "buy") {
        const feeBnbWei = "0x" + BigInt(Math.floor(inputBnb * PLATFORM_FEE_PCT * 1e18)).toString(16);
        await provider.request({
          method: "eth_sendTransaction",
          params: [{
            from: walletAddress,
            to: PLATFORM_FEE_WALLET,
            value: feeBnbWei,
            gas: toHex(21000),
          }],
        });
      } else {
        const feeTokenWei = BigInt(Math.floor(parseFloat(amount) * PLATFORM_FEE_PCT * 1e18));
        const transferData = "0xa9059cbb" +
          PLATFORM_FEE_WALLET.replace("0x", "").padStart(64, "0") +
          feeTokenWei.toString(16).padStart(64, "0");
        await provider.request({
          method: "eth_sendTransaction",
          params: [{
            from: walletAddress,
            to: tokenAddr,
            data: transferData,
            gas: toHex(100000),
          }],
        });
      }
      await new Promise(r => setTimeout(r, 2000));

      const swapAmount = side === "buy" ? (inputBnb * (1 - PLATFORM_FEE_PCT)).toString() : amount;

      if (quote.router === "flap") {
        if (side === "buy") {
          const buyData = "0xf088d547" +
            tokenAddr.replace("0x", "").padStart(64, "0") +
            "0".padStart(64, "0");

          const txHash = await provider.request({
            method: "eth_sendTransaction",
            params: [{
              from: walletAddress,
              to: FLAP_PORTAL,
              value: toWei(swapAmount),
              data: buyData,
              gas: toHex(300000),
            }],
          });
          setTxHash(txHash);
        } else {
          const tokenAmountWei = BigInt(Math.floor(parseFloat(amount) * 1e18));
          const approveData = "0x095ea7b3" +
            FLAP_PORTAL.replace("0x", "").padStart(64, "0") +
            tokenAmountWei.toString(16).padStart(64, "0");

          await provider.request({
            method: "eth_sendTransaction",
            params: [{
              from: walletAddress,
              to: tokenAddr,
              data: approveData,
              gas: toHex(100000),
            }],
          });

          await new Promise(r => setTimeout(r, 3000));

          const sellData = "0x6dfa8d99" +
            tokenAddr.replace("0x", "").padStart(64, "0") +
            tokenAmountWei.toString(16).padStart(64, "0");

          const txHash = await provider.request({
            method: "eth_sendTransaction",
            params: [{
              from: walletAddress,
              to: FLAP_PORTAL,
              data: sellData,
              gas: toHex(300000),
            }],
          });
          setTxHash(txHash);
        }
      } else {
        const deadline = toHex(Math.floor(Date.now() / 1000) + 1200);

        if (side === "buy") {
          const minOut = BigInt(Math.floor(quote.outputAmount * slippageFactor * 1e18));
          const swapData = "0x7ff36ab5" +
            minOut.toString(16).padStart(64, "0") +
            "80".padStart(64, "0") +
            walletAddress.replace("0x", "").padStart(64, "0") +
            deadline.replace("0x", "").padStart(64, "0") +
            "02".padStart(64, "0") +
            WBNB.replace("0x", "").padStart(64, "0") +
            tokenAddr.replace("0x", "").padStart(64, "0");

          const txHash = await provider.request({
            method: "eth_sendTransaction",
            params: [{
              from: walletAddress,
              to: PANCAKE_V2,
              value: toWei(swapAmount),
              data: swapData,
              gas: toHex(350000),
            }],
          });
          setTxHash(txHash);
        } else {
          const tokenAmountWei = BigInt(Math.floor(parseFloat(amount) * 1e18));
          const approveData = "0x095ea7b3" +
            PANCAKE_V2.replace("0x", "").padStart(64, "0") +
            tokenAmountWei.toString(16).padStart(64, "0");

          await provider.request({
            method: "eth_sendTransaction",
            params: [{
              from: walletAddress,
              to: tokenAddr,
              data: approveData,
              gas: toHex(100000),
            }],
          });

          await new Promise(r => setTimeout(r, 3000));

          const minBnbOut = BigInt(Math.floor(quote.outputAmount * slippageFactor * 1e18));
          const sellData = "0x18cbafe5" +
            tokenAmountWei.toString(16).padStart(64, "0") +
            minBnbOut.toString(16).padStart(64, "0") +
            "a0".padStart(64, "0") +
            walletAddress.replace("0x", "").padStart(64, "0") +
            deadline.replace("0x", "").padStart(64, "0") +
            "02".padStart(64, "0") +
            tokenAddr.replace("0x", "").padStart(64, "0") +
            WBNB.replace("0x", "").padStart(64, "0");

          const txHash = await provider.request({
            method: "eth_sendTransaction",
            params: [{
              from: walletAddress,
              to: PANCAKE_V2,
              data: sellData,
              gas: toHex(350000),
            }],
          });
          setTxHash(txHash);
        }
      }

      if (provider.request) {
        setTimeout(() => fetchBnbBalance(provider, walletAddress), 5000);
      }
    } catch (err: any) {
      if (err.code === 4001) {
        setTxError("Transaction rejected");
      } else {
        setTxError(err.message || "Transaction failed");
      }
    } finally {
      setTxPending(false);
    }
  }, [walletAddress, selectedToken, amount, quote, side, slippage, fetchBnbBalance]);

  useEffect(() => {
    const w = window as any;
    if (w.ethereum) {
      w.ethereum.request?.({ method: "eth_accounts" }).then((accounts: string[]) => {
        if (accounts && accounts.length > 0) {
          w.ethereum.request({ method: "eth_chainId" }).then((chainId: string) => {
            if (chainId === BSC_CHAIN_ID) {
              setWalletAddress(accounts[0]);
              fetchBnbBalance(w.ethereum, accounts[0]);
            }
          });
        }
      }).catch(() => {});
    }
  }, [fetchBnbBalance]);

  const filteredTokens = apiTokens.filter(tk => {
    if (!tokenSearch) return true;
    const s = tokenSearch.toLowerCase();
    return tk.symbol.toLowerCase().includes(s) || tk.name.toLowerCase().includes(s) || (tk.address && tk.address.toLowerCase().includes(s));
  });

  const fetchQuote = useCallback(async (inputAmount: string) => {
    if (!inputAmount || parseFloat(inputAmount) <= 0 || !selectedToken?.address) {
      setQuote(null);
      return;
    }
    setQuoteLoading(true);
    try {
      const resp = await fetch(`/api/swap/quote?tokenAddress=${selectedToken.address}&inputAmount=${inputAmount}&direction=${side}`);
      const data = await resp.json();
      if (data.error && data.router === "unknown") {
        setQuote(null);
      } else {
        setQuote(data);
      }
    } catch {
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }, [selectedToken, side]);

  const handleAmountChange = (val: string) => {
    const cleaned = val.replace(/[^0-9.]/g, "");
    setAmount(cleaned);
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(() => fetchQuote(cleaned), 500);
  };

  const handleReset = () => {
    setAmount("");
    setQuote(null);
  };

  const handlePercentage = (pct: number) => {
    let base = 0;
    if (side === "buy") {
      base = bnbBalance ? parseFloat(bnbBalance) : 0;
    } else {
      base = rawTokenBalanceRef.current;
    }
    if (base <= 0) {
      const current = parseFloat(amount) || 0;
      if (current <= 0) return;
      base = current;
    }
    const newVal = (base * pct / 100).toString();
    setAmount(newVal);
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(() => fetchQuote(newVal), 300);
  };

  const handleTokenSelect = (token: TokenOption) => {
    setSelectedToken(token);
    setShowTokenSelect(false);
    setTokenSearch("");
    setAmount("");
    setQuote(null);
  };

  const handleSideChange = (newSide: "buy" | "sell") => {
    setSide(newSide);
    setAmount("");
    setQuote(null);
  };

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const inGear = settingsRef.current?.contains(e.target as Node);
      const inPanel = settingsPanelRef.current?.contains(e.target as Node);
      if (!inGear && !inPanel) {
        setShowSettings(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (amount && selectedToken?.address) {
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
      quoteTimer.current = setTimeout(() => fetchQuote(amount), 500);
    }
  }, [side]);

  const outputLabel = side === "buy"
    ? quote ? `${t.youReceive as string} ${formatNum(quote.outputAmount)} ${selectedToken?.symbol || ""}` : ""
    : quote ? `${t.youReceive as string} ${formatNum(quote.outputAmount, 6)} BNB` : "";

  const outputUsd = quote
    ? side === "buy"
      ? quote.currentPriceUsd ? `~$${formatNum(quote.outputAmount * quote.currentPriceUsd, 2)}` : ""
      : bnbPrice ? `~$${formatNum(quote.outputAmount * bnbPrice, 2)}` : ""
    : "";

  return (
    <div className="absolute inset-0 overflow-y-auto px-4 flex flex-col pt-[140px] sm:pt-[120px] lg:pt-[90px] pb-40">
      <div className="w-full max-w-[400px] mx-auto my-auto flex-shrink-0">
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="text-[#00d4aa]" size={20} />
            BFlapSwap
          </h2>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`btn-jelly flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${
              showSettings
                ? "bg-[#5b31fe] text-white border-[#5b31fe]/60"
                : "bg-white/5 text-white/60 hover:text-white border-white/10 hover:border-white/20"
            }`}
          >
            <Settings size={13} />
            Slippage %
          </button>
        </div>
        <div className="bg-[#1a1a2e]/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl shadow-black/50 overflow-hidden">

          <div className="flex p-1 mx-3 mt-3 bg-[#0d0d1a] rounded-xl">
            <button
              onClick={() => handleSideChange("buy")}
              className={`btn-jelly no-scale flex-1 py-2.5 text-sm font-bold rounded-full transition-all ${
                side === "buy" ? "bg-[#00d4aa] text-black" : "text-white/40 hover:text-white/60"
              }`}
            >
              {t.buy as string}
            </button>
            <button
              onClick={() => handleSideChange("sell")}
              className={`btn-jelly no-scale flex-1 py-2.5 text-sm font-bold rounded-full transition-all ${
                side === "sell" ? "bg-red-500/90 text-white" : "text-white/40 hover:text-white/60"
              }`}
            >
              {t.sell as string}
            </button>
          </div>

          {side === "buy" ? (
            <>
              <div className="p-3 pt-2 pb-1">
                <div className="flex items-center gap-3 bg-[#0d0d1a] rounded-xl px-4 py-3 border border-white/5">
                  <img src="https://flap.sh/bnb.svg" alt="BNB" className="w-7 h-7 rounded-full" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">BNB</span>
                      {walletAddress && bnbBalance && (
                        <span className="text-[10px] text-white/30">{bnbBalance} BNB</span>
                      )}
                    </div>
                    <div className="text-[11px] text-white/40">
                      {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "BNB Chain"}
                    </div>
                  </div>
                  {walletAddress && (
                    <button onClick={disconnectWallet} className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors mr-1">
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
              <div className="px-3 pb-2">
                <button
                  onClick={() => setShowTokenSelect(true)}
                  className="w-full flex items-center gap-3 bg-[#0d0d1a] hover:bg-[#151528] rounded-xl px-4 py-3 transition-colors border border-white/5"
                >
                  {selectedToken ? (
                    <>
                      <img src={selectedToken.image} alt={selectedToken.symbol} className="w-7 h-7 rounded-full" onError={(e) => { (e.target as HTMLImageElement).src = "/assets/bot.png"; }} />
                      <div className="text-left flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{selectedToken.symbol}</span>
                          {selectedToken.mcap ? <span className="text-[10px] text-white/30">${formatNum(selectedToken.mcap, 0)}</span> : null}
                        </div>
                        <div className="text-[11px] text-white/40 truncate">{selectedToken.name}</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-7 h-7 rounded-full bg-[#5b31fe]/20 flex items-center justify-center">
                        <span className="text-[#5b31fe] text-xs font-bold">?</span>
                      </div>
                      <span className="text-sm font-bold text-[#5b31fe] flex-1">{t.selectToken as string}</span>
                    </>
                  )}
                  <ChevronDown size={14} className="text-white/30" />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="p-3 pt-2 pb-1">
                <button
                  onClick={() => setShowTokenSelect(true)}
                  className="w-full flex items-center gap-3 bg-[#0d0d1a] hover:bg-[#151528] rounded-xl px-4 py-3 transition-colors border border-white/5"
                >
                  {selectedToken ? (
                    <>
                      <img src={selectedToken.image} alt={selectedToken.symbol} className="w-7 h-7 rounded-full" onError={(e) => { (e.target as HTMLImageElement).src = "/assets/bot.png"; }} />
                      <div className="text-left flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{selectedToken.symbol}</span>
                          {selectedToken.mcap ? <span className="text-[10px] text-white/30">${formatNum(selectedToken.mcap, 0)}</span> : null}
                        </div>
                        <div className="text-[11px] text-white/40 truncate">{selectedToken.name}</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-7 h-7 rounded-full bg-[#5b31fe]/20 flex items-center justify-center">
                        <span className="text-[#5b31fe] text-xs font-bold">?</span>
                      </div>
                      <span className="text-sm font-bold text-[#5b31fe] flex-1">{t.selectToken as string}</span>
                    </>
                  )}
                  <ChevronDown size={14} className="text-white/30" />
                </button>
              </div>
              <div className="px-3 pb-2">
                <div className="flex items-center gap-3 bg-[#0d0d1a] rounded-xl px-4 py-3 border border-white/5">
                  <img src="https://flap.sh/bnb.svg" alt="BNB" className="w-7 h-7 rounded-full" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">BNB</span>
                      {walletAddress && bnbBalance && (
                        <span className="text-[10px] text-white/30">{bnbBalance} BNB</span>
                      )}
                    </div>
                    <div className="text-[11px] text-white/40">
                      {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "BNB Chain"}
                    </div>
                  </div>
                  {walletAddress && (
                    <button onClick={disconnectWallet} className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors mr-1">
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {selectedToken && (
            <div className="px-3 pb-2">
              <div className="bg-[#0d0d1a] rounded-xl p-4 border border-white/5">
                <div className="flex items-center gap-3 mb-3">
                  {side === "buy" ? (
                    <>
                      <img src="https://flap.sh/bnb.svg" alt="BNB" className="w-10 h-10 rounded-full" />
                      <div className="flex-1 min-w-0">
                        <div className="text-lg font-bold text-white">BNB</div>
                      </div>
                      {walletAddress && bnbBalance && (
                        <span className="text-sm font-bold text-white/50">{bnbBalance} BNB</span>
                      )}
                    </>
                  ) : (
                    <>
                      <img src={selectedToken.image} alt="" className="w-10 h-10 rounded-full" onError={(e) => { (e.target as HTMLImageElement).src = "/assets/bot.png"; }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-lg font-bold text-white truncate">{selectedToken.name}</div>
                      </div>
                      {walletAddress && tokenBalance && (
                        <span className="text-sm font-bold text-white/50">{tokenBalance}</span>
                      )}
                    </>
                  )}
                </div>

                <input
                  type="text"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder={side === "buy" ? `0.00 (BNB)` : `0.00 (${selectedToken.symbol})`}
                  className="w-full bg-[#151528] text-white text-lg font-mono font-bold rounded-lg px-4 py-3 outline-none border border-white/5 focus:border-[#5b31fe] placeholder-white/20 mb-3"
                />

                <div className="flex gap-1.5 mb-3">
                  <button
                    onClick={handleReset}
                    className="btn-jelly px-3 py-1.5 text-xs font-bold rounded-full bg-[#2a2a3e] text-white/50 hover:text-white transition-colors"
                  >
                    {t.reset as string}
                  </button>
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => handlePercentage(pct)}
                      className="btn-jelly flex-1 py-1.5 text-xs font-bold rounded-full bg-[#2a2a3e] text-white/50 hover:text-white transition-colors"
                    >
                      {pct}%
                    </button>
                  ))}
                </div>

                {quoteLoading && (
                  <div className="flex items-center justify-center gap-2 py-2">
                    <Loader2 size={16} className="animate-spin text-[#5b31fe]" />
                    <span className="text-xs text-white/40">{t.calculating as string}</span>
                  </div>
                )}

                {quote && !quoteLoading && (
                  <div className="bg-[#151528] rounded-lg px-4 py-3 border border-[#00d4aa]/20">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-white/30">{t.youReceive as string}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#5b31fe]/15 text-[#5b31fe] font-bold">{quote.routerName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {side === "buy" ? (
                          <img src={selectedToken.image} alt="" className="w-5 h-5 rounded-full" onError={(e) => { (e.target as HTMLImageElement).src = "/assets/bot.png"; }} />
                        ) : (
                          <img src="https://flap.sh/bnb.svg" alt="BNB" className="w-5 h-5 rounded-full" />
                        )}
                        <span className="text-base font-bold text-[#00d4aa]">
                          {side === "buy" ? `${formatNum(quote.outputAmount)} ${selectedToken.symbol}` : `${formatNum(quote.outputAmount, 6)} BNB`}
                        </span>
                      </div>
                      {outputUsd && <span className="text-[11px] text-white/30">{outputUsd}</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {showSettings && (
            <div ref={settingsPanelRef} className="mx-3 mb-2 bg-[#0d0d1a] rounded-xl p-3 border border-white/10">
              <div className="text-xs text-white/60 mb-2 font-medium">{t.slippageTolerance as string}</div>
              <div className="flex gap-1.5">
                {["0.50", "3.00", "5.00", "15.00"].map((val) => (
                  <button
                    key={val}
                    onClick={() => setSlippage(val)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                      slippage === val ? "bg-[#5b31fe] text-white" : "bg-[#2a2a3e] text-white/50 hover:text-white"
                    }`}
                  >
                    {val}%
                  </button>
                ))}
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="w-full bg-[#2a2a3e] text-white text-xs font-bold rounded-lg py-1.5 px-2 text-center outline-none border border-transparent focus:border-[#5b31fe]"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 text-xs">%</span>
                </div>
              </div>
            </div>
          )}

          {txHash && (
            <div className="mx-3 mb-2 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">
              <div className="text-xs text-green-400 font-bold mb-1">Transaction Sent!</div>
              <a
                href={`https://bscscan.com/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-[#5b31fe] hover:underline font-mono break-all"
              >
                {txHash.slice(0, 16)}...{txHash.slice(-8)} ↗
              </a>
            </div>
          )}

          {txError && (
            <div className="mx-3 mb-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              <div className="text-xs text-red-400">{txError}</div>
            </div>
          )}

          <div className="px-3 pb-3">
            {!walletAddress ? (
              <button
                onClick={() => setShowWalletModal(true)}
                className="btn-jelly w-full font-bold py-3.5 rounded-full text-base transition-colors flex items-center justify-center gap-2 shadow-lg bg-[#5b31fe] hover:bg-[#6b41ff] text-white"
              >
                <Wallet size={18} />
                {t.connectWallet as string}
              </button>
            ) : (
              <button
                onClick={executeSwap}
                disabled={txPending || !selectedToken || !amount || parseFloat(amount) <= 0 || !quote}
                className={`btn-jelly w-full font-bold py-3.5 rounded-full text-base transition-colors flex items-center justify-center gap-2 shadow-lg ${
                  txPending || !selectedToken || !amount || parseFloat(amount) <= 0 || !quote
                    ? "bg-[#2a2a3e] text-white/30 cursor-not-allowed"
                    : side === "buy"
                      ? "bg-[#00d4aa] hover:bg-[#00e4bb] text-black"
                      : "bg-red-500 hover:bg-red-400 text-white"
                }`}
              >
                {txPending ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Confirming...
                  </>
                ) : (
                  side === "buy" ? (t.buy as string) : (t.sell as string)
                )}
              </button>
            )}
          </div>
        </div>

        {selectedToken && (
          <div className="mt-2 bg-[#1a1a2e]/80 rounded-xl p-3 border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <img src={selectedToken.image} alt="" className="w-5 h-5 rounded-full" onError={(e) => { (e.target as HTMLImageElement).src = "/assets/bot.png"; }} />
                <span className="text-xs font-bold text-white">{selectedToken.symbol}</span>
                {quote ? (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${quote.graduated ? "bg-green-500/20 text-green-400" : "bg-[#5b31fe]/20 text-[#5b31fe]"}`}>
                    {quote.routerName}
                  </span>
                ) : selectedToken.graduated !== undefined && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${selectedToken.graduated ? "bg-green-500/20 text-green-400" : "bg-[#5b31fe]/20 text-[#5b31fe]"}`}>
                    {selectedToken.graduated ? "PancakeSwap" : "Flap.sh Bonding"}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/40">MCap</span>
                <span className="text-[10px] font-bold text-white/70">${selectedToken.mcap ? formatNum(selectedToken.mcap, 0) : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/40">Price</span>
                <span className="text-[10px] font-bold text-white/70">${selectedToken.price ? (selectedToken.price < 0.0001 ? selectedToken.price.toExponential(2) : selectedToken.price.toFixed(6)) : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/40">Holders</span>
                <span className="text-[10px] font-bold text-white/70">{selectedToken.holders ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/40">Tax</span>
                <span className={`text-[10px] font-bold ${selectedToken.taxRate && selectedToken.taxRate > 0 ? "text-yellow-400" : "text-green-400"}`}>{selectedToken.taxRate !== undefined ? `${selectedToken.taxRate}%` : "—"}</span>
              </div>
            </div>

            {selectedToken.address && (
              <div
                className="flex items-center gap-2 bg-[#0d0d1a] rounded-lg px-3 py-2 mb-2 cursor-pointer hover:bg-[#151528] transition-colors"
                onClick={() => {
                  navigator.clipboard.writeText(selectedToken.address!);
                }}
              >
                <span className="text-[11px] font-mono text-white/50 flex-1 truncate">{selectedToken.address}</span>
                <Copy size={12} className="text-white/30 flex-shrink-0" />
              </div>
            )}

            <div className="flex gap-2">
              <a
                href={(quote ? quote.graduated : selectedToken.graduated) ? `https://dexscreener.com/bsc/${selectedToken.address}` : `https://flap.sh/bnb/${selectedToken.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-jelly flex-1 flex items-center justify-center gap-1.5 bg-[#0d0d1a] hover:bg-[#151528] rounded-full py-2 transition-colors"
              >
                <BarChart3 size={13} className="text-[#00d4aa]" />
                <span className="text-[11px] font-bold text-white/60">Chart</span>
              </a>
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("open-chatbot", { detail: { ca: selectedToken.address } }));
                }}
                className="btn-jelly flex-1 flex items-center justify-center gap-1.5 bg-[#0d0d1a] hover:bg-[#151528] rounded-full py-2 transition-colors"
              >
                <MessageCircle size={13} className="text-[#5b31fe]" />
                <span className="text-[11px] font-bold text-white/60">{t.askBot as string}</span>
              </button>
            </div>
          </div>
        )}

        <div className="text-center mt-3 text-[10px] text-white/20">
          Bubble Flap Swap
        </div>
      </div>

      <HowItWorks 
        open={showHowToUse} 
        onClose={() => setShowHowToUse(false)} 
        currentPage="bflapswap" 
      />

      {showTokenSelect && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => { setShowTokenSelect(false); setTokenSearch(""); }}>
          <div className="bg-[#1a1a2e] rounded-2xl border border-white/10 w-full max-w-[420px] mx-4 shadow-2xl max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 pb-2">
              <h3 className="text-base font-bold text-white">{t.selectToken as string}</h3>
              <button onClick={() => { setShowTokenSelect(false); setTokenSearch(""); }} className="text-white/40 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="px-4 pb-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="text"
                  value={tokenSearch}
                  onChange={(e) => setTokenSearch(e.target.value)}
                  placeholder={t.searchToken as string}
                  className="w-full bg-[#0d0d1a] text-white text-sm rounded-xl pl-9 pr-4 py-3 outline-none border border-white/10 focus:border-[#5b31fe] placeholder-white/20"
                  autoFocus
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 px-2 pb-4">
              {filteredTokens.map((token, i) => (
                <button
                  key={`${token.symbol}-${token.address || i}`}
                  onClick={() => handleTokenSelect(token)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 rounded-xl transition-colors"
                >
                  <img src={token.image} alt={token.symbol} className="w-8 h-8 rounded-full bg-[#2a2a3e]" onError={(e) => { (e.target as HTMLImageElement).src = "/assets/bot.png"; }} />
                  <div className="text-left min-w-0 flex-1">
                    <div className="text-sm font-bold text-white truncate">${token.symbol}</div>
                    <div className="text-[11px] text-white/40 truncate">{token.name}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {token.graduated !== undefined && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${token.graduated ? "bg-green-500/20 text-green-400" : "bg-[#5b31fe]/20 text-[#5b31fe]"}`}>
                        {token.graduated ? "DEX" : "BOND"}
                      </span>
                    )}
                    {token.mcap && (
                      <span className="text-[10px] text-white/30">${formatNum(token.mcap, 0)}</span>
                    )}
                    {token.address && (
                      <span className="text-[10px] text-white/20 font-mono">
                        {token.address.slice(0, 4)}..{token.address.slice(-3)}
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {filteredTokens.length === 0 && (
                <div className="text-center py-8 text-white/30 text-sm">{t.noTokensFound as string}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showWalletModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => { setShowWalletModal(false); setWalletError(null); }}>
          <div className="bg-[#1a1a2e] rounded-2xl border border-white/10 w-full max-w-[420px] mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 pb-2">
              <h3 className="text-base font-bold text-white">{t.walletConnect as string}</h3>
              <button onClick={() => { setShowWalletModal(false); setWalletError(null); }} className="text-white/40 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 pt-2 space-y-4">
              {walletError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-400">
                  {walletError}
                </div>
              )}

              {walletConnecting ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <Loader2 size={20} className="animate-spin text-[#5b31fe]" />
                  <span className="text-sm text-white/60">Connecting...</span>
                </div>
              ) : (
                <>
                  <div className="text-[11px] text-white/40 font-bold uppercase tracking-wider">Top Wallets</div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "metamask", name: "Metamask", icon: "https://assets.pancakeswap.finance/web/wallets/metamask.png", detect: () => (window as any).ethereum?.isMetaMask, provider: () => (window as any).ethereum, deepLink: "https://metamask.app.link/dapp/" + window.location.host + window.location.pathname },
                      { id: "trust", name: "Trust Wallet", icon: "https://assets.pancakeswap.finance/web/wallets/trust.png", detect: () => (window as any).trustwallet?.isTrust || (window as any).ethereum?.isTrust, provider: () => (window as any).trustwallet || (window as any).ethereum, deepLink: "https://link.trustwallet.com/open_url?coin_id=20000714&url=" + encodeURIComponent(window.location.href) },
                      { id: "binance", name: "Binance Wallet", icon: "https://assets.pancakeswap.finance/web/wallets/binance-w3w.png", detect: () => !!(window as any).BinanceChain, provider: () => (window as any).BinanceChain, deepLink: "https://www.binance.com/en/web3wallet" },
                      { id: "okx", name: "OKX Wallet", icon: "https://assets.pancakeswap.finance/web/wallets/okx-wallet.png", detect: () => !!(window as any).okxwallet, provider: () => (window as any).okxwallet, deepLink: "https://www.okx.com/download" },
                      { id: "walletconnect", name: "WalletConnect", icon: "https://assets.pancakeswap.finance/web/wallets/walletconnect.png", detect: () => false, provider: () => null, deepLink: "" },
                    ].map((w) => {
                      const detected = w.detect();
                      return (
                        <button
                          key={w.id}
                          onClick={() => {
                            if (detected && w.provider()) {
                              connectWallet(w.provider());
                            } else if (w.id === "walletconnect") {
                              setWalletError("WalletConnect requires a Project ID. Use MetaMask or Trust Wallet mobile app instead.");
                            } else if (/Android|iPhone|iPad/i.test(navigator.userAgent) && w.deepLink) {
                              window.open(w.deepLink, "_blank");
                            } else {
                              setWalletError(`${w.name} not detected. Install ${w.name} extension or open this page in ${w.name}'s built-in browser.`);
                            }
                          }}
                          className="flex flex-col items-center gap-2 bg-[#0d0d1a] hover:bg-[#151528] rounded-xl p-3 transition-colors border border-white/5 hover:border-[#5b31fe]/50 relative"
                        >
                          {detected && (
                            <div className="absolute top-1.5 right-1.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0d0d1a]" />
                          )}
                          <div className="w-12 h-12 rounded-xl overflow-hidden">
                            <img src={w.icon} alt={w.name} className="w-full h-full object-cover" />
                          </div>
                          <span className="text-[11px] font-bold text-white/70 truncate w-full text-center">{w.name}</span>
                        </button>
                      );
                    })}
                  </div>

                  {(window as any).ethereum && !(window as any).ethereum.isMetaMask && !(window as any).ethereum.isTrust && (
                    <>
                      <div className="text-[11px] text-white/40 font-bold uppercase tracking-wider mt-2">More Wallets</div>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => connectWallet((window as any).ethereum)}
                          className="flex flex-col items-center gap-2 bg-[#0d0d1a] hover:bg-[#151528] rounded-xl p-3 transition-colors border border-white/5 hover:border-[#5b31fe]/50 relative"
                        >
                          <div className="absolute top-1.5 right-1.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0d0d1a]" />
                          <div className="w-12 h-12 rounded-xl bg-[#2a2a3e] flex items-center justify-center">
                            <Wallet size={24} className="text-[#5b31fe]" />
                          </div>
                          <span className="text-[11px] font-bold text-white/70 truncate w-full text-center">Browser Wallet</span>
                        </button>
                      </div>
                    </>
                  )}

                  <div className="text-[10px] text-white/20 text-center pt-1">
                    On mobile? Open this page in your wallet app's browser.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
