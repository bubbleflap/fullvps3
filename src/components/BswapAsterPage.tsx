import { useState, useEffect, useRef, useCallback } from "react";
import { Settings, X, Search, Loader2, ChevronDown, Wallet, MessageCircle, BarChart3, Copy, ExternalLink, ArrowLeftRight } from "lucide-react";
import { BrowserProvider, Contract, parseUnits, MaxUint256 } from "ethers";
import { useLang } from "../lib/i18n";

const PANCAKE_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const ROUTER_ABI = [
  "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external",
  "function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)",
];
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
];

const ASTER_ADDRESS = "0x000Ae314E2A2172a039B26378814C252734f556A";
const ASTER_ICON = "https://flap.sh/_next/image?url=%2Faster.png&w=32&q=75&dpl=dpl_DNeVASfzkRWjDN8WyKGk3PGnLB7H";

const ASTER_TOKEN = {
  symbol: "ASTER",
  name: "ASTER",
  image: ASTER_ICON,
  address: ASTER_ADDRESS,
};

const BFLAP_ADDRESS = "0xa2320fff1069ED5b4B02dDb386823E837A7e7777";
const BFLAP_DEFAULT: TokenOption = {
  symbol: "BFLAP",
  name: "BubbleFlap",
  image: "/assets/logo.png",
  address: BFLAP_ADDRESS,
  ca: BFLAP_ADDRESS,
  graduated: true,
};

interface TokenOption {
  symbol: string;
  name: string;
  image: string;
  address?: string;
  graduated?: boolean;
  mcap?: number;
  price?: number;
  priceInAster?: number;
  taxRate?: number;
  holders?: number;
  bondProgress?: number;
  dexUrl?: string;
  ca?: string;
}

function formatNum(n: number, decimals = 4): string {
  if (!n || isNaN(n)) return "0";
  if (n < 0.000001) return n.toExponential(2);
  if (n < 1) return n.toFixed(Math.min(decimals, 8));
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(decimals);
}

