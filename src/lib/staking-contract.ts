import { ethers } from "ethers";

export const BFLAP_TOKEN_ADDRESS = "0xa2320fff1069ED5b4B02dDb386823E837A7e7777";
export const BSC_CHAIN_ID = "0x38";
export const BSC_RPC = "https://bsc-dataseed.binance.org/";

const BSC_RPC_LIST = [
  "https://bsc-dataseed.binance.org/",
  "https://bsc-dataseed1.defibit.io/",
  "https://bsc-dataseed1.ninicoin.io/",
  "https://bsc.publicnode.com",
];

export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

export const STAKING_ABI = [
  "function poolLength() view returns (uint256)",
  "function getTotalStaked() view returns (uint256)",
  "function getUserInfo(uint256 _pid, address _user) view returns (uint256 amount, uint256 unlockTime, uint256 pendingRewards)",
  "function pendingReward(uint256 _pid, address _user) view returns (uint256)",
  "function rewardsRemaining() view returns (uint256)",
  "function maxRewardPerc() view returns (uint256)",
  "function totalRewardsClaimed(uint256 _pid, address _user) view returns (uint256)",
  "function paused() view returns (bool)",
  "function blacklisted(address) view returns (bool)",
  "function owedTokens(address) view returns (uint256)",
  "function getAllPoolAPYs() view returns (uint256[] apys, uint256[] lockDurations, uint256[] totalStakeds)",
  "function getAllPoolSettings() view returns (uint256[] penalties, bool[] actives, uint256[] minStakes)",
  "function getPoolName(uint256 _pid) view returns (string)",
  "function deposit(uint256 _pid, uint256 _amount)",
  "function withdraw(uint256 _pid)",
  "function claimReward(uint256 _pid)",
  "function claimAllRewards()",
  "function compound(uint256 _pid)",
  "function emergencyWithdraw(uint256 _pid)",
  "function claimOwed()",
];

export function getProvider() {
  const w = window as any;
  const provider = w.ethereum || w.BinanceChain || w.trustwallet?.ethereum;
  if (!provider) return null;
  return new ethers.BrowserProvider(provider);
}

let _cachedReadProvider: ethers.JsonRpcProvider | null = null;
let _cachedRpcIndex = 0;

export function getReadProvider(): ethers.JsonRpcProvider {
  if (_cachedReadProvider) return _cachedReadProvider;
  _cachedReadProvider = new ethers.JsonRpcProvider(BSC_RPC_LIST[0]);
  return _cachedReadProvider;
}

export function rotateReadProvider(): ethers.JsonRpcProvider {
  _cachedRpcIndex = (_cachedRpcIndex + 1) % BSC_RPC_LIST.length;
  _cachedReadProvider = new ethers.JsonRpcProvider(BSC_RPC_LIST[_cachedRpcIndex]);
  return _cachedReadProvider;
}

export function getStakingContract(stakingAddress: string, signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(stakingAddress, STAKING_ABI, signerOrProvider);
}

export function getTokenContract(signerOrProvider: ethers.Signer | ethers.Provider, address?: string) {
  return new ethers.Contract(address || BFLAP_TOKEN_ADDRESS, ERC20_ABI, signerOrProvider);
}

export function formatTokens(value: bigint, decimals: number = 18): string {
  const formatted = ethers.formatUnits(value, decimals);
  const num = parseFloat(formatted);
  if (num === 0) return "0";
  if (num < 0.01) return "<0.01";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
  if (num >= 1_000) return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return num.toFixed(2);
}

export function parseTokens(value: string, decimals: number = 18): bigint {
  try {
    return ethers.parseUnits(value, decimals);
  } catch {
    return BigInt(0);
  }
}