# BubbleFlap Telegram Bot — Build Plan
**Bot handle:** @BubbleFlapbot  
**Chain:** BNB Smart Chain (BSC)  
**DEX:** PancakeSwap V2  
**Data source:** bubbleflap.fun API (live token feed)

---

## Fee System (NO smart contract needed)
Every swap routes through the bot code. Before sending to PancakeSwap, the bot splits the BNB:

```
User: /buy 0x... 0.1 BNB
  → BOT_FEE_WALLET gets 0.001 BNB (1%)
  → PancakeSwap gets 0.099 BNB → tokens sent to user wallet
```

Fee is taken in BNB on buys, and in BNB on sells (after swap, before sending back).
This is how Maestro, Banana Gun, and Unibot all work. No contract needed.

**Fee rate:** 1% per swap (adjustable via BOT_FEE_PERCENT in env)  
**Fee wallet:** your platform wallet (set in BOT_FEE_WALLET env)

---

## Architecture

```
bot/
  index.js          ← Entry point, starts bot + background jobs
  bot.js            ← Telegraf instance + middleware + error handler
  commands/
    start.js        ← /start — welcome, wallet creation
    wallet.js       ← /wallet — show address, BNB balance, export key
    buy.js          ← /buy <ca> <bnb_amount>
    sell.js         ← /sell <ca> <percent>
    snipe.js        ← /snipe <ca> [bnb_amount]
    scan.js         ← /scan <ca> — GoPlus + AI analysis
    alert.js        ← /alert <ca> <target_multiplier>
    new.js          ← /new — latest Flap.sh tokens
    cancel.js       ← /cancel — cancel active snipe/alert
    help.js         ← /help — command list
  lib/
    walletLib.js    ← AES-256 encrypt/decrypt user private keys
    swap.js         ← PancakeSwap V2 buy/sell, fee deduction
    sniper.js       ← BSC listener: new liquidity → auto-buy
    alertsJob.js    ← price monitor loop, notify on target hit
    goplus.js       ← GoPlus API security scan
    ai.js           ← OpenRouter AI token analysis
    tokens.js       ← fetch bubbleflap.fun live token data
    db.js           ← PostgreSQL helpers (bot tables)
    format.js       ← message formatting helpers
```

---

## Phase 1 — Core (build first) ✅ IN PROGRESS
- [x] Bot setup with Telegraf.js
- [x] /start — create encrypted wallet per user
- [x] /wallet — show address, BNB balance, deposit instructions
- [x] /scan <ca> — GoPlus + AI analysis via OpenRouter
- [x] /new — show 5 newest Flap.sh tokens
- [x] /help — command reference

## Phase 2 — Trading
- [ ] /buy <ca> <bnb> — swap with 1% fee to platform wallet
- [ ] /sell <ca> <percent> — sell % of holdings, 1% fee
- [ ] Slippage: default 10%, configurable

## Phase 3 — Automation
- [ ] /snipe <ca> [bnb] — wait for first DEX trade, auto-buy
- [ ] /alert <ca> <2x|3x|0.5x> — price target notification
- [ ] /cancel — cancel active snipe/alert

## Phase 4 — Polish (later)
- [ ] /settings — slippage, gas price
- [ ] /referral — referral code for fee rebate
- [ ] Anti-MEV protection

---

## Database Tables (added to existing PostgreSQL)

```sql
bot_users (
  telegram_id     BIGINT PRIMARY KEY,
  username        VARCHAR(100),
  wallet_address  VARCHAR(42),
  encrypted_key   TEXT,           -- AES-256 encrypted private key
  slippage        INT DEFAULT 10, -- percent
  created_at      TIMESTAMP DEFAULT NOW()
)

bot_snipes (
  id          SERIAL PRIMARY KEY,
  telegram_id BIGINT,
  ca          VARCHAR(42),
  amount_bnb  NUMERIC,
  status      VARCHAR(20) DEFAULT 'pending', -- pending|triggered|cancelled|failed
  created_at  TIMESTAMP DEFAULT NOW()
)

bot_alerts (
  id                SERIAL PRIMARY KEY,
  telegram_id       BIGINT,
  ca                VARCHAR(42),
  target_multiplier NUMERIC,     -- e.g. 2.0 for 2x
  entry_price       NUMERIC,
  triggered         BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMP DEFAULT NOW()
)

bot_trades (
  id            SERIAL PRIMARY KEY,
  telegram_id   BIGINT,
  ca            VARCHAR(42),
  direction     VARCHAR(4),   -- buy|sell
  amount_bnb    NUMERIC,
  fee_bnb       NUMERIC,
  tx_hash       VARCHAR(66),
  status        VARCHAR(20),  -- success|failed
  created_at    TIMESTAMP DEFAULT NOW()
)
```

---

## Secrets / Env
| Key | Status | Source |
|-----|--------|--------|
| TELEGRAM_BOT_TOKEN | ⏳ waiting | @BotFather → @BubbleFlapbot |
| OPENROUTER_API_KEY | ⏳ waiting | openrouter.ai |
| GOPLUS_APP_ID | ✅ in env | already configured |
| GOPLUS_APP_SECRET | ✅ in env | already configured |
| BOT_ENCRYPT_SECRET | ✅ auto-generated | random 32-char |
| BOT_FEE_WALLET | need to set | your platform wallet address |
| BOT_FEE_PERCENT | set to 1 | 1% per swap |

---

## Key Constants
- PancakeSwap V2 Router: `0x10ED43C718714eb63d5aA57B78B54704E256024E`
- WBNB: `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c`
- BSC RPC: `https://bsc-dataseed.binance.org/`
- Default slippage: 10%
- Default gas limit: 400,000
- Alert poll: every 15s
- Snipe poll: every 3s (BSC block time ~3s)

---

## Deployment
- Bot runs on VPS alongside app.js, managed by PM2
- Entry: `node bot/index.js`
- PM2 name: `bubbleflap-bot`
- VPS path: `/home/bubbleflap/bubbleflap.fun/bot/`

---

## Status
- [x] Plan created
- [ ] Phase 1 — building
- [ ] Phase 2 — not started
- [ ] Phase 3 — not started
- [ ] Deployed to VPS