function formatMcap(n: number): string {
  if (!n || isNaN(n)) return "$0";
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export default function BswapAsterPage() {
  const { t } = useLang();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState<TokenOption | null>(BFLAP_DEFAULT);
  const [slippage, setSlippage] = useState("15.00");
  const [showSettings, setShowSettings] = useState(false);
  const [showTokenSelect, setShowTokenSelect] = useState(false);
  const [tokenSearch, setTokenSearch] = useState("");
  const [apiTokens, setApiTokens] = useState<TokenOption[]>([]);
  const [asterUsdPrice, setAsterUsdPrice] = useState(0);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [asterBalance, setAsterBalance] = useState<string | null>(null);
  const [tokenBalance, setTokenBalance] = useState<string | null>(null);
  const rawAsterBalanceRef = useRef<number>(0);
  const rawTokenBalanceRef = useRef<number>(0);
  const settingsRef = useRef<HTMLDivElement>(null);
  const settingsPanelRef = useRef<HTMLDivElement>(null);
  const [swapStatus, setSwapStatus] = useState<"idle" | "approving" | "swapping" | "success" | "error">("idle");
  const [swapTxHash, setSwapTxHash] = useState<string | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [liveOutput, setLiveOutput] = useState<bigint | null>(null);
  const [liveOutputLoading, setLiveOutputLoading] = useState(false);
  const liveOutputTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/new-tokens-aster").then(r => r.json()),
      fetch("/api/bonding-tokens-aster").then(r => r.json()),
    ]).then(([newData, bondData]) => {
      const asterPrice: number = newData.asterUsdPrice || bondData.asterUsdPrice || 0;
      if (asterPrice > 0) setAsterUsdPrice(asterPrice);

      const newTokens: any[] = newData.tokens || [];
      const bondTokens: any[] = bondData.tokens || [];
      const seen = new Set<string>();
      const all: TokenOption[] = [];
      for (const tk of [...newTokens, ...bondTokens]) {
        const addr = tk.address || tk.ca || tk.id;
        if (!addr || seen.has(addr)) continue;
        seen.add(addr);
        const priceUsd: number = tk.price || 0;
        const priceInAster: number = priceUsd > 0 && asterPrice > 0 ? priceUsd / asterPrice : 0;
        all.push({
          symbol: tk.ticker || tk.symbol || tk.name,
          name: tk.name,
          image: tk.image || "",
          address: addr,
          ca: addr,
          graduated: tk.graduated,
          mcap: tk.mcap,
          price: priceUsd,
          priceInAster,
          taxRate: tk.taxRate,
          holders: tk.holders,
          bondProgress: typeof tk.bondProgress === "number" ? tk.bondProgress / 100 : 0,
          dexUrl: tk.dexUrl,
        });
      }
      all.sort((a, b) => (b.mcap || 0) - (a.mcap || 0));
      setApiTokens(all);
      setSelectedToken(prev => {
        const addr = (prev?.address || prev?.ca || "").toLowerCase();
        const match = addr ? all.find(tk => (tk.address || tk.ca || "").toLowerCase() === addr) : null;
        return match ?? prev ?? all[0] ?? null;
      });
    }).catch(() => {});
  }, []);

  const BSC_CHAIN_ID = "0x38";
  const BSC_CHAIN_CONFIG = {
    chainId: BSC_CHAIN_ID,
    chainName: "BNB Smart Chain",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    rpcUrls: ["https://bsc-dataseed.binance.org/"],
    blockExplorerUrls: ["https://bscscan.com/"],
  };

  const switchToBSC = useCallback(async (provider: any) => {
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CHAIN_ID }] });
    } catch (err: any) {
      if (err.code === 4902) {
        await provider.request({ method: "wallet_addEthereumChain", params: [BSC_CHAIN_CONFIG] });
      } else throw err;
    }
  }, []);

  const fetchERC20Balance = useCallback(async (provider: any, walletAddr: string, tokenAddr: string): Promise<number> => {
    try {
      const data = "0x70a08231" + walletAddr.replace("0x", "").padStart(64, "0");
      const result = await provider.request({ method: "eth_call", params: [{ to: tokenAddr, data }, "latest"] });
      return parseInt(result, 16) / 1e18;
    } catch { return 0; }
  }, []);

  const setBalanceDisplay = (bal: number, setter: (v: string | null) => void, ref: React.MutableRefObject<number>) => {
    ref.current = bal;
    if (bal >= 1e9) setter((bal / 1e9).toFixed(1) + "B");
    else if (bal >= 1e6) setter((bal / 1e6).toFixed(1) + "M");
    else if (bal >= 1e3) setter((bal / 1e3).toFixed(1) + "K");
    else setter(bal.toFixed(2));
  };

  const refreshBalances = useCallback(async (provider: any, walletAddr: string, token: TokenOption | null) => {
    const asterBal = await fetchERC20Balance(provider, walletAddr, ASTER_ADDRESS);
    setBalanceDisplay(asterBal, setAsterBalance, rawAsterBalanceRef);
    if (token?.address) {
      const tkBal = await fetchERC20Balance(provider, walletAddr, token.address);
      setBalanceDisplay(tkBal, setTokenBalance, rawTokenBalanceRef);
    }
  }, [fetchERC20Balance]);

  useEffect(() => {
    if (walletAddress) {
      const provider = (window as any).ethereum;
      if (provider) refreshBalances(provider, walletAddress, selectedToken);
    } else {
      setAsterBalance(null);
      setTokenBalance(null);
    }
  }, [walletAddress, selectedToken, refreshBalances]);

  const connectWallet = useCallback(async (provider: any) => {
    setWalletConnecting(true);
    setWalletError(null);
    try {
      await switchToBSC(provider);
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      if (accounts?.length > 0) {
        setWalletAddress(accounts[0]);
        setShowWalletModal(false);
        refreshBalances(provider, accounts[0], selectedToken);
        provider.on?.("accountsChanged", (accs: string[]) => {
          if (accs.length === 0) { setWalletAddress(null); setAsterBalance(null); setTokenBalance(null); }
          else { setWalletAddress(accs[0]); refreshBalances(provider, accs[0], selectedToken); }
        });
        provider.on?.("chainChanged", () => window.location.reload());
      }
    } catch (err: any) {
      setWalletError(err.message || "Connection failed");
    } finally {
      setWalletConnecting(false);
    }
  }, [switchToBSC, refreshBalances, selectedToken]);

  const disconnectWallet = useCallback(() => {
    setWalletAddress(null);
    setAsterBalance(null);
    setTokenBalance(null);
  }, []);

  useEffect(() => {
    if (liveOutputTimer.current) clearTimeout(liveOutputTimer.current);
    const amtNum = parseFloat(amount);
    if (!amtNum || !selectedToken?.address) { setLiveOutput(null); return; }
    setLiveOutputLoading(true);
    liveOutputTimer.current = setTimeout(async () => {
      try {
        const { JsonRpcProvider } = await import("ethers");
        const rpc = new JsonRpcProvider("https://bsc-dataseed.binance.org/");
        const router = new Contract(PANCAKE_ROUTER, ROUTER_ABI, rpc);
        const inAddr  = side === "buy" ? ASTER_ADDRESS : selectedToken.address;
        const outAddr = side === "buy" ? selectedToken.address : ASTER_ADDRESS;
        const inDecimals: number = 18;
        const amountIn = parseUnits(amtNum.toString(), inDecimals);
        const amounts: bigint[] = await router.getAmountsOut(amountIn, [inAddr, outAddr]);
        setLiveOutput(amounts[amounts.length - 1]);
      } catch { setLiveOutput(null); }
      finally { setLiveOutputLoading(false); }
    }, 500);
  }, [amount, selectedToken, side]);

  const executeSwap = useCallback(async () => {
    if (!walletAddress || !selectedToken?.address || !amount || !parseFloat(amount)) return;
    const w = window as any;
    const rawProvider = w.ethereum;
    if (!rawProvider) return;
    setSwapStatus("idle");
    setSwapError(null);
    setSwapTxHash(null);
    try {
      const provider = new BrowserProvider(rawProvider);
      const signer = await provider.getSigner();
      const tokenAddr = selectedToken.address;
      const inAddr  = side === "buy" ? ASTER_ADDRESS : tokenAddr;
      const outAddr = side === "buy" ? tokenAddr : ASTER_ADDRESS;
      const path = [inAddr, outAddr];

      const inContract = new Contract(inAddr, ERC20_ABI, signer);
      const decimals: number = Number(await inContract.decimals());
      const amountIn = parseUnits(amount, decimals);

      const allowance: bigint = await inContract.allowance(walletAddress, PANCAKE_ROUTER);
      if (allowance < amountIn) {
        setSwapStatus("approving");
        const approveTx = await inContract.approve(PANCAKE_ROUTER, MaxUint256);
        await approveTx.wait();
      }

      const router = new Contract(PANCAKE_ROUTER, ROUTER_ABI, signer);
      const amounts: bigint[] = await router.getAmountsOut(amountIn, path);
      const expectedOut = amounts[amounts.length - 1];
      const slippagePct = parseFloat(slippage) || 15;
      const amountOutMin = expectedOut * BigInt(Math.floor((100 - slippagePct) * 100)) / BigInt(10000);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

      setSwapStatus("swapping");
      const tx = await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        amountIn, amountOutMin, path, walletAddress, deadline
      );
      setSwapTxHash(tx.hash);
      await tx.wait();
      setSwapStatus("success");
      setAmount("");
      setTimeout(() => setSwapStatus("idle"), 5000);
      if (rawProvider) refreshBalances(rawProvider, walletAddress, selectedToken);
    } catch (err: any) {
      setSwapStatus("error");
      const msg: string = err?.reason || err?.message || "Swap failed";
      setSwapError(msg.length > 80 ? msg.slice(0, 80) + "…" : msg);
      setTimeout(() => setSwapStatus("idle"), 6000);
    }
  }, [walletAddress, selectedToken, amount, side, slippage, refreshBalances]);

  useEffect(() => {
    const w = window as any;
    if (w.ethereum) {
      w.ethereum.request?.({ method: "eth_accounts" }).then((accounts: string[]) => {
        if (accounts?.length > 0) {
          w.ethereum.request({ method: "eth_chainId" }).then((chainId: string) => {
            if (chainId === BSC_CHAIN_ID) {
              setWalletAddress(accounts[0]);
              refreshBalances(w.ethereum, accounts[0], selectedToken);
            }
          });
        }
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const inGear = settingsRef.current?.contains(e.target as Node);
      const inPanel = settingsPanelRef.current?.contains(e.target as Node);
      if (!inGear && !inPanel) setShowSettings(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredTokens = apiTokens.filter(tk => {
    if (!tokenSearch) return true;
    const s = tokenSearch.toLowerCase();
    return tk.symbol.toLowerCase().includes(s) || tk.name.toLowerCase().includes(s) || (tk.address && tk.address.toLowerCase().includes(s));
  });

  const handleAmountChange = (val: string) => {
    setAmount(val.replace(/[^0-9.]/g, ""));
  };

  const handleReset = () => setAmount("");

  const handlePercentage = (pct: number) => {
    const base = side === "buy" ? rawAsterBalanceRef.current : rawTokenBalanceRef.current;
    if (base <= 0) return;
    setAmount((base * pct / 100).toFixed(4));
  };

  const handleTokenSelect = (token: TokenOption) => {
    setSelectedToken(token);
    setShowTokenSelect(false);
    setTokenSearch("");
    setAmount("");
  };

  const handleSideChange = (newSide: "buy" | "sell") => {
    setSide(newSide);
    setAmount("");
  };

  const getFlapUrl = (token: TokenOption) => {
    if (token.graduated && token.dexUrl) return token.dexUrl;
    return `https://flap.sh/bnb/${token.address || token.ca}`;
  };

  const liveOutputNum = liveOutput !== null ? Number(liveOutput) / 1e18 : null;
  const hasAmount = !!amount && !!parseFloat(amount) && !!selectedToken;

  const outputLabel = (() => {
    if (!hasAmount) return "";
    if (liveOutputLoading) return "Fetching quote…";
    if (liveOutputNum !== null) {
      const outSymbol = side === "buy" ? (selectedToken?.symbol || "") : "ASTER";
      const slippagePct = parseFloat(slippage) || 15;
      const minOut = liveOutputNum * (1 - slippagePct / 100);
      return `${t.youReceive as string} ≈${formatNum(liveOutputNum)} ${outSymbol}  (min ${formatNum(minOut)})`;
    }
    return "";
  })();

  const outputUsd = (() => {
    if (!liveOutputNum || !asterUsdPrice) return "";
    if (side === "buy" && selectedToken?.price) return `~$${formatNum(liveOutputNum * selectedToken.price, 2)}`;
    if (side === "sell") return `~$${formatNum(liveOutputNum * asterUsdPrice, 2)}`;
    return "";
  })();

  return (
    <div className="absolute inset-0 overflow-y-auto px-4 flex flex-col pt-[140px] sm:pt-[120px] lg:pt-[90px] pb-40">
      <div className="w-full max-w-[400px] mx-auto my-auto flex-shrink-0">

        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="text-[#a78bfa]" size={20} />
            AsterSwap
          </h2>
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`btn-jelly flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${
                showSettings ? "bg-[#7c5af3] text-white border-[#7c5af3]/60" : "bg-white/5 text-white/60 hover:text-white border-white/10 hover:border-white/20"
              }`}
            >
              <Settings size={13} />
              Slippage %
            </button>
            {showSettings && (
              <div ref={settingsPanelRef} className="absolute right-0 top-full mt-2 z-50 bg-[#1a1a2e] rounded-2xl border border-white/10 p-4 shadow-2xl w-64">
                <div className="text-xs text-white/50 mb-2">Slippage Tolerance</div>
                <div className="flex gap-2 mb-3">
                  {["5", "10", "15", "25"].map(v => (
                    <button key={v} onClick={() => setSlippage(v + ".00")} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors ${slippage === v + ".00" ? "bg-[#7c5af3] text-white" : "bg-white/5 text-white/50 hover:bg-white/10"}`}>{v}%</button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={slippage}
                    onChange={e => setSlippage(e.target.value)}
                    className="flex-1 bg-[#0d0d1a] text-white text-sm rounded-xl px-3 py-2 outline-none border border-white/10 focus:border-[#7c5af3]"
                  />
                  <span className="text-white/40 text-sm">%</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#1a1a2e]/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl shadow-black/50 overflow-hidden">

          {/* Buy / Sell */}
          <div className="flex p-1 mx-3 mt-3 bg-[#0d0d1a] rounded-xl">
            <button
              onClick={() => handleSideChange("buy")}
              className={`btn-jelly no-scale flex-1 py-2.5 text-sm font-bold rounded-full transition-all ${side === "buy" ? "bg-[#a78bfa] text-black" : "text-white/40 hover:text-white/60"}`}
            >
              {t.buy as string}
            </button>
            <button
              onClick={() => handleSideChange("sell")}
              className={`btn-jelly no-scale flex-1 py-2.5 text-sm font-bold rounded-full transition-all ${side === "sell" ? "bg-red-500/90 text-white" : "text-white/40 hover:text-white/60"}`}
            >
              {t.sell as string}
            </button>
          </div>

          {side === "buy" ? (
            <>
              {/* ASTER input row */}
              <div className="p-3 pt-2 pb-1">
                <div className="flex items-center gap-3 bg-[#0d0d1a] rounded-xl px-4 py-3 border border-white/5">
                  <img src={ASTER_ICON} alt="ASTER" className="w-7 h-7 rounded-full" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">ASTER</span>
                      {walletAddress && asterBalance && (
                        <span className="text-[10px] text-white/30 ml-1">Bal: {asterBalance}</span>
                      )}
                    </div>
                    <div className="text-[10px] text-white/30">ASTER Token</div>
                  </div>
                </div>
              </div>

              {/* Token selector */}
              <div className="px-3 pb-1">
                <button
                  onClick={() => setShowTokenSelect(true)}
                  className="w-full flex items-center gap-3 bg-[#0d0d1a] rounded-xl px-4 py-3 border border-white/5 hover:border-[#7c5af3]/40 transition-colors"
                >
                  {selectedToken ? (
                    <>
                      <img src={selectedToken.image} alt={selectedToken.symbol} className="w-7 h-7 rounded-full bg-[#2a2a3e]" onError={(e) => { (e.target as HTMLImageElement).src = "/assets/rocket_coin_icon-Cs8cimT6.png"; }} />
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">${selectedToken.symbol}</span>
                          {walletAddress && tokenBalance && <span className="text-[10px] text-white/30">Bal: {tokenBalance}</span>}
                        </div>
                        <div className="text-[10px] text-white/30 truncate">{selectedToken.name}</div>
                      </div>
                    </>
                  ) : (
                    <span className="text-sm text-white/40 flex-1 text-left">{t.selectToken as string}</span>
                  )}
                  <ChevronDown size={16} className="text-white/40 flex-shrink-0" />
                </button>
              </div>

              {/* Amount input */}
              <div className="px-3 pb-2">
                <div className="bg-[#0d0d1a] rounded-xl px-4 py-3 border border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <img src={ASTER_ICON} alt="ASTER" className="w-6 h-6 rounded-full" />
                    <input
                      type="number"
                      inputMode="decimal"
                      value={amount}
                      onChange={e => handleAmountChange(e.target.value)}
                      placeholder={`0.00 (ASTER)`}
                      className="flex-1 bg-transparent text-white text-sm outline-none placeholder-white/20 min-w-0"
                    />
                  </div>
                  <div className="flex gap-2">
                    {["reset", "25", "50", "75", "100"].map(v => (
                      <button
                        key={v}
                        onClick={() => v === "reset" ? handleReset() : handlePercentage(parseInt(v))}
                        className="flex-1 py-1 rounded-full text-[10px] font-bold bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                      >
                        {v === "reset" ? "reset" : v + "%"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Token to sell */}
              <div className="p-3 pt-2 pb-1">
                <button
                  onClick={() => setShowTokenSelect(true)}
                  className="w-full flex items-center gap-3 bg-[#0d0d1a] rounded-xl px-4 py-3 border border-white/5 hover:border-[#7c5af3]/40 transition-colors"
                >
                  {selectedToken ? (
                    <>
                      <img src={selectedToken.image} alt={selectedToken.symbol} className="w-7 h-7 rounded-full bg-[#2a2a3e]" onError={(e) => { (e.target as HTMLImageElement).src = "/assets/rocket_coin_icon-Cs8cimT6.png"; }} />
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">${selectedToken.symbol}</span>
                          {walletAddress && tokenBalance && <span className="text-[10px] text-white/30">Bal: {tokenBalance}</span>}
                        </div>
                        <div className="text-[10px] text-white/30 truncate">{selectedToken.name}</div>
                      </div>
                    </>
                  ) : (
                    <span className="text-sm text-white/40 flex-1 text-left">{t.selectToken as string}</span>
                  )}
                  <ChevronDown size={16} className="text-white/40 flex-shrink-0" />
                </button>
              </div>

              {/* Amount input */}
              <div className="px-3 pb-2">
                <div className="bg-[#0d0d1a] rounded-xl px-4 py-3 border border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    {selectedToken ? (
                      <img src={selectedToken.image} alt={selectedToken.symbol} className="w-6 h-6 rounded-full" onError={(e) => { (e.target as HTMLImageElement).src = "/assets/rocket_coin_icon-Cs8cimT6.png"; }} />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-white/10" />
                    )}
                    <input
                      type="number"
                      inputMode="decimal"
                      value={amount}
                      onChange={e => handleAmountChange(e.target.value)}
                      placeholder={`0.00 (${selectedToken?.symbol || "Token"})`}
                      className="flex-1 bg-transparent text-white text-sm outline-none placeholder-white/20 min-w-0"
                    />
                  </div>
                  <div className="flex gap-2">
                    {["reset", "25", "50", "75", "100"].map(v => (
                      <button
                        key={v}
                        onClick={() => v === "reset" ? handleReset() : handlePercentage(parseInt(v))}
                        className="flex-1 py-1 rounded-full text-[10px] font-bold bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                      >
                        {v === "reset" ? "reset" : v + "%"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Receive ASTER row */}
              <div className="px-3 pb-1">
                <div className="w-full flex items-center gap-3 bg-[#0d0d1a] rounded-xl px-4 py-3 border border-white/5">
                  <img src={ASTER_ICON} alt="ASTER" className="w-7 h-7 rounded-full bg-[#2a2a3e]" />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-bold text-white">ASTER</div>
                    <div className="text-[10px] text-white/30">ASTER Token</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Output estimate */}
          {hasAmount && (
            <div className="px-3 pb-2">
              <div className="bg-[#7c5af3]/10 rounded-xl px-4 py-2.5 border border-[#7c5af3]/20 flex items-center gap-2">
                {liveOutputLoading ? (
                  <><Loader2 size={13} className="animate-spin text-[#a78bfa] flex-shrink-0" /><span className="text-xs text-[#a78bfa]/60">Fetching quote…</span></>
                ) : liveOutputNum !== null ? (
                  <div className="flex-1">
                    <div className="text-xs text-[#a78bfa] font-medium">{outputLabel}</div>
                    {outputUsd && <div className="text-[10px] text-white/30 mt-0.5">{outputUsd}</div>}
                  </div>
                ) : (
                  <span className="text-xs text-white/30">No liquidity or pair not found</span>
                )}
              </div>
            </div>
          )}

          {/* Action button */}
          <div className="px-3 pb-3">
            {walletAddress ? (
              <div className="flex flex-col gap-2">
                <button
                  onClick={executeSwap}
                  disabled={swapStatus === "approving" || swapStatus === "swapping" || !amount || !parseFloat(amount) || !selectedToken}
                  className={`btn-jelly w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    swapStatus === "success"
                      ? "bg-green-500 text-white"
                      : swapStatus === "error"
                      ? "bg-red-600 text-white"
                      : side === "buy"
                      ? "bg-[#a78bfa] hover:bg-[#a78bfa]/80 text-black"
                      : "bg-red-500/90 hover:bg-red-500/70 text-white"
                  }`}
                >
                  {swapStatus === "approving" && <><Loader2 size={15} className="animate-spin" /> Approving…</>}
                  {swapStatus === "swapping" && <><Loader2 size={15} className="animate-spin" /> Swapping…</>}
                  {swapStatus === "success" && <>✓ Swap confirmed!</>}
                  {swapStatus === "error" && <>✗ Failed — retry</>}
                  {swapStatus === "idle" && (
                    <>
                      <img src={ASTER_ICON} alt="ASTER" className="w-4 h-4 rounded-full" />
                      {side === "buy" ? `Buy ${selectedToken?.symbol || ""}` : `Sell ${selectedToken?.symbol || ""}`}
                    </>
                  )}
                </button>
                {swapStatus === "success" && swapTxHash && (
                  <a href={`https://bscscan.com/tx/${swapTxHash}`} target="_blank" rel="noopener noreferrer"
                    className="text-center text-[10px] text-green-400 hover:text-green-300 underline">
                    View on BscScan ↗
                  </a>
                )}
                {swapStatus === "error" && swapError && (
                  <div className="text-center text-[10px] text-red-400 px-1">{swapError}</div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowWalletModal(true)}
                className="btn-jelly w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold bg-[#7c5af3] hover:bg-[#7c5af3]/80 text-white transition-all"
              >
                <Wallet size={16} />
                {t.connectWallet as string}
              </button>
            )}
          </div>

          {/* Wallet bar */}
          {walletAddress && (
            <div className="px-3 pb-3">
              <div className="flex items-center justify-between bg-[#0d0d1a] rounded-xl px-3 py-2 border border-white/5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-[10px] text-white/50 font-mono">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
                  {asterBalance && (
                    <span className="text-[10px] text-[#a78bfa]">{asterBalance} ASTER</span>
                  )}
                </div>
                <button onClick={disconnectWallet} className="text-[10px] text-white/30 hover:text-red-400 transition-colors">Disconnect</button>
              </div>
            </div>
          )}
        </div>

        {/* Token info card */}
        {selectedToken && (
          <div className="mt-3 bg-[#1a1a2e]/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
            <div className="p-3 flex items-center gap-3">
              <img src={selectedToken.image} alt={selectedToken.symbol} className="w-9 h-9 rounded-full bg-[#2a2a3e]" onError={(e) => { (e.target as HTMLImageElement).src = "/assets/rocket_coin_icon-Cs8cimT6.png"; }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-white">${selectedToken.symbol}</span>
                  {selectedToken.graduated ? (
                    <span className="text-[9px] bg-green-500/20 text-green-400 border border-green-500/30 rounded-full px-1.5 py-0.5 font-bold">Flap.sh Listed</span>
                  ) : (
                    <span className="text-[9px] bg-[#7c5af3]/20 text-[#a78bfa] border border-[#7c5af3]/30 rounded-full px-1.5 py-0.5 font-bold">Flap.sh Bonding</span>
                  )}
                </div>
                {selectedToken.address && (
                  <button
                    onClick={() => navigator.clipboard.writeText(selectedToken.address || "")}
                    className="text-[10px] text-white/30 font-mono hover:text-white/60 transition-colors flex items-center gap-1 mt-0.5"
                  >
                    {selectedToken.address.slice(0, 10)}...{selectedToken.address.slice(-6)}
                    <Copy size={9} />
                  </button>
                )}
              </div>
            </div>

            <div className="px-3 pb-2 grid grid-cols-3 gap-2">
              <div className="bg-[#0d0d1a] rounded-xl px-3 py-2">
                <div className="text-[9px] text-white/30 mb-0.5">MCap</div>
                <div className="text-xs font-bold text-white">{formatMcap(selectedToken.mcap || 0)}</div>
              </div>
              <div className="bg-[#0d0d1a] rounded-xl px-3 py-2">
                <div className="text-[9px] text-white/30 mb-0.5">Price</div>
                <div className="text-xs font-bold text-white">
                  {selectedToken.priceInAster ? `${formatNum(selectedToken.priceInAster, 4)} A` : selectedToken.price ? `$${formatNum(selectedToken.price, 6)}` : "—"}
                </div>
              </div>
              <div className="bg-[#0d0d1a] rounded-xl px-3 py-2">
                <div className="text-[9px] text-white/30 mb-0.5">Tax</div>
                <div className={`text-xs font-bold ${selectedToken.taxRate && selectedToken.taxRate >= 10 ? "text-red-400" : "text-green-400"}`}>
                  {selectedToken.taxRate ? `${selectedToken.taxRate.toFixed(1)}%` : "—"}
                </div>
              </div>
            </div>

            <div className="px-3 pb-3 flex gap-2">
              <a
                href={`https://dexscreener.com/bsc/${selectedToken.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 bg-[#0d0d1a] hover:bg-white/5 border border-white/5 rounded-xl py-2 text-xs text-white/50 hover:text-white transition-colors"
              >
                <BarChart3 size={13} />
                Chart
              </a>
              <a
                href={selectedToken ? getFlapUrl(selectedToken) : "https://flap.sh"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 bg-[#0d0d1a] hover:bg-white/5 border border-white/5 rounded-xl py-2 text-xs text-white/50 hover:text-white transition-colors"
              >
                <ExternalLink size={13} />
                Flap.sh
              </a>
            </div>
          </div>
        )}

        <div className="mt-3 text-center text-[10px] text-white/15">Bubble Flap · ASTER Pair Swap</div>
      </div>

      {/* Token selector modal */}
      {showTokenSelect && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowTokenSelect(false)}>
          <div className="bg-[#1a1a2e] rounded-t-2xl sm:rounded-2xl border border-white/10 w-full max-w-[420px] mx-0 sm:mx-4 shadow-2xl flex flex-col max-h-[70vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 pb-2 flex-shrink-0">
              <h3 className="text-base font-bold text-white">{t.selectToken as string}</h3>
              <button onClick={() => setShowTokenSelect(false)} className="text-white/40 hover:text-white transition-colors"><X size={18} /></button>
            </div>
            <div className="px-4 pb-2 flex-shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  type="text"
                  value={tokenSearch}
                  onChange={e => setTokenSearch(e.target.value)}
                  placeholder={t.searchToken as string}
                  className="w-full bg-[#0d0d1a] text-white text-sm rounded-xl pl-9 pr-4 py-3 outline-none border border-white/10 focus:border-[#7c5af3] placeholder-white/20"
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
                  <img src={token.image} alt={token.symbol} className="w-8 h-8 rounded-full bg-[#2a2a3e]" onError={(e) => { (e.target as HTMLImageElement).src = "/assets/rocket_coin_icon-Cs8cimT6.png"; }} />
                  <div className="text-left min-w-0 flex-1">
                    <div className="text-sm font-bold text-white truncate">${token.symbol}</div>
                    <div className="text-[11px] text-white/40 truncate">{token.name}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {token.graduated !== undefined && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${token.graduated ? "bg-green-500/20 text-green-400" : "bg-[#7c5af3]/20 text-[#a78bfa]"}`}>
                        {token.graduated ? "DEX" : "BOND"}
                      </span>
                    )}
                    {token.mcap && <span className="text-[10px] text-white/30">{formatMcap(token.mcap)}</span>}
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

      {/* Wallet modal */}
      {showWalletModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => { setShowWalletModal(false); setWalletError(null); }}>
          <div className="bg-[#1a1a2e] rounded-2xl border border-white/10 w-full max-w-[420px] mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 pb-2">
              <h3 className="text-base font-bold text-white">{t.walletConnect as string}</h3>
              <button onClick={() => { setShowWalletModal(false); setWalletError(null); }} className="text-white/40 hover:text-white transition-colors"><X size={18} /></button>
            </div>
            <div className="p-4 pt-2 space-y-4">
              {walletError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-400">{walletError}</div>
              )}
              {walletConnecting ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <Loader2 size={20} className="animate-spin text-[#7c5af3]" />
                  <span className="text-sm text-white/60">Connecting...</span>
                </div>
              ) : (
                <>
                  <div className="text-[11px] text-white/40 font-bold uppercase tracking-wider">Top Wallets</div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "metamask", name: "Metamask", icon: "https://assets.pancakeswap.finance/web/wallets/metamask.png", detect: () => (window as any).ethereum?.isMetaMask, provider: () => (window as any).ethereum, deepLink: "https://metamask.app.link/dapp/" + window.location.host },
                      { id: "trust", name: "Trust Wallet", icon: "https://assets.pancakeswap.finance/web/wallets/trust.png", detect: () => (window as any).trustwallet?.isTrust || (window as any).ethereum?.isTrust, provider: () => (window as any).trustwallet || (window as any).ethereum, deepLink: "https://link.trustwallet.com/open_url?coin_id=20000714&url=" + encodeURIComponent(window.location.href) },
                      { id: "binance", name: "Binance Wallet", icon: "https://assets.pancakeswap.finance/web/wallets/binance-w3w.png", detect: () => !!(window as any).BinanceChain, provider: () => (window as any).BinanceChain, deepLink: "" },
                      { id: "okx", name: "OKX Wallet", icon: "https://assets.pancakeswap.finance/web/wallets/okx-wallet.png", detect: () => !!(window as any).okxwallet, provider: () => (window as any).okxwallet, deepLink: "" },
                      { id: "walletconnect", name: "WalletConnect", icon: "https://assets.pancakeswap.finance/web/wallets/walletconnect.png", detect: () => false, provider: () => null, deepLink: "" },
                    ].map(w => {
                      const detected = w.detect();
                      return (
                        <button
                          key={w.id}
                          onClick={() => {
                            if (detected && w.provider()) { connectWallet(w.provider()); }
                            else if (w.id === "walletconnect") { setWalletError("Use MetaMask or Trust Wallet mobile instead."); }
                            else if (/Android|iPhone|iPad/i.test(navigator.userAgent) && w.deepLink) { window.open(w.deepLink, "_blank"); }
                            else { setWalletError(`${w.name} not detected. Install ${w.name} or open in its browser.`); }
                          }}
                          className="flex flex-col items-center gap-2 bg-[#0d0d1a] hover:bg-[#151528] rounded-xl p-3 transition-colors border border-white/5 hover:border-[#7c5af3]/50 relative"
                        >
                          {detected && <div className="absolute top-1.5 right-1.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0d0d1a]" />}
                          <div className="w-12 h-12 rounded-xl overflow-hidden">
                            <img src={w.icon} alt={w.name} className="w-full h-full object-cover" />
                          </div>
                          <span className="text-[11px] font-bold text-white/70 truncate w-full text-center">{w.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[10px] text-white/20 text-center pt-1">On mobile? Open this page in your wallet app's browser.</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
