-- Bubble Flap Database Setup
-- Run this entire script in phpPgAdmin > SQL tab on the shieqfjm_bubbleflap database
-- Safe to run multiple times — uses IF NOT EXISTS and ON CONFLICT DO NOTHING

-- 1. Site Settings table
CREATE TABLE IF NOT EXISTS site_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO site_settings (key, value) VALUES
  ('ca_address', '0x000000000000000000000000'),
  ('telegram', 'https://t.me/BubbleFlap'),
  ('twitter', 'https://x.com/BubbleFlapFun'),
  ('github', 'https://github.com/bubbleflap'),
  ('email', 'dev@bubbleflap.fun'),
  ('bflap_link', 'https://flap.sh/bnb/0x'),
  ('flapsh_link', 'https://flap.sh/bnb/board')
ON CONFLICT (key) DO NOTHING;

-- 2. Site Visitors table (traffic tracking)
CREATE TABLE IF NOT EXISTS site_visitors (
  id SERIAL PRIMARY KEY,
  visitor_id VARCHAR(100) NOT NULL,
  ip_hash VARCHAR(100) NOT NULL,
  page VARCHAR(200) NOT NULL DEFAULT '/',
  user_agent TEXT,
  referrer TEXT,
  country VARCHAR(10) DEFAULT NULL,
  last_seen TIMESTAMP NOT NULL DEFAULT now(),
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_visitors_visitor_id ON site_visitors (visitor_id);
CREATE INDEX IF NOT EXISTS idx_site_visitors_ip_hash ON site_visitors (ip_hash);
CREATE INDEX IF NOT EXISTS idx_site_visitors_last_seen ON site_visitors (last_seen);
CREATE INDEX IF NOT EXISTS idx_site_visitors_created_at ON site_visitors (created_at);
CREATE INDEX IF NOT EXISTS idx_site_visitors_country ON site_visitors (country);

-- 3. DexPaid detected timestamps
CREATE TABLE IF NOT EXISTS dex_paid_detected (
  address VARCHAR(42) PRIMARY KEY,
  detected_at BIGINT NOT NULL
);

-- 4. Graduated Tokens cache (persists across server restarts)
CREATE TABLE IF NOT EXISTS graduated_tokens (
  address VARCHAR(42) PRIMARY KEY,
  data JSONB NOT NULL,
  graduated_at BIGINT,
  confirmed_graduated BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graduated_tokens_graduated_at ON graduated_tokens(graduated_at DESC);

-- 5. Cached New Tokens (newly created tokens from Flap.sh)
CREATE TABLE IF NOT EXISTS cached_new_tokens (
  address VARCHAR(66) PRIMARY KEY,
  data JSON NOT NULL,
  mcap NUMERIC DEFAULT 0,
  last_seen_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 6. Recent Graduations (tracks recently detected graduations)
CREATE TABLE IF NOT EXISTS recent_graduations (
  address VARCHAR(44) PRIMARY KEY,
  data JSONB NOT NULL,
  detected_at TIMESTAMP DEFAULT NOW()
);

-- 7. Volume Bot Campaigns
CREATE TABLE IF NOT EXISTS volume_bot_campaigns (
  id SERIAL PRIMARY KEY,
  status VARCHAR(20) DEFAULT 'running',
  settings_json TEXT,
  target_volume NUMERIC DEFAULT 0,
  volume_generated NUMERIC DEFAULT 0,
  tx_count INTEGER DEFAULT 0,
  bnb_spent NUMERIC DEFAULT 0,
  sub_wallet_keys TEXT,
  error TEXT,
  started_at TIMESTAMP DEFAULT now(),
  ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  userbot_address VARCHAR(42),
  userbot_private_key VARCHAR(66)
);

-- 8. Volume Bot Wallets
CREATE TABLE IF NOT EXISTS volume_bot_wallets (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL,
  address VARCHAR(42) NOT NULL,
  private_key VARCHAR(66) NOT NULL,
  campaign_id INTEGER,
  created_at TIMESTAMP DEFAULT now()
);

-- ============================================================
-- LOTTERY TABLES
-- ============================================================

-- 9. Lottery Spins (every spin result recorded here)
CREATE TABLE IF NOT EXISTS lottery_spins (
  id SERIAL PRIMARY KEY,
  ip_hash VARCHAR(100) NOT NULL,
  wallet_address VARCHAR(42) NOT NULL,
  segment_id VARCHAR(50),
  title VARCHAR(100),
  prize NUMERIC DEFAULT 0,
  display VARCHAR(100),
  tier VARCHAR(3) NOT NULL DEFAULT '099',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lottery_spins_wallet ON lottery_spins(wallet_address);
CREATE INDEX IF NOT EXISTS idx_lottery_spins_created_at ON lottery_spins(created_at DESC);

-- 10. Lottery Wallets (per-wallet spin balances and totals)
CREATE TABLE IF NOT EXISTS lottery_wallets (
  ip_hash VARCHAR(100) NOT NULL,
  wallet_address VARCHAR(42) PRIMARY KEY,
  purchased_spins INTEGER NOT NULL DEFAULT 0,
  purchased_spins_049 INTEGER NOT NULL DEFAULT 0,
  purchased_spins_150 INTEGER NOT NULL DEFAULT 0,
  total_won NUMERIC NOT NULL DEFAULT 0,
  total_bflap_won INTEGER NOT NULL DEFAULT 0,
  total_bnb_won NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 11. Lottery Purchases (every verified on-chain purchase)
CREATE TABLE IF NOT EXISTS lottery_purchases (
  id SERIAL PRIMARY KEY,
  ip_hash VARCHAR(100) NOT NULL,
  wallet_address VARCHAR(42) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  price_bnb NUMERIC NOT NULL DEFAULT 0,
  total_bnb NUMERIC NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  tx_hash VARCHAR(66),
  currency VARCHAR(10) DEFAULT 'bnb',
  amount_paid NUMERIC DEFAULT 0,
  tier VARCHAR(3) DEFAULT '099',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lottery_purchases_wallet ON lottery_purchases(wallet_address);
CREATE INDEX IF NOT EXISTS idx_lottery_purchases_tx_hash ON lottery_purchases(tx_hash);

-- 12. Lottery Settings (RTP and other admin-controlled params)
CREATE TABLE IF NOT EXISTS lottery_settings (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO lottery_settings (key, value) VALUES ('rtp', '60') ON CONFLICT (key) DO NOTHING;

-- 13. Jackpot Counter (global purchase counts per tier — triggers jackpot every 100)
CREATE TABLE IF NOT EXISTS jackpot_counter (
  id INTEGER PRIMARY KEY DEFAULT 1,
  total_spins INTEGER NOT NULL DEFAULT 0,
  total_purchases_049 INTEGER NOT NULL DEFAULT 0,
  total_purchases_099 INTEGER NOT NULL DEFAULT 0,
  total_purchases_150 INTEGER NOT NULL DEFAULT 0
);

INSERT INTO jackpot_counter (id, total_spins, total_purchases_049, total_purchases_099, total_purchases_150)
VALUES (1, 0, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- 14. Jackpot Purchase Pool (tracks every purchase for winner selection)
CREATE TABLE IF NOT EXISTS jackpot_purchase_pool (
  id SERIAL PRIMARY KEY,
  tier VARCHAR(3) NOT NULL,
  tier_purchase_number INTEGER NOT NULL,
  wallet_address VARCHAR(42) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jackpot_purchase_pool_tier ON jackpot_purchase_pool(tier, tier_purchase_number);

-- 15. Jackpot Winners (history of jackpot payouts)
CREATE TABLE IF NOT EXISTS jackpot_winners (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL,
  pool_spin_number INTEGER NOT NULL,
  bnb_amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- GRANT ACCESS to app database user
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE site_settings TO shieqfjm_bubbledev;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE site_visitors TO shieqfjm_bubbledev;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dex_paid_detected TO shieqfjm_bubbledev;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE graduated_tokens TO shieqfjm_bubbledev;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE cached_new_tokens TO shieqfjm_bubbledev;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE recent_graduations TO shieqfjm_bubbledev;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE volume_bot_campaigns TO shieqfjm_bubbledev;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE volume_bot_wallets TO shieqfjm_bubbledev;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE lottery_spins TO shieqfjm_bubbledev;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE lottery_wallets TO shieqfjm_bubbledev;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE lottery_purchases TO shieqfjm_bubbledev;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE lottery_settings TO shieqfjm_bubbledev;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE jackpot_counter TO shieqfjm_bubbledev;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE jackpot_purchase_pool TO shieqfjm_bubbledev;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE jackpot_winners TO shieqfjm_bubbledev;

GRANT USAGE, SELECT ON SEQUENCE site_visitors_id_seq TO shieqfjm_bubbledev;
GRANT USAGE, SELECT ON SEQUENCE volume_bot_campaigns_id_seq TO shieqfjm_bubbledev;
GRANT USAGE, SELECT ON SEQUENCE volume_bot_wallets_id_seq TO shieqfjm_bubbledev;
GRANT USAGE, SELECT ON SEQUENCE lottery_spins_id_seq TO shieqfjm_bubbledev;
GRANT USAGE, SELECT ON SEQUENCE lottery_purchases_id_seq TO shieqfjm_bubbledev;
GRANT USAGE, SELECT ON SEQUENCE jackpot_purchase_pool_id_seq TO shieqfjm_bubbledev;
GRANT USAGE, SELECT ON SEQUENCE jackpot_winners_id_seq TO shieqfjm_bubbledev;

-- CLEANUP SQL (run manually when needed to reset token data):
-- DELETE FROM graduated_tokens;
-- DELETE FROM cached_new_tokens;
-- DELETE FROM recent_graduations;
