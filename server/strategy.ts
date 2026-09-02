import { analyzeStructure, oneSetupAtATime } from '../src/lib/structureStrategy.js'
import type { Candle } from '../src/types.js'
import { restClient } from './bybit.js'
import { config } from './config.js'
import { pool } from './db.js'
import type { FairValueGap } from '../src/lib/structureStrategy.js'

const STRATEGY_VERSION = 'structure-v7'
interface StrategyScanResult {
  scanned: number
  bias: 'long' | 'short' | 'neutral'
  startedAt: Date
}
const activeScans = new Map<string, Promise<StrategyScanResult>>()

export async function getStrategyRuntime(userId: string) {
  const result = await pool.query<{ started_at: Date }>(
    `INSERT INTO strategy_runtime (user_id, strategy_version)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET
       strategy_version = EXCLUDED.strategy_version,
       started_at = CASE
         WHEN strategy_runtime.strategy_version <> EXCLUDED.strategy_version THEN NOW()
         ELSE strategy_runtime.started_at
       END,
       updated_at = NOW()
     RETURNING started_at`,
    [userId, STRATEGY_VERSION],
  )
  return { startedAt: result.rows[0].started_at }
}

async function loadCandles(interval: '1' | '15', limit: number): Promise<Candle[]> {
  const response = await restClient.getKline({ category: 'linear', symbol: 'BTCUSDT', interval, limit })
  if (response.retCode !== 0) throw new Error(response.retMsg || 'Bybit rejected strategy candle request')
  const duration = Number(interval) * 60
  return response.result.list.map(([time, open, high, low, close, volume]) => ({
    time: Number(time) / 1000,
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
    volume: Number(volume),
    confirmed: Number(time) / 1000 + duration <= Date.now() / 1000,
  })).reverse()
}

const outcomeFor = (setup: FairValueGap) => {
  if (setup.status === 'won') return { outcome: 'win', rResult: setup.rResult ?? 4 }
  if (setup.status === 'lost') return { outcome: 'loss', rResult: setup.rResult ?? -1 }
  if (setup.status === 'missed') return { outcome: 'missed', rResult: 0 }
  if (setup.status === 'cancelled') return { outcome: 'cancelled', rResult: setup.rResult ?? 0 }
  if (setup.status === 'filled') return { outcome: 'active', rResult: 0 }
  return { outcome: 'waiting', rResult: 0 }
}

async function expireStaleUnfilledPredictions(userId: string) {
  await pool.query(
    `UPDATE trade_notifications SET
       outcome = 'cancelled', exit_time = detected_at + INTERVAL '1 hour',
       r_result = 0, updated_at = NOW()
     WHERE user_id = $1 AND outcome = 'waiting' AND entry_time IS NULL
       AND detected_at <= NOW() - INTERVAL '62 minutes'`,
    [userId],
  )
}

