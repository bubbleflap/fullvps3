# Bubble Flap — Replit Development Environment

## Project Overview
BubbleFlap is a BNB-chain token explorer and lottery platform. It displays live token data from Flap.sh (a BNB bonding curve DEX), supports a lottery/spin system, volume bot, staking, and a chatbot. Also includes ASTER pair pages (newaster, bondingaster, bswapaster) — completely isolated from BNB pages.

## Architecture
- **Frontend**: React 19 + Vite 6 + Tailwind CSS 4, served on port 5000 in dev
- **Backend**: Node.js Express + WebSocket server (`server.js`), runs on port 3001 in dev
- **Database**: PostgreSQL (Replit-hosted for dev, external cPanel DB on production VPS)
- **Production**: Served via PM2 on VPS at `bubbleflap.fun` (AlmaLinux 9 / cPanel)

## Development Workflow
- **Start**: `bash dev.sh` — starts backend (port 3001) + Vite frontend (port 5000)
- Vite proxies `/api` and `/ws` to the backend automatically
- Hot reload enabled for frontend

## Deployment to VPS
**RULE: Never deploy to VPS without explicit user command. Always finish editing and get approval first.**

Run `bash deploy.sh` to push your changes to the live server at bubbleflap.fun.

What it does:
1. Builds the Vite frontend → `dist/` then copies to `public/`
2. rsyncs changed files to `/home/bubbleflap/bubbleflap.fun/` on the VPS (203.161.41.61)
3. Runs `npm install --omit=dev` on VPS
4. Restarts the PM2 process (`bubbleflap`)

**Requires**: `.deploy/id_ed25519` SSH private key (gitignored). The public key is already authorized on the VPS.

## Key Files
| File | Purpose |
|------|---------|
| `server.js` | Dev backend — Express API + WebSocket + DB queries |
| `app.js` | **Production backend on VPS** — MUST be kept in sync with server.js |
| `src/` | React frontend source |
| `public/` | Built frontend assets (served by Express in production) |
| `vite.config.ts` | Dev server config (port 5000, proxy to 3001) |
| `database_setup.sql` | Full PostgreSQL schema (safe to re-run) |
| `deploy.sh` | One-command deploy to VPS |
| `dev.sh` | Local dev startup script |
| `build.sh` | Frontend build + copy to public/ |

## PAGE → DATA SOURCE MAPPING
**Each page has ONE dedicated data source. Do NOT mix them.**
**Homepage pages (bubble maps) and Dashboard sections (card lists) are SEPARATE.**

### ══ HOMEPAGE PAGES (bubble map visualizations) ══

| URL | Page View | Frontend Component | API Endpoint | Data Source |
|-----|-----------|-------------------|--------------|-------------|
| `/` | NEW bubble map | `src/components/NewTokenPage.tsx` | `/api/new-tokens` + WS `new` | Flap.sh GraphQL `newlyCreated` |
| `/bonding` | Bonding bubble map | `src/components/BondingPage.tsx` | `/api/bonding-tokens` | Flap.sh GraphQL `bonding` |
| `/dexpaid` | DexPaid standalone | (standalone page) | `/api/dexpaid-tokens` | `dexPaidService.js` |

### ══ DASHBOARD SECTIONS (card lists at /dashboard#section) ══

| Hash | Section | Frontend Component | API Endpoint | Service/Source | Data Description |
|------|---------|-------------------|--------------|----------------|-----------------|
| `#newtokens` | NEW | `sections/NewTokens.tsx` | `/api/new-tokens` + WS | `cachedNewTokens` | Newly created Flap.sh tokens |
| `#recentbonding` | Recent Bonding | `sections/RecentBonding.tsx` | `/api/bonded-tokens` | `cachedListedTokens` | Recently listed from Flap.sh cache |
| `#bonding` | Bonding (Latest) | `sections/Bonding.tsx` | `/api/bonding-section` | `bondingListedService.js` → `bondingService.js` | Verified Flap.sh graduates: PancakeSwap V2 PairCreated / V3 PoolCreated events, filtered by 7777/8888 suffix, Portal originator check, 15+ BNB liquidity floor |
| `#dexpaid` | Dex Paid | `sections/DexPaid.tsx` | `/api/dexpaid-tokens` | `dexPaidService.js` | DexScreener boost/paid tokens |
| `#partner` | Partner | `sections/Partner.tsx` | `/api/partner-tokens` | `partnerCAsSet` (DB) | Curated partner tokens |
| `#bswap` | BSwap | `sections/InfoPage.tsx` | N/A | Static info | Links to /bflapswap |
| `#tokenomics` | Tokenomics | `sections/InfoPage.tsx` | N/A | Static info | Links to /tokenomics |
| `#lottery` | Lottery | `sections/InfoPage.tsx` | N/A | Static info | Links to /lottery |
| `#staking` | Staking | `sections/InfoPage.tsx` | N/A | Static info | Links to /staking |

### URL HASH NAVIGATION
- `/dashboard` → defaults to `#newtokens`
- `/dashboard#bonding` → opens Bonding section directly
- Clicking sidebar updates URL hash via `history.replaceState`
- Browser back/forward works via `hashchange` listener

### PAGINATION RULE
- All card list sections use `usePagination.ts`: **15 per page, max 5 pages = 75 tokens cap**
- Display whatever correct data is available, max 75

### BACKEND SYNC RULE
Any route or import added to `server.js` MUST also be added to `app.js` — they are the same backend for dev vs production.

## Database Schema (PostgreSQL)
Tables: `site_settings`, `site_visitors`, `dex_paid_detected`, `cached_new_tokens`, `recent_graduations`, `volume_bot_campaigns`, `volume_bot_wallets`, `lottery_spins`, `lottery_wallets`, `lottery_purchases`, `lottery_settings`, `jackpot_counter`, `jackpot_purchase_pool`, `jackpot_winners`

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (auto-set by Replit)
- `OPENROUTER_API_KEY` — For chatbot (optional, also configurable via admin panel in DB)
- `MORALIS_API_KEY` — For token logo enrichment (optional)

## VPS Info
- **IP**: 203.161.41.61
- **App dir**: `/home/bubbleflap/bubbleflap.fun/`
- **Process manager**: PM2 (process name: `bubbleflap`)
- **Entry point on VPS**: `app.js`
- **SSH key**: `.deploy/id_ed25519` (gitignored)

## SSL Certificates (VPS)
All services secured with Let's Encrypt via acme.sh. Cert covers: `webmail`, `cpanel`, `whm`, `mail` subdomains.

| Service | Port | Status |
|---------|------|--------|
| WHM | 2087 | Let's Encrypt (valid to May 31 2026) |
| cPanel | 2083 | Let's Encrypt (valid to May 31 2026) |
| Webmail | 2096 | Let's Encrypt (valid to May 31 2026) |
| IMAP/Dovecot | 993 | Let's Encrypt (valid to May 31 2026) |
| SMTP/Exim | 465 | Let's Encrypt (valid to May 31 2026) |

**Auto-renewal**: acme.sh cron runs daily at 22:12 UTC. On renewal, `/root/deploy-ssl.sh` redeploys certs to all services automatically.

**Cert location on VPS**: `/root/.acme.sh/webmail.bubbleflap.fun/`
**Deploy hook script**: `/root/deploy-ssl.sh`
**Webroot for DCV**: `/home/bubbleflap/bubbleflap.fun/public` (served by Node.js app)
