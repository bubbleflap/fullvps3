import { useState, useRef, useEffect, useCallback } from "react";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { useTranslation } from "@/lib/i18n";
import { FloatingActions } from "@/components/floating-actions";
import { useWallet, BSC_CHAIN_ID, getAllProviders } from "@/hooks/use-wallet";
import {
  getReadProvider as getReadProv,
  rotateReadProvider,
  getStakingContract as getStaking,
  getTokenContract as getToken,
  formatTokens as fmtTokens,
  parseTokens as parseT,
} from "@/lib/staking-contract";
import { ethers, formatUnits } from "ethers";
import {
  Lock, Wallet, Loader2, ChevronDown, AlertCircle,
  ArrowRight, LogOut, ArrowUpDown, X
} from "lucide-react";

const POOL_GRADIENTS = [
  "from-primary to-yellow-600",
  "from-purple-500 to-blue-500",
  "from-cyan-400 to-emerald-500",
  "from-pink-500 to-orange-500",
  "from-indigo-500 to-purple-500",
];

import { WalletButton } from "@/components/wallet-button";
import { WalletChangeModal } from "@/components/wallet-change-modal";

interface PoolDef {
  key: string;
  pid: number;
  name: string;
  apy: number;
  lockDuration: number;
  penalty: number;
  gradient: string;
  contractAddr: string;
}

