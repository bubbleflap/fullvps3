export interface DToken {
  address?: string;
  ca?: string;
  name?: string;
  ticker?: string;
  image?: string;
  mcap?: number;
  price?: number;
  liquidity?: number;
  volume24h?: number;
  buys24h?: number;
  sells24h?: number;
  createdAt?: string;
  graduatedAt?: number | string;
  listedAt?: number;
  dexUrl?: string;
  change24h?: number;
  holders?: number;
  bondProgress?: number;
  graduated?: boolean;
  confirmedGraduated?: boolean;
  dexPaid?: boolean;
  aveLogo?: boolean;
  devHoldPercent?: number;
  buyTax?: number;
  sellTax?: number;
}

export type DashSection =
  | "home"
  | "recentbonding"
  | "newtokens"
  | "bonding"
  | "dexpaid"
  | "partner"
  | "lottery"
  | "staking"
  | "bswap"
  | "volumebot"
  | "telegrambot"
  | "kolsrank"
  | "whitepaper";
