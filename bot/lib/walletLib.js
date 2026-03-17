import crypto from 'crypto';
import { ethers } from 'ethers';

const ALGORITHM = 'aes-256-gcm';

function getEncryptKey() {
  const secret = process.env.BOT_ENCRYPT_SECRET;
  if (!secret) throw new Error('BOT_ENCRYPT_SECRET not set');
  return crypto.scryptSync(secret, 'bubbleflap-bot-salt-v1', 32);
}

export function encryptKey(privateKey) {
  const key = getEncryptKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptKey(encryptedBase64) {
  const key = getEncryptKey();
  const data = Buffer.from(encryptedBase64, 'base64');
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
}

export function getMasterWallet() {
  const pk = process.env.BOT_MASTER_PRIVATE_KEY;
  if (!pk) throw new Error('BOT_MASTER_PRIVATE_KEY not set');
  const provider = getProvider();
  return new ethers.Wallet(pk, provider);
}

// ─── Multi-Wallet: Active wallet for a user ──────────────────────────────────

export async function seedHdWalletIfNeeded(telegramId) {
  const { getUserWallets, createWalletRecord } = await import('./db.js');
  const wallets = await getUserWallets(telegramId);
  if (wallets.length === 0) {
    const { address, privateKey } = deriveUserWallet(telegramId);
    const encPk = encryptKey(privateKey);
    await createWalletRecord(telegramId, 'Wallet 1', address, encPk, 'hd', true);
  }
}

export async function getActiveWalletData(telegramId) {
  try {
    const { getDefaultWallet } = await import('./db.js');
    const w = await getDefaultWallet(telegramId);
    if (w) {
      const privateKey = decryptKey(w.encrypted_pk);
      return { address: w.address, privateKey, name: w.name, id: w.id, walletType: w.wallet_type };
    }
  } catch {}
  return deriveUserWallet(telegramId);
}

export async function sendBnb(privateKey, toAddress, amountBnb) {
  const signer = getSigner(privateKey);
  const value  = ethers.parseEther(String(amountBnb));
  const tx     = await signer.sendTransaction({ to: toAddress, value });
  await tx.wait(1);
  return tx.hash;
}

export function deriveUserWallet(telegramId) {
  const pk = process.env.BOT_MASTER_PRIVATE_KEY;
  if (!pk) throw new Error('BOT_MASTER_PRIVATE_KEY not set');
  const seed = crypto.createHmac('sha256', pk)
    .update(`bubbleflap-user-${telegramId}`)
    .digest('hex');
  const derivedKey = '0x' + seed;
  const wallet = new ethers.Wallet(derivedKey);
  return {
    address: wallet.address,
    privateKey: derivedKey,
  };
}

const BSC_NETWORK = { name: 'bnb', chainId: 56 };

export function getProvider() {
  const rpc = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/';
  return new ethers.JsonRpcProvider(rpc, BSC_NETWORK, { staticNetwork: true });
}

export function getSigner(privateKey) {
  return new ethers.Wallet(privateKey, getProvider());
}

export async function getBnbBalance(address) {
  const provider = getProvider();
  const bal = await provider.getBalance(address);
  return parseFloat(ethers.formatEther(bal));
}

export async function getTokenBalance(walletAddress, tokenCa) {
  const provider = getProvider();
  const abi = [
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
  ];
  const contract = new ethers.Contract(tokenCa, abi, provider);
  const [balance, decimals, symbol] = await Promise.all([
    contract.balanceOf(walletAddress),
    contract.decimals(),
    contract.symbol(),
  ]);
  return {
    raw: balance,
    formatted: parseFloat(ethers.formatUnits(balance, decimals)),
    decimals: Number(decimals),
    symbol,
  };
}