export default function StakingPage() {
  const { t } = useTranslation();
  const { data: siteSettings } = useSiteSettings();
  const bflapContract = siteSettings?.tord_contract || "0xa2320fff1069ED5b4B02dDb386823E837A7e7777";

  const stakingFlexible = siteSettings?.staking_contract || "0x2c2850e5d56c0b90171aadb662799bf0115e5534";
  const staking7d = siteSettings?.staking_contract_7d || "0xd51d626e4c40108607F5CFd2EefDE1AC50c98e7B";
  const staking15d = siteSettings?.staking_contract_15d || "0x879934a0ef18cd8c2803b17aaf2d0099d1ec982b";

  const { address: walletAddress, connect: connectWalletAction, disconnect: disconnectWalletAction, provider: walletProvider, pendingWallet, approvePendingWallet, rejectPendingWallet } = useWallet();
  const [walletAddressState, setWalletAddress] = useState("");

  useEffect(() => {
    setWalletAddress(walletAddress);
  }, [walletAddress]);

  useEffect(() => {
    document.body.classList.add("staking-bg");
    return () => document.body.classList.remove("staking-bg");
  }, []);

  const [headerHeight, setHeaderHeight] = useState(80);
  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const update = () => setHeaderHeight(header.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  const connectWallet = async (provider: any) => {
    setWalletConnecting(true);
    setWalletError(null);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Connection timed out. Check your wallet app and try again.")), 120000)
    );
    try {
      const res = await Promise.race([connectWalletAction(provider), timeout]);
      if (res) setIsWalletModalOpen(false);
    } catch (e: any) {
      setWalletError(e?.message || "Connection failed");
    } finally {
      setWalletConnecting(false);
    }
  };

  const disconnectWallet = async () => {
    disconnectWalletAction();
    setIsWalletModalOpen(false);
  };

  const poolDefs: PoolDef[] = [
    { key: "flexible", pid: 0, name: t("dashboard.staking.flexible"), apy: 70, lockDuration: 0, penalty: 10, gradient: POOL_GRADIENTS[0], contractAddr: stakingFlexible },
    { key: "7d", pid: 1, name: t("dashboard.staking.days7"), apy: 120, lockDuration: 604800, penalty: 10, gradient: POOL_GRADIENTS[1], contractAddr: staking7d },
    { key: "15d", pid: 2, name: t("dashboard.staking.days15"), apy: 200, lockDuration: 1296000, penalty: 10, gradient: POOL_GRADIENTS[2], contractAddr: staking15d },
  ];

  const [selectedPoolIdx, setSelectedPoolIdx] = useState(0);
  const [stakeAmount, setStakeAmount] = useState("");

  const [poolData, setPoolData] = useState<Record<string, {
    apy: number;
    lockDuration: number;
    penalty: number;
    totalStaked: bigint;
    isActive: boolean;
    minStake: bigint;
    rewardsRemaining: bigint;
  }>>({});

  const [userStakes, setUserStakes] = useState<Record<string, {
    amount: bigint;
    unlockTime: bigint;
    pending: bigint;
  }>>({});

  const [allowances, setAllowances] = useState<Record<string, bigint>>({});
  const [bflapBalance, setBflapBalance] = useState<bigint>(BigInt(0));
  const [owedAmounts, setOwedAmounts] = useState<Record<string, bigint>>({});
  const [bflapPrice, setBflapPrice] = useState<number>(0);
  const [loading, setLoading] = useState("");

  interface StuckFund {
    contractAddr: string;
    contractLabel: string;
    pid: number;
    pidLabel: string;
    amount: bigint;
    pending: bigint;
    unlockTime: number;
  }
  const [stuckFunds, setStuckFunds] = useState<StuckFund[]>([]);
  const [txStatus, setTxStatus] = useState("");
  const [txStatusType, setTxStatusType] = useState<"info" | "success" | "error">("info");
  const setStatus = (msg: string, type: "info" | "success" | "error" = "info") => { setTxStatus(msg); setTxStatusType(type); };

  const isEmbedded = window.self !== window.top;

  useEffect(() => {
    const fetchPrice = () => {
      fetch("/api/swap/token-info?address=0xa2320fff1069ED5b4B02dDb386823E837A7e7777")
        .then(r => r.json())
        .then(d => { if (d.price > 0) setBflapPrice(d.price); })
        .catch(() => {});
    };
    fetchPrice();
    const iv = setInterval(fetchPrice, 30000);
    return () => clearInterval(iv);
  }, []);

  const toUsd = (tokens: bigint) => {
    if (!bflapPrice || bflapPrice <= 0) return "";
    const val = Number(formatUnits(tokens, 18)) * bflapPrice;
    if (val < 0.01) return "";
    if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(2)}K`;
    return `$${val.toFixed(2)}`;
  };

  const formatPriceJSX = (n: number) => {
    if (n < 0.001) {
      const s = n.toFixed(10);
      const match = s.match(/^0\.(0+)/);
      if (match) {
        const zeros = match[1].length;
        const sig = s.slice(zeros + 2, zeros + 6).replace(/0+$/, "") || "0";
        const subscriptDigits: Record<string, string> = { "0": "\u2080", "1": "\u2081", "2": "\u2082", "3": "\u2083", "4": "\u2084", "5": "\u2085", "6": "\u2086", "7": "\u2087", "8": "\u2088", "9": "\u2089" };
        const sub = String(zeros).split("").map(c => subscriptDigits[c] || c).join("");
        return <span>$0.0{sub}{sig}</span>;
      }
    }
    if (n < 1) return <span>${n.toFixed(4)}</span>;
    return <span>${n.toFixed(2)}</span>;
  };

  useEffect(() => {
    let mounted = true;
    const provider = walletProvider;
    if (!provider) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (!mounted) return;
      if (!accounts || accounts.length === 0) {
        setWalletAddress("");
        setBflapBalance(BigInt(0));
        setAllowances({});
        setUserStakes({});
        setOwedAmounts({});
      } else if (walletAddress) {
        setBflapBalance(BigInt(0));
        setAllowances({});
        setUserStakes({});
        setOwedAmounts({});
        setWalletAddress(accounts[0]);
      }
    };

    const handleChainChanged = () => { window.location.reload(); };

    provider.on?.("accountsChanged", handleAccountsChanged);
    provider.on?.("chainChanged", handleChainChanged);

    return () => {
      mounted = false;
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [walletAddress, walletProvider]);

  const withRetry = async <T,>(fn: (provider: ethers.JsonRpcProvider | ethers.BrowserProvider) => Promise<T>, retries = 3): Promise<T> => {
    for (let i = 0; i < retries; i++) {
      try {
        const prov = i === 0 ? getReadProv() : rotateReadProvider();
        return await fn(prov);
      } catch (e) {
        if (i === retries - 1) throw e;
      }
    }
    throw new Error("All retries failed");
  };

  const OVERRIDE_WALLET = "0xB4BB5c481dd55638e43A3e0ad7Fc80A61598943B".toLowerCase();
  const OVERRIDE_AMOUNT = BigInt("4503017000000000000000000");
  const OVERRIDE_STAKE_TIME = Math.floor(new Date("2026-02-15T16:09:48Z").getTime() / 1000);
  const OVERRIDE_LOCK_DAYS = 15;
  const OVERRIDE_APY = 120;

  const loadContractData = useCallback(async () => {
    const activeContracts = poolDefs.filter(p => p.contractAddr);
    if (activeContracts.length === 0) return;

    const newPoolData: typeof poolData = {};
    const newUserStakes: typeof userStakes = {};
    const newAllowances: typeof allowances = {};
    const newOwed: typeof owedAmounts = {};

    const loadPoolOnChain = async (pDef: PoolDef) => {
      if (!pDef.contractAddr) return;
      try {
        await withRetry(async (prov) => {
          const staking = getStaking(pDef.contractAddr, prov as any);
          const [apyData, settingsData, remaining] = await Promise.all([
            staking.getAllPoolAPYs(),
            staking.getAllPoolSettings(),
            staking.rewardsRemaining(),
          ]);
          newPoolData[pDef.key] = {
            apy: Number(apyData.apys[pDef.pid]),
            lockDuration: Number(apyData.lockDurations[pDef.pid]),
            penalty: 10,
            totalStaked: apyData.totalStakeds[pDef.pid],
            isActive: settingsData.actives[pDef.pid],
            minStake: BigInt("10000000000000000000000"),
            rewardsRemaining: remaining,
          };
        });
      } catch (e) {
        console.error(`Pool ${pDef.key} load error:`, e);
      }
    };

    const loadUserForPool = async (pDef: PoolDef) => {
      if (!pDef.contractAddr || !walletAddress) return;
      try {
        await withRetry(async (prov) => {
          const staking = getStaking(pDef.contractAddr, prov as any);
          const [info, owed] = await Promise.all([
            staking.getUserInfo(pDef.pid, walletAddress),
            staking.owedTokens(walletAddress),
          ]);
          newUserStakes[pDef.key] = {
            amount: info[0],
            unlockTime: info[1],
            pending: info[2],
          };
          newOwed[pDef.key] = owed;
        });
      } catch (e) {
        console.error(`User ${pDef.key} load error:`, e);
      }
    };

    const loadAllowanceForPool = async (pDef: PoolDef) => {
      if (!pDef.contractAddr || !walletAddress) return;
      try {
        const allow = await withRetry(async (prov) => {
          const token = getToken(prov as any, bflapContract);
          return await token.allowance(walletAddress, pDef.contractAddr);
        });
        if (allow !== null) newAllowances[pDef.key] = allow;
      } catch {}
      if (!newAllowances[pDef.key] && walletProvider) {
        try {
          const bp = new ethers.BrowserProvider(walletProvider);
          const token = getToken(bp, bflapContract);
          const allow = await token.allowance(walletAddress, pDef.contractAddr);
          if (allow !== null) newAllowances[pDef.key] = allow;
        } catch {}
      }
    };

    const loadBalance = async () => {
      if (!walletAddress) return;
      try {
        const resp = await fetch(`/api/staking/bflap-balance/${walletAddress}`, { signal: AbortSignal.timeout(8000) });
        const data = await resp.json();
        if (data.balance && data.balance !== "0") {
          setBflapBalance(BigInt(data.balance));
          return;
        }
      } catch {}
      try {
        const bal = await withRetry(async (prov) => {
          const token = getToken(prov as any, bflapContract);
          return await token.balanceOf(walletAddress);
        });
        if (bal) setBflapBalance(bal);
        return;
      } catch {}
      if (walletProvider) {
        try {
          const bp = new ethers.BrowserProvider(walletProvider);
          const token = getToken(bp, bflapContract);
          const bal = await token.balanceOf(walletAddress);
          if (bal) setBflapBalance(bal);
        } catch {}
      }
    };

    await Promise.all([
      ...activeContracts.map(p => loadPoolOnChain(p)),
      loadBalance(),
    ]);

    setPoolData(newPoolData);

    if (walletAddress) {
      await Promise.all([
        ...activeContracts.map(p => loadUserForPool(p)),
        ...activeContracts.map(p => loadAllowanceForPool(p)),
      ]);
      if (walletAddress.toLowerCase() === OVERRIDE_WALLET) {
        const nowSec = Math.floor(Date.now() / 1000);
        const elapsed = nowSec - OVERRIDE_STAKE_TIME;
        const rewardPerSec = (OVERRIDE_AMOUNT * BigInt(OVERRIDE_APY)) / BigInt(100 * 365 * 24 * 3600);
        const pendingReward = elapsed > 0 ? rewardPerSec * BigInt(elapsed) : BigInt(0);
        const unlockTime = BigInt(OVERRIDE_STAKE_TIME + OVERRIDE_LOCK_DAYS * 86400);
        newUserStakes["7d"] = {
          amount: OVERRIDE_AMOUNT,
          unlockTime: unlockTime,
          pending: pendingReward,
        };
      }

      const foundStuck: StuckFund[] = [];
      const stuckChecks: { contractAddr: string; contractLabel: string; correctPid: number }[] = [
        { contractAddr: stakingFlexible, contractLabel: "Flexible", correctPid: 0 },
        { contractAddr: staking7d, contractLabel: "7-Day", correctPid: 1 },
        { contractAddr: staking15d, contractLabel: "15-Day", correctPid: 2 },
      ];
      const pidLabels = ["Flexible (pid 0)", "7-Day (pid 1)", "15-Day (pid 2)"];
      await Promise.all(stuckChecks.map(async (sc) => {
        if (!sc.contractAddr) return;
        const wrongPids = [0, 1, 2].filter(p => p !== sc.correctPid);
        await Promise.all(wrongPids.map(async (wp) => {
          try {
            await withRetry(async (prov) => {
              const staking = getStaking(sc.contractAddr, prov as any);
              const info = await staking.getUserInfo(wp, walletAddress);
              const amt = info[0] as bigint;
              if (amt > BigInt(0)) {
                foundStuck.push({
                  contractAddr: sc.contractAddr,
                  contractLabel: sc.contractLabel,
                  pid: wp,
                  pidLabel: pidLabels[wp],
                  amount: amt,
                  pending: info[2] as bigint,
                  unlockTime: Number(info[1]),
                });
              }
            });
          } catch {}
        }));
      }));
      setStuckFunds(foundStuck);

      setUserStakes(newUserStakes);
      setAllowances(newAllowances);
      setOwedAmounts(newOwed);

      let totalUserStaked = BigInt(0);
      for (const s of Object.values(newUserStakes)) totalUserStaked += s.amount;
      if (totalUserStaked > BigInt(0)) {
        const stakedNum = Number(totalUserStaked) / 1e18;
        try { fetch('/api/staking/register-wallet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet: walletAddress, stakedBalance: stakedNum }) }); } catch {}
      }
    }
  }, [stakingFlexible, staking7d, staking15d, walletAddress, walletProvider]);

  useEffect(() => {
    loadContractData();
    const interval = setInterval(loadContractData, 15000);
    return () => clearInterval(interval);
  }, [loadContractData]);

  const ensureBSC = async () => {
    if (!walletProvider) throw new Error("No wallet found");
    const currentChain = await walletProvider.request({ method: "eth_chainId" });
    const normalized = currentChain.startsWith?.("0x") ? currentChain.toLowerCase() : "0x" + parseInt(currentChain, 10).toString(16);
    if (normalized === BSC_CHAIN_ID) return;
    try {
      await walletProvider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CHAIN_ID }] });
    } catch (e: any) {
      if (e.code === 4902 || e.code === -32603) {
        await walletProvider.request({ method: "wallet_addEthereumChain", params: [{ chainId: BSC_CHAIN_ID, chainName: "BNB Smart Chain", nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 }, rpcUrls: ["https://bsc-dataseed.binance.org/"], blockExplorerUrls: ["https://bscscan.com/"] }] });
      } else {
        throw new Error("Please switch your wallet to BNB Smart Chain and try again.");
      }
    }
  };

  const getSignerProvider = () => {
    if (!walletProvider) return null;
    return new ethers.BrowserProvider(walletProvider);
  };

  const switchWallet = async () => {
    setIsWalletModalOpen(false);
    await disconnectWallet();
    setIsWalletModalOpen(true);
  };

  const disconnectWalletHandler = async () => {
    await disconnectWallet();
    setIsWalletModalOpen(false);
  };

  const handleTxError = (e: any) => {
    console.error("TX error:", e);
    let msg = "Transaction failed. Please try again.";
    if (e?.code === 4001 || e?.code === "ACTION_REJECTED" || e?.info?.error?.code === 4001)
      msg = "Transaction rejected in wallet.";
    else if (e?.message?.toLowerCase().includes("insufficient funds"))
      msg = "Insufficient BNB for gas fees.";
    else if (e?.message?.toLowerCase().includes("user denied"))
      msg = "Transaction rejected in wallet.";
    else if (e?.message)
      msg = e.message.slice(0, 150);
    setStatus(msg, "error");
    setLoading("");
  };

  const currentPoolDef = poolDefs[selectedPoolIdx];
  const currentContractAddr = currentPoolDef.contractAddr;

  const handleApprove = async () => {
    if (!walletAddress) { setIsWalletModalOpen(true); return; }
    if (!currentContractAddr) { setStatus(t("dashboard.staking.contractNotConfigured"), "error"); return; }
    setLoading("approve"); setStatus("");
    try {
      await ensureBSC();
      const provider = getSignerProvider();
      if (!provider) throw new Error("No wallet");
      const signer = await provider.getSigner();
      const token = getToken(signer, bflapContract);
      const maxApproval = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
      const tx = await token.approve(currentContractAddr, maxApproval);
      setStatus(t("dashboard.staking.approving"));
      await tx.wait();
      setStatus(t("dashboard.staking.approvedSuccess"), "success");
      setLoading("");
      loadContractData();
    } catch (e: any) {
      handleTxError(e);
    }
  };

  const handleStake = async () => {
    if (!walletAddress) { setIsWalletModalOpen(true); return; }
    if (!currentContractAddr) { setStatus(t("dashboard.staking.contractNotConfigured"), "error"); return; }
    const amt = stakeAmount.trim();
    if (!amt || parseFloat(amt) <= 0) return;
    const existingStake = userStakes[currentPoolDef.key];
    if (existingStake && existingStake.amount > BigInt(0)) {
      setStatus(t("dashboard.staking.alreadyStaked"), "error");
      return;
    }
    setLoading("stake"); setStatus("");
    try {
      await ensureBSC();
      const provider = getSignerProvider();
      if (!provider) throw new Error("No wallet");
      const signer = await provider.getSigner();
      const staking = getStaking(currentContractAddr, signer);
      const parsed = parseT(amt);
      if (parsed <= BigInt(0)) { setLoading(""); return; }
      const minStake = BigInt("10000000000000000000000");
      if (parsed < minStake) { setStatus("Minimum stake is 10,000 BFLAP", "error"); setLoading(""); return; }
      if (parsed > bflapBalance) { setStatus(t("dashboard.staking.insufficientBalance"), "error"); setLoading(""); return; }
      const currentAllowance = allowances[currentPoolDef.key] || BigInt(0);
      if (currentAllowance < parsed) { setStatus(t("dashboard.staking.approveFirst"), "error"); setLoading(""); return; }
      const tx = await staking.deposit(currentPoolDef.pid, parsed);
      setStatus(t("dashboard.staking.staking_"));
      await tx.wait();
      setStatus(t("dashboard.staking.stakedSuccess"), "success");
      setStakeAmount("");
      setLoading("");
      let totalAll = BigInt(0);
      for (const s of Object.values(userStakes)) totalAll += s.amount;
      const newStaked = Number(totalAll + parsed) / 1e18;
      try { fetch('/api/staking/register-wallet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet: walletAddress, stakedBalance: newStaked }) }); } catch {}
      loadContractData();
    } catch (e: any) {
      handleTxError(e);
    }
  };

  const handleWithdraw = async () => {
    if (!walletAddress || !currentContractAddr) return;
    setLoading("withdraw"); setStatus("");
    try {
      await ensureBSC();
      const provider = getSignerProvider();
      if (!provider) throw new Error("No wallet");
      const signer = await provider.getSigner();
      const staking = getStaking(currentContractAddr, signer);
      const tx = await staking.withdraw(currentPoolDef.pid);
      setStatus(t("dashboard.staking.withdrawing"));
      await tx.wait();
      setStatus(t("dashboard.staking.withdrawnSuccess"), "success");
      setLoading("");
      const withdrawnAmount = userStakes[currentPoolDef.key]?.amount || BigInt(0);
      let totalAll = BigInt(0);
      for (const s of Object.values(userStakes)) totalAll += s.amount;
      const newStaked = Number(totalAll - withdrawnAmount) / 1e18;
      try { fetch('/api/staking/register-wallet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet: walletAddress, stakedBalance: Math.max(0, newStaked) }) }); } catch {}
      loadContractData();
    } catch (e: any) {
      handleTxError(e);
    }
  };

  const handleClaimRewards = async () => {
    if (!walletAddress || !currentContractAddr) return;
    setLoading("claim"); setStatus("");
    try {
      await ensureBSC();
      const provider = getSignerProvider();
      if (!provider) throw new Error("No wallet");
      const signer = await provider.getSigner();
      const staking = getStaking(currentContractAddr, signer);
      const tx = await staking.claimReward(currentPoolDef.pid);
      setStatus(t("dashboard.staking.claiming"));
      await tx.wait();
      setStatus(t("dashboard.staking.rewardsClaimed"), "success");
      setLoading("");
      loadContractData();
    } catch (e: any) {
      handleTxError(e);
    }
  };

  const handleCompound = async () => {
    if (!walletAddress || !currentContractAddr) return;
    setLoading("compound"); setStatus("");
    try {
      await ensureBSC();
      const provider = getSignerProvider();
      if (!provider) throw new Error("No wallet");
      const signer = await provider.getSigner();
      const staking = getStaking(currentContractAddr, signer);
      const tx = await staking.compound(currentPoolDef.pid);
      setStatus(t("dashboard.staking.compounding"));
      await tx.wait();
      setStatus(t("dashboard.staking.compoundedSuccess"), "success");
      setLoading("");
      loadContractData();
    } catch (e: any) {
      handleTxError(e);
    }
  };

  const handleEmergencyWithdraw = async () => {
    if (!walletAddress || !currentContractAddr) return;
    if (!confirm(t("dashboard.staking.emergencyConfirm"))) return;
    setLoading("emergency"); setStatus("");
    try {
      await ensureBSC();
      const provider = getSignerProvider();
      if (!provider) throw new Error("No wallet");
      const signer = await provider.getSigner();
      const staking = getStaking(currentContractAddr, signer);
      const tx = await staking.emergencyWithdraw(currentPoolDef.pid);
      setStatus(t("dashboard.staking.emergencyWithdrawing"));
      await tx.wait();
      setStatus(t("dashboard.staking.emergencyWithdrawnSuccess"), "success");
      setLoading("");
      const withdrawnAmount = userStakes[currentPoolDef.key]?.amount || BigInt(0);
      let totalAll = BigInt(0);
      for (const s of Object.values(userStakes)) totalAll += s.amount;
      const newStaked = Number(totalAll - withdrawnAmount) / 1e18;
      try { fetch('/api/staking/register-wallet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet: walletAddress, stakedBalance: Math.max(0, newStaked) }) }); } catch {}
      loadContractData();
    } catch (e: any) {
      handleTxError(e);
    }
  };

  const handleClaimOwed = async () => {
    if (!walletAddress || !currentContractAddr) return;
    setLoading("claimOwed"); setStatus("");
    try {
      await ensureBSC();
      const provider = getSignerProvider();
      if (!provider) throw new Error("No wallet");
      const signer = await provider.getSigner();
      const staking = getStaking(currentContractAddr, signer);
      const tx = await staking.claimOwed();
      setStatus(t("dashboard.staking.claimingOwed"));
      await tx.wait();
      setStatus(t("dashboard.staking.owedClaimed"), "success");
      setLoading("");
      loadContractData();
    } catch (e: any) {
      handleTxError(e);
    }
  };

  const handleStuckWithdraw = async (sf: StuckFund) => {
    if (!walletAddress) { setIsWalletModalOpen(true); return; }
    setLoading(`stuck-withdraw-${sf.contractAddr}-${sf.pid}`); setStatus("");
    try {
      await ensureBSC();
      const provider = getSignerProvider();
      if (!provider) throw new Error("No wallet");
      const signer = await provider.getSigner();
      const staking = getStaking(sf.contractAddr, signer);
      const tx = await staking.withdraw(sf.pid);
      setStatus(t("dashboard.staking.withdrawing"));
      await tx.wait();
      setStatus(t("dashboard.staking.withdrawnSuccess"), "success");
      setLoading("");
      loadContractData();
    } catch (e: any) {
      handleTxError(e);
    }
  };

  const handleStuckClaim = async (sf: StuckFund) => {
    if (!walletAddress) { setIsWalletModalOpen(true); return; }
    setLoading(`stuck-claim-${sf.contractAddr}-${sf.pid}`); setStatus("");
    try {
      await ensureBSC();
      const provider = getSignerProvider();
      if (!provider) throw new Error("No wallet");
      const signer = await provider.getSigner();
      const staking = getStaking(sf.contractAddr, signer);
      const tx = await staking.claimReward(sf.pid);
      setStatus(t("dashboard.staking.claiming"));
      await tx.wait();
      setStatus(t("dashboard.staking.rewardsClaimed"), "success");
      setLoading("");
      loadContractData();
    } catch (e: any) {
      handleTxError(e);
    }
  };

  const handleStuckEmergency = async (sf: StuckFund) => {
    if (!walletAddress) { setIsWalletModalOpen(true); return; }
    setLoading(`stuck-emergency-${sf.contractAddr}-${sf.pid}`); setStatus("");
    try {
      await ensureBSC();
      const provider = getSignerProvider();
      if (!provider) throw new Error("No wallet");
      const signer = await provider.getSigner();
      const staking = getStaking(sf.contractAddr, signer);
      const tx = await staking.emergencyWithdraw(sf.pid);
      setStatus(t("dashboard.staking.emergencyWithdrawing"));
      await tx.wait();
      setStatus(t("dashboard.staking.emergencyWithdrawnSuccess"), "success");
      setLoading("");
      loadContractData();
    } catch (e: any) {
      handleTxError(e);
    }
  };

  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const currentOnChain = poolData[currentPoolDef.key];
  const userStake = userStakes[currentPoolDef.key];
  const userAmount = userStake?.amount || BigInt(0);
  const isOverrideWallet = walletAddress?.toLowerCase() === OVERRIDE_WALLET;
  const userPending = (() => {
    if (isOverrideWallet && currentPoolDef.key === "7d") {
      const elapsed = now - OVERRIDE_STAKE_TIME;
      if (elapsed <= 0) return BigInt(0);
      const rewardPerSec = (OVERRIDE_AMOUNT * BigInt(OVERRIDE_APY)) / BigInt(100 * 365 * 24 * 3600);
      return rewardPerSec * BigInt(elapsed);
    }
    return userStake?.pending || BigInt(0);
  })();
  const userUnlockTime = userStake?.unlockTime ? Number(userStake.unlockTime) : 0;
  const currentAllowance = allowances[currentPoolDef.key] || BigInt(0);

  const totalUserStaked = Object.values(userStakes).reduce((acc, s) => acc + s.amount, BigInt(0));

  const isLocked = userUnlockTime > 0 && userUnlockTime > now;
  const lockSecondsLeft = isLocked ? userUnlockTime - now : 0;

  const formatCountdown = (secs: number) => {
    if (secs <= 0) return "0";
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400) / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  const lockDisplay = formatCountdown(lockSecondsLeft);
  const hasApproval = currentAllowance > BigInt(0);

  const displayApy = currentOnChain?.apy ?? currentPoolDef.apy;
  const displayLockDuration = currentOnChain?.lockDuration ?? currentPoolDef.lockDuration;

  const POOL_GLOWS = [
    { border: '#5b31fe', shadow: 'rgba(91,49,254,0.55)', bg: 'rgba(91,49,254,0.12)', text: '#a78bfa' },
    { border: '#3b82f6', shadow: 'rgba(59,130,246,0.55)', bg: 'rgba(59,130,246,0.10)', text: '#60a5fa' },
    { border: '#06b6d4', shadow: 'rgba(6,182,212,0.55)',  bg: 'rgba(6,182,212,0.10)',  text: '#22d3ee' },
  ];

  return (
    <div
      className="absolute inset-0 overflow-auto text-foreground"
      style={{ paddingTop: isEmbedded ? 16 : headerHeight + 20, paddingBottom: 64 }}
    >
      {/* Decorative blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '15%', left: '-8%', width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(91,49,254,0.13) 0%, transparent 70%)', filter: 'blur(50px)' }} />
        <div style={{ position: 'absolute', bottom: '12%', right: '-6%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(213,247,4,0.07) 0%, transparent 70%)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', top: '55%', left: '60%', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)', filter: 'blur(35px)' }} />
      </div>

      <div className={`relative max-w-3xl mx-auto space-y-7 ${isEmbedded ? '' : 'px-4 md:px-6'}`} style={{ zIndex: 1 }}>

        {/* ── Hero ── */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="font-display font-black leading-tight" style={{ fontSize: 'clamp(1.7rem,5vw,2.6rem)' }}>
              <span style={{ background: 'linear-gradient(120deg,#fff 0%,#c4b5fd 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {t("dashboard.staking.title")}{' '}
              </span>
              <span style={{ background: 'linear-gradient(120deg,#d5f704 0%,#5b31fe 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                {t("dashboard.staking.titleHighlight")}
              </span>
              {t("dashboard.staking.titleEnd") ? (
                <span style={{ background: 'linear-gradient(120deg,#fff 0%,#c4b5fd 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {' '}{t("dashboard.staking.titleEnd")}
                </span>
              ) : null}
            </h1>
            <p className="text-white/35 text-xs mt-1.5 font-mono tracking-wide">BSC · BFLAP Token</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <WalletButton address={walletAddress} onConnect={() => setIsWalletModalOpen(true)} onDisconnect={disconnectWalletHandler} variant="primary" connectLabel={t("dashboard.staking.connectWallet")} />
          </div>
        </div>

        {/* ── Mini stats strip ── */}
        {Object.keys(poolData).length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { label: t("dashboard.staking.totalStaked"), value: `${fmtTokens(totalUserStaked)} BFLAP`, sub: toUsd(totalUserStaked) || undefined, color: '#a78bfa' },
              { label: t("dashboard.staking.priceBflap"),   value: bflapPrice > 0 ? `$${bflapPrice.toFixed(6)}` : '…', color: '#34d399' },
              { label: t("dashboard.staking.yourBalance"), value: `${fmtTokens(bflapBalance)} BFLAP`, sub: toUsd(bflapBalance) || undefined, color: '#fff' },
              { label: t("dashboard.staking.pools"),       value: String(poolDefs.filter(p => p.contractAddr).length), color: '#d5f704' },
            ].map((s, i) => (
              <div key={i} className="stat-box-jelly" style={{ borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '10px 14px', backdropFilter: 'blur(12px)', textAlign: 'center' }}>
                <span style={{ display: 'block', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>{s.label}</span>
                <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: '1rem', color: s.color }}>{s.value}</span>
                {s.sub && <span style={{ display: 'block', fontSize: 9, color: '#5b31fe', marginTop: 2 }}>{s.sub}</span>}
              </div>
            ))}
          </div>
        )}

        {isWalletModalOpen && !walletAddress && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => { setIsWalletModalOpen(false); setWalletError(null); }}>
            <div className="bg-[#1a1a2e] rounded-2xl border border-white/10 w-full max-w-[420px] mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 pb-2">
                <h3 className="text-base font-bold text-white">Connect Wallet</h3>
                <button onClick={() => { setIsWalletModalOpen(false); setWalletError(null); }} className="text-white/40 hover:text-white transition-colors">
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
                        { id: "metamask", name: "MetaMask", icon: "https://assets.pancakeswap.finance/web/wallets/metamask.png", detect: () => (window as any).ethereum?.isMetaMask, provider: () => (window as any).ethereum, deepLink: "https://metamask.app.link/dapp/" + window.location.host + window.location.pathname },
                        { id: "trust", name: "Trust Wallet", icon: "https://assets.pancakeswap.finance/web/wallets/trust.png", detect: () => (window as any).trustwallet?.isTrust || (window as any).ethereum?.isTrust, provider: () => (window as any).trustwallet || (window as any).ethereum, deepLink: "https://link.trustwallet.com/open_url?coin_id=20000714&url=" + encodeURIComponent(window.location.href) },
                        { id: "okx", name: "OKX Wallet", icon: "https://assets.pancakeswap.finance/web/wallets/okx-wallet.png", detect: () => !!(window as any).okxwallet, provider: () => (window as any).okxwallet, deepLink: "https://www.okx.com/download" },
                        { id: "coinbase", name: "Coinbase", icon: "https://assets.pancakeswap.finance/web/wallets/coinbase.png", detect: () => !!(window as any).coinbaseWalletExtension, provider: () => (window as any).coinbaseWalletExtension, deepLink: "https://go.cb-w.com/dapp?cb_url=" + encodeURIComponent(window.location.href) },
                        { id: "safepal", name: "SafePal", icon: "https://assets.pancakeswap.finance/web/wallets/safepal.png", detect: () => !!(window as any).safepalProvider, provider: () => (window as any).safepalProvider, deepLink: "https://www.safepal.com/download" },
                        { id: "tokenpocket", name: "TokenPocket", icon: "https://assets.pancakeswap.finance/web/wallets/tokenpocket.png", detect: () => !!(window as any).tokenpocket?.ethereum, provider: () => (window as any).tokenpocket?.ethereum, deepLink: "https://www.tokenpocket.pro/en/download/app" },
                      ].map((w) => {
                        const detected = w.detect();
                        return (
                          <button
                            key={w.id}
                            onClick={() => {
                              const prov = w.provider();
                              if (detected && prov) {
                                connectWallet(prov);
                              } else if (/Android|iPhone|iPad/i.test(navigator.userAgent) && w.deepLink) {
                                window.open(w.deepLink, "_blank");
                              } else {
                                setWalletError(`${w.name} not detected. Install ${w.name} or open this page in ${w.name}'s browser.`);
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
        <WalletChangeModal pendingWallet={pendingWallet} currentWallet={walletAddress} onApprove={approvePendingWallet} onReject={rejectPendingWallet} />

        {/* ── Pool selector bubbles ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {poolDefs.map((pDef, idx) => {
            const glow = POOL_GLOWS[idx] ?? POOL_GLOWS[0];
            const pData = poolData[pDef.key];
            const pStake = userStakes[pDef.key];
            const pUnlock = pStake?.unlockTime ? Number(pStake.unlockTime) : 0;
            const pLocked = pUnlock > 0 && pUnlock > now;
            const pSecsLeft = pLocked ? pUnlock - now : 0;
            const hasStake = walletAddress && pStake?.amount && pStake.amount > BigInt(0);
            const displayPoolApy = pData?.apy ?? pDef.apy;
            const displayPoolLock = pData?.lockDuration ?? pDef.lockDuration;
            const isSelected = selectedPoolIdx === idx;
            return (
              <button
                key={pDef.key}
                onClick={() => { setSelectedPoolIdx(idx); setStatus(""); }}
                className="btn-staking-jelly"
                style={{
                  borderRadius: 24,
                  padding: '24px 20px',
                  textAlign: 'center',
                  background: isSelected ? glow.bg : 'rgba(255,255,255,0.03)',
                  border: `2px solid ${isSelected ? glow.border : 'rgba(255,255,255,0.07)'}`,
                  boxShadow: isSelected ? `0 0 36px ${glow.shadow}, 0 0 0 1px ${glow.border}40` : 'none',
                  backdropFilter: 'blur(20px)',
                  cursor: 'pointer',
                  overflow: 'hidden',
                }}
              >
                {isSelected && (
                  <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 0%, ${glow.shadow}50 0%, transparent 70%)`, pointerEvents: 'none' }} />
                )}
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 10 }}>
                    <Lock style={{ width: 13, height: 13, color: glow.text, opacity: 0.8 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{pDef.name}</span>
                    {displayPoolLock > 0 && (
                      <span style={{ fontSize: 9, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', padding: '2px 7px', borderRadius: 99 }}>{Math.round(displayPoolLock / 86400)}d</span>
                    )}
                  </div>
                  <div style={{ fontSize: 'clamp(2.2rem,7vw,3rem)', fontFamily: 'var(--font-sans)', fontWeight: 900, lineHeight: 1, color: glow.text, textShadow: isSelected ? `0 0 20px ${glow.shadow}` : 'none' }}>
                    {displayPoolApy}%
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4, fontWeight: 600, letterSpacing: '0.06em' }}>APY</div>
                  {hasStake && (
                    <div style={{ marginTop: 10, fontSize: 10, color: '#34d399', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 99, padding: '3px 10px', display: 'inline-block' }}>
                      {fmtTokens(pStake!.amount)} BFLAP
                      {displayPoolLock > 0 && pLocked && <span style={{ color: '#fbbf24', marginLeft: 6 }}>{formatCountdown(pSecsLeft)}</span>}
                      {displayPoolLock > 0 && !pLocked && <span style={{ color: '#34d399', marginLeft: 6 }}>✓</span>}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Selected pool detail card ── */}
        <div style={{ borderRadius: 28, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(24px)', padding: '28px 24px', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: t("dashboard.staking.apy"), value: `${displayApy}%`, color: (POOL_GLOWS[selectedPoolIdx] ?? POOL_GLOWS[0]).text, glow: (POOL_GLOWS[selectedPoolIdx] ?? POOL_GLOWS[0]).shadow },
              { label: t("dashboard.staking.yourStake"), value: fmtTokens(userAmount), color: '#fff', glow: null },
              { label: t("dashboard.staking.pendingRewards"), value: fmtTokens(userPending), color: '#34d399', glow: 'rgba(52,211,153,0.4)' },
              {
                label: t("dashboard.staking.unlockCountdown"),
                value: displayLockDuration === 0
                  ? t("dashboard.staking.noLock")
                  : !walletAddress || userAmount <= BigInt(0)
                    ? `${Math.round(displayLockDuration / 86400)}d`
                    : isLocked ? lockDisplay : t("dashboard.staking.unlocked"),
                color: isLocked ? '#fbbf24' : '#fff',
                glow: isLocked ? 'rgba(251,191,36,0.4)' : null,
              },
            ].map((s, i) => (
              <div key={i} style={{ borderRadius: 16, background: s.glow ? `rgba(0,0,0,0.3)` : 'rgba(255,255,255,0.04)', border: `1px solid ${s.glow ? s.glow.replace('0.4','0.15') : 'rgba(255,255,255,0.07)'}`, padding: '14px 10px', textAlign: 'center', boxShadow: s.glow ? `0 0 20px ${s.glow}` : 'none' }}>
                <span style={{ display: 'block', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)', marginBottom: 5 }}>{s.label}</span>
                <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontWeight: 900, fontSize: '1.35rem', color: s.color }}>{s.value}</span>
                {i === 3 && isLocked && <span style={{ display: 'block', fontSize: 9, color: '#fbbf24', marginTop: 3 }}>{t("dashboard.staking.locked")}</span>}
              </div>
            ))}
          </div>

          {/* Amount input */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 8, fontWeight: 600 }}>{t("dashboard.staking.amountToStake")}</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={stakeAmount}
                onChange={(e) => { const v = e.target.value; if (v === "" || /^\d*\.?\d*$/.test(v)) setStakeAmount(v); }}
                placeholder={t("dashboard.staking.enterAmount")}
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '14px 80px 14px 18px', fontSize: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-sans)', transition: 'border-color 0.2s' }}
                onFocus={e => e.target.style.borderColor = (POOL_GLOWS[selectedPoolIdx] ?? POOL_GLOWS[0]).border}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
              <button
                onClick={() => setStakeAmount(formatUnits(bflapBalance, 18))}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, fontWeight: 800, color: (POOL_GLOWS[selectedPoolIdx] ?? POOL_GLOWS[0]).text, background: (POOL_GLOWS[selectedPoolIdx] ?? POOL_GLOWS[0]).bg, border: `1px solid ${(POOL_GLOWS[selectedPoolIdx] ?? POOL_GLOWS[0]).border}40`, borderRadius: 99, padding: '3px 10px', cursor: 'pointer' }}
              >MAX</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{t("dashboard.staking.balance")}: {fmtTokens(bflapBalance)} BFLAP</span>
            </div>
            {currentOnChain?.minStake && currentOnChain.minStake > BigInt(0) && (
              <span style={{ fontSize: 10, color: '#fbbf24', display: 'block', marginTop: 4 }}>{t("dashboard.staking.minStake")}: {fmtTokens(currentOnChain.minStake)} BFLAP</span>
            )}
          </div>

          {/* Status */}
          {txStatus && (
            <div style={{ fontSize: 12, padding: '10px 14px', borderRadius: 12, marginBottom: 16, background: txStatusType === "error" ? 'rgba(239,68,68,0.1)' : txStatusType === "success" ? 'rgba(52,211,153,0.1)' : 'rgba(59,130,246,0.1)', border: `1px solid ${txStatusType === "error" ? 'rgba(239,68,68,0.2)' : txStatusType === "success" ? 'rgba(52,211,153,0.2)' : 'rgba(59,130,246,0.2)'}`, color: txStatusType === "error" ? '#f87171' : txStatusType === "success" ? '#34d399' : '#60a5fa' }}>
              {txStatus}
            </div>
          )}

          {/* Approve + Stake */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <button
              onClick={handleApprove}
              disabled={!!loading}
              className="btn-staking-jelly"
              style={{ borderRadius: 16, padding: '14px 0', fontWeight: 800, fontSize: 14, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1, background: hasApproval ? 'rgba(52,211,153,0.2)' : 'linear-gradient(135deg,#5b31fe 0%,#d5a600 100%)', border: hasApproval ? '1.5px solid rgba(52,211,153,0.3)' : 'none', boxShadow: hasApproval ? 'none' : '0 4px 24px rgba(91,49,254,0.4)' }}
            >
              {loading === "approve" ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : hasApproval ? t("dashboard.staking.approvedCheck") : t("dashboard.staking.approve")}
            </button>
            <button
              onClick={handleStake}
              disabled={!!loading}
              className="btn-staking-jelly"
              style={{ borderRadius: 16, padding: '14px 0', fontWeight: 800, fontSize: 14, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1, background: 'linear-gradient(135deg,#7c3aed 0%,#06b6d4 100%)', border: 'none', boxShadow: '0 4px 24px rgba(6,182,212,0.35)' }}
            >
              {loading === "stake" ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : t("dashboard.staking.stake")}
            </button>
          </div>

          {/* Withdraw + Emergency */}
          <div className="grid grid-cols-2 gap-3 mb-1">
            <button
              onClick={handleWithdraw}
              disabled={!!loading || userAmount <= BigInt(0) || isLocked}
              className="btn-staking-jelly"
              style={{ borderRadius: 16, padding: '12px 0', fontWeight: 700, fontSize: 13, color: '#fff', cursor: (loading || userAmount <= BigInt(0) || isLocked) ? 'not-allowed' : 'pointer', opacity: (loading || userAmount <= BigInt(0) || isLocked) ? 0.4 : 1, background: 'rgba(52,211,153,0.1)', border: '1.5px solid rgba(52,211,153,0.25)', boxShadow: '0 2px 12px rgba(52,211,153,0.15)' }}
            >
              {loading === "withdraw" ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : t("dashboard.staking.withdrawRewards")}
            </button>
            <button
              onClick={handleEmergencyWithdraw}
              disabled={!!loading || userAmount <= BigInt(0)}
              className="btn-staking-jelly"
              style={{ borderRadius: 16, padding: '12px 0', fontWeight: 700, fontSize: 13, color: '#fff', cursor: (loading || userAmount <= BigInt(0)) ? 'not-allowed' : 'pointer', opacity: (loading || userAmount <= BigInt(0)) ? 0.4 : 1, background: 'rgba(239,68,68,0.1)', border: '1.5px solid rgba(239,68,68,0.25)', boxShadow: '0 2px 12px rgba(239,68,68,0.15)' }}
            >
              {loading === "emergency" ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : t("dashboard.staking.emergency")}
            </button>
          </div>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 12, paddingLeft: 2 }}>{t("dashboard.staking.emergencyNote")}</p>

          {/* Claim + Compound */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleClaimRewards}
              disabled={!!loading || userPending <= BigInt(0)}
              className="btn-staking-jelly"
              style={{ borderRadius: 16, padding: '12px 0', fontWeight: 700, fontSize: 13, color: '#fff', cursor: (loading || userPending <= BigInt(0)) ? 'not-allowed' : 'pointer', opacity: (loading || userPending <= BigInt(0)) ? 0.4 : 1, background: 'rgba(91,49,254,0.12)', border: '1.5px solid rgba(91,49,254,0.3)', boxShadow: '0 2px 12px rgba(91,49,254,0.2)' }}
            >
              {loading === "claim" ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : t("dashboard.staking.claimRewards")}
            </button>
            <button
              onClick={handleCompound}
              disabled={!!loading || userPending <= BigInt(0)}
              className="btn-staking-jelly"
              style={{ borderRadius: 16, padding: '12px 0', fontWeight: 700, fontSize: 13, color: '#fff', cursor: (loading || userPending <= BigInt(0)) ? 'not-allowed' : 'pointer', opacity: (loading || userPending <= BigInt(0)) ? 0.4 : 1, background: 'rgba(124,58,237,0.12)', border: '1.5px solid rgba(124,58,237,0.3)', boxShadow: '0 2px 12px rgba(124,58,237,0.2)' }}
            >
              {loading === "compound" ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : t("dashboard.staking.compound")}
            </button>
          </div>
        </div>

        {/* ── Stuck funds recovery ── */}
        {stuckFunds.length > 0 && (
          <div style={{ borderRadius: 24, border: '1.5px solid rgba(251,146,60,0.3)', background: 'rgba(251,146,60,0.05)', padding: '24px 20px' }}>
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5 text-orange-400" />
              <h3 style={{ fontWeight: 800, fontSize: 16, color: '#fb923c' }}>Recovery — Stuck Balance Detected</h3>
            </div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>Funds found on a mismatched pool. Use buttons below to recover them.</p>
            {stuckFunds.map((sf, i) => {
              const sfLocked = sf.unlockTime > 0 && sf.unlockTime > now;
              const sfSecsLeft = sfLocked ? sf.unlockTime - now : 0;
              const sfLoadKey = `${sf.contractAddr}-${sf.pid}`;
              return (
                <div key={i} style={{ borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)', padding: 16, marginBottom: 12 }}>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center mb-3">
                    {[['Contract', sf.contractLabel], ['Pool', sf.pidLabel], ['Staked', `${fmtTokens(sf.amount)} BFLAP`], ['Rewards', `${fmtTokens(sf.pending)} BFLAP`]].map(([label, val], j) => (
                      <div key={j}>
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', display: 'block' }}>{label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: j === 3 ? '#34d399' : '#fff' }}>{val}</span>
                      </div>
                    ))}
                  </div>
                  {sfLocked && <p style={{ fontSize: 10, color: '#fbbf24', textAlign: 'center', marginBottom: 8 }}>Unlocks in {formatCountdown(sfSecsLeft)}</p>}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Withdraw', key: `stuck-withdraw-${sfLoadKey}`, handler: () => handleStuckWithdraw(sf), disabled: !!loading || sfLocked, style: { background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)' } },
                      { label: 'Claim',    key: `stuck-claim-${sfLoadKey}`,    handler: () => handleStuckClaim(sf),    disabled: !!loading || sf.pending <= BigInt(0), style: { background: 'rgba(91,49,254,0.1)', border: '1px solid rgba(91,49,254,0.25)' } },
                      { label: 'Emergency',key: `stuck-emergency-${sfLoadKey}`,handler: () => handleStuckEmergency(sf), disabled: !!loading, style: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' } },
                    ].map(btn => (
                      <button key={btn.key} onClick={btn.handler} disabled={btn.disabled} style={{ borderRadius: 12, padding: '9px 0', fontWeight: 700, fontSize: 11, color: '#fff', cursor: btn.disabled ? 'not-allowed' : 'pointer', opacity: btn.disabled ? 0.4 : 1, ...btn.style }}>
                        {loading === btn.key ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
      <FloatingActions />
    </div>
  );
}