async function reconcileExistingPredictions(userId: string, setups: FairValueGap[]) {
  const pending = await pool.query<{ id: string; signal_key: string }>(
    `SELECT id, signal_key FROM trade_notifications
     WHERE user_id = $1 AND outcome IN ('waiting', 'active')`,
    [userId],
  )
  const byId = new Map(setups.map((setup) => [setup.id, setup]))
  for (const notification of pending.rows) {
    const setupId = notification.signal_key.slice(notification.signal_key.indexOf(':') + 1)
    const setup = byId.get(setupId)
    if (!setup || !['won', 'lost', 'missed', 'cancelled'].includes(setup.status)) continue
    const result = outcomeFor(setup)
    await pool.query(
      `UPDATE trade_notifications SET
         entry_time = TO_TIMESTAMP($3), exit_time = TO_TIMESTAMP($4), exit_price = $5,
         outcome = $6, r_result = $7, updated_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [notification.id, userId, setup.entryTime ?? null, setup.exitTime ?? null,
        setup.exitPrice ?? null, result.outcome, result.rResult],
    )
  }
}

async function performStrategyScan(userId: string): Promise<StrategyScanResult> {
  const [oneMinuteCandles, fifteenMinuteCandles] = await Promise.all([
    loadCandles('1', 1000),
    loadCandles('15', 500),
  ])
  const oneMinute = analyzeStructure(oneMinuteCandles.filter((candle) => candle.confirmed))
  const fifteenMinute = analyzeStructure(fifteenMinuteCandles.filter((candle) => candle.confirmed))
  await reconcileExistingPredictions(userId, oneMinute.fairValueGaps)
  await expireStaleUnfilledPredictions(userId)
  const runtime = await getStrategyRuntime(userId)
  const startedAtSeconds = runtime.startedAt.getTime() / 1000
  const eligible = oneMinute.fairValueGaps
    .filter((setup) => setup.choch.time >= startedAtSeconds)
  const setups = oneSetupAtATime(eligible)

  for (const setup of setups) {
    const result = outcomeFor(setup)
    const knownBias = fifteenMinute.biasChanges
      .filter((change) => change.time <= setup.choch.time)
      .at(-1)?.direction ?? 'neutral'
    await pool.query(
      `INSERT INTO trade_notifications
        (user_id, signal_key, strategy_version, direction, higher_timeframe_bias, detected_at, entry_time, exit_time,
         entry_price, stop_price, target_price, exit_price, risk_usd, outcome, r_result)
       VALUES ($1, $2, $3, $4, $5, TO_TIMESTAMP($6), TO_TIMESTAMP($7), TO_TIMESTAMP($8),
         $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (user_id, signal_key) DO UPDATE SET
         entry_time = EXCLUDED.entry_time,
         exit_time = EXCLUDED.exit_time,
         entry_price = EXCLUDED.entry_price,
         stop_price = EXCLUDED.stop_price,
         target_price = EXCLUDED.target_price,
         exit_price = EXCLUDED.exit_price,
         outcome = EXCLUDED.outcome,
         r_result = EXCLUDED.r_result,
         updated_at = NOW()`,
      [userId, `${STRATEGY_VERSION}:${setup.id}`, STRATEGY_VERSION, setup.direction, knownBias, setup.choch.time,
        setup.entryTime ?? null, setup.exitTime ?? null, setup.midpoint, setup.stopPrice,
        setup.targetPrice, setup.exitPrice ?? null, config.strategyRiskUsd, result.outcome, result.rResult],
    )
  }

  return { scanned: setups.length, bias: fifteenMinute.bias, startedAt: runtime.startedAt }
}

export function scanStrategy(userId: string) {
  const active = activeScans.get(userId)
  if (active) return active

  const scan = performStrategyScan(userId)
  activeScans.set(userId, scan)
  const clear = () => {
    if (activeScans.get(userId) === scan) activeScans.delete(userId)
  }
  void scan.then(clear, clear)
  return scan
}

export async function decideNotification(userId: string, notificationId: string, decision: 'accepted' | 'dismissed') {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query<{
      id: string
      direction: 'long' | 'short'
      outcome: 'win' | 'loss' | 'active' | 'waiting' | 'missed' | 'cancelled'
      entry_price: string
      stop_price: string
      target_price: string
      exit_price: string | null
      risk_usd: string
      r_result: string
      detected_at: Date
      entry_time: Date | null
      exit_time: Date | null
    }>(
      `UPDATE trade_notifications SET decision = $3, decided_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND decision IS NULL
         AND (outcome IN ('win', 'loss') OR (outcome = 'cancelled' AND entry_time IS NOT NULL))
       RETURNING *`,
      [notificationId, userId, decision],
    )
    const notification = result.rows[0]
    if (!notification) throw new Error('Notification is unavailable or already decided')

    if (decision === 'accepted') {
      const entry = Number(notification.entry_price)
      const riskUsd = Number(notification.risk_usd)
      const rResult = Number(notification.r_result)
      await client.query(
        `INSERT INTO trades
          (user_id, symbol, side, status, entry_price, exit_price, risk_usd, pnl_usd, r_multiple,
           opened_at, closed_at, source_notification_id)
         VALUES ($1, 'BTCUSDT', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT DO NOTHING`,
        [userId, notification.direction, notification.outcome, entry,
          notification.outcome === 'win' ? Number(notification.target_price)
            : notification.outcome === 'loss' ? Number(notification.stop_price) : Number(notification.exit_price),
          riskUsd, riskUsd * rResult, rResult, notification.entry_time ?? notification.detected_at,
          notification.exit_time ?? new Date(), notification.id],
      )
    }
    await client.query('COMMIT')
    return notification
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
