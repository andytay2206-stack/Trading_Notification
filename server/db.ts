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
      status TEXT NOT NULL CHECK (status IN ('open', 'win', 'loss', 'breakeven', 'cancelled')),
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
      cancellations INTEGER NOT NULL DEFAULT 0,
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
      exit_price NUMERIC(20, 8),
      risk_usd NUMERIC(14, 2) NOT NULL,
      outcome TEXT NOT NULL CHECK (outcome IN ('waiting', 'active', 'win', 'loss', 'missed', 'cancelled')),
      r_result NUMERIC(12, 4) NOT NULL DEFAULT 0,
      decision TEXT CHECK (decision IN ('accepted', 'dismissed')),
      decided_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, signal_key)
    );

    CREATE TABLE IF NOT EXISTS strategy_runtime (
      user_id BIGINT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
      strategy_version TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE trades ADD COLUMN IF NOT EXISTS source_notification_id BIGINT;
    ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_status_check;
    ALTER TABLE trades ADD CONSTRAINT trades_status_check
      CHECK (status IN ('open', 'win', 'loss', 'breakeven', 'cancelled'));
    CREATE UNIQUE INDEX IF NOT EXISTS trades_source_notification_unique
      ON trades(source_notification_id) WHERE source_notification_id IS NOT NULL;
    ALTER TABLE backtest_runs ADD COLUMN IF NOT EXISTS cancellations INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE trade_notifications ADD COLUMN IF NOT EXISTS strategy_version TEXT NOT NULL DEFAULT 'structure-v1';
    ALTER TABLE trade_notifications ADD COLUMN IF NOT EXISTS exit_price NUMERIC(20, 8);
    ALTER TABLE trade_notifications DROP CONSTRAINT IF EXISTS trade_notifications_outcome_check;
    UPDATE trade_notifications SET outcome = 'cancelled' WHERE outcome = 'expired';
    ALTER TABLE trade_notifications ADD CONSTRAINT trade_notifications_outcome_check
      CHECK (outcome IN ('waiting', 'active', 'win', 'loss', 'missed', 'cancelled'));
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
