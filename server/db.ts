import bcrypt from 'bcryptjs'
import pg from 'pg'
import { config } from './config.js'

const { Pool } = pg
export const pool = new Pool({ connectionString: config.databaseUrl })

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS trades (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL DEFAULT 'BTCUSDT',
      side TEXT NOT NULL CHECK (side IN ('long', 'short')),
      status TEXT NOT NULL CHECK (status IN ('open', 'win', 'loss', 'breakeven')),
      entry_price NUMERIC(20, 8) NOT NULL,
      exit_price NUMERIC(20, 8),
      risk_usd NUMERIC(14, 2) NOT NULL,
      pnl_usd NUMERIC(14, 2) NOT NULL DEFAULT 0,
      r_multiple NUMERIC(12, 4) NOT NULL DEFAULT 0,
      opened_at TIMESTAMPTZ NOT NULL,
      closed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS performance_snapshots (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      total_profit_usd NUMERIC(14, 2) NOT NULL,
      total_r NUMERIC(12, 4) NOT NULL,
      overall_win_rate NUMERIC(7, 4) NOT NULL,
      today_win_rate NUMERIC(7, 4) NOT NULL,
      total_trades INTEGER NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS backtest_runs (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL DEFAULT 'BTCUSDT',
      strategy_name TEXT NOT NULL,
      interval TEXT NOT NULL,
      candle_count INTEGER NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      window_end TIMESTAMPTZ NOT NULL,
      risk_usd NUMERIC(14, 2) NOT NULL,
      reward_risk NUMERIC(8, 2) NOT NULL,
      net_profit_usd NUMERIC(14, 2) NOT NULL,
      net_r NUMERIC(12, 4) NOT NULL,
      win_rate NUMERIC(7, 4) NOT NULL,
      wins INTEGER NOT NULL,
      losses INTEGER NOT NULL,
      total_trades INTEGER NOT NULL,
      max_drawdown_r NUMERIC(12, 4) NOT NULL,
      config JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS trade_notifications (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      signal_key TEXT NOT NULL,
      symbol TEXT NOT NULL DEFAULT 'BTCUSDT',
      direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
      timeframe TEXT NOT NULL DEFAULT '1',
      higher_timeframe_bias TEXT NOT NULL,
      detected_at TIMESTAMPTZ NOT NULL,
      entry_time TIMESTAMPTZ,
      exit_time TIMESTAMPTZ,
      entry_price NUMERIC(20, 8) NOT NULL,
      stop_price NUMERIC(20, 8) NOT NULL,
      target_price NUMERIC(20, 8) NOT NULL,
      risk_usd NUMERIC(14, 2) NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('waiting', 'active', 'win', 'loss', 'expired')),
      r_result NUMERIC(12, 4) NOT NULL DEFAULT 0,
      decision TEXT CHECK (decision IN ('accepted', 'dismissed')),
      decided_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, signal_key)
    );

    ALTER TABLE trades ADD COLUMN IF NOT EXISTS source_notification_id BIGINT;
    CREATE UNIQUE INDEX IF NOT EXISTS trades_source_notification_unique
      ON trades(source_notification_id) WHERE source_notification_id IS NOT NULL;
  `)

  const passwordHash = await bcrypt.hash(config.adminPassword, 12)
  await pool.query(
    `INSERT INTO app_users (username, password_hash) VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [config.adminUsername, passwordHash],
  )
}

export async function closeDatabase() {
  await pool.end()
}
