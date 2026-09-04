import { analyzeStructure, currentStrategyVersion, defaultStructureSettings, setupSequenceAfter, strategyCandleLimits } from '../src/lib/structureStrategy.js'
import type { Candle } from '../src/types.js'
import { restClient } from './bybit.js'
import { config } from './config.js'
import { pool } from './db.js'
import type { FairValueGap } from '../src/lib/structureStrategy.js'

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
    [userId, currentStrategyVersion],
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
  })).filter((candle) => [candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)
    && candle.time > 0
    && candle.high >= Math.max(candle.open, candle.close, candle.low)
    && candle.low <= Math.min(candle.open, candle.close, candle.high))
    .reverse()
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

async function reconcileExistingPredictions(
  userId: string,
  setupsByVersion: Record<string, FairValueGap[]>,
  oneMinuteCandles: Candle[],
) {
  const pending = await pool.query<{
    id: string
    signal_key: string
    strategy_version: string
    direction: 'long' | 'short'
    outcome: 'waiting' | 'active'
    detected_at: Date
    entry_time: Date | null
    entry_price: string
    stop_price: string
    target_price: string
  }>(
    `SELECT id, signal_key, strategy_version, direction, outcome, detected_at, entry_time,
       entry_price, stop_price, target_price
     FROM trade_notifications
     WHERE user_id = $1 AND outcome IN ('waiting', 'active')`,
    [userId],
  )
  const indexes = new Map(Object.entries(setupsByVersion).map(([version, setups]) => [version, {
    byId: new Map(setups.flatMap((setup) => [
      [setup.id, setup] as const,
      [`${setup.setupType}-${setup.direction}-${setup.choch.time}`, setup] as const,
    ])),
    byEvent: new Map(setups.flatMap((setup) => [
      [`${setup.direction}:${setup.detectedTime}`, setup] as const,
      [`${setup.direction}:${setup.choch.time}`, setup] as const,
    ])),
  }]))
  for (const notification of pending.rows) {
    if (notification.outcome === 'active' && notification.entry_time) {
      const entryTime = notification.entry_time.getTime() / 1000
      const stopPrice = Number(notification.stop_price)
      const targetPrice = Number(notification.target_price)
      const resolution = oneMinuteCandles.find((candle) => {
        if (candle.time < entryTime) return false
        const stopped = notification.direction === 'long' ? candle.low <= stopPrice : candle.high >= stopPrice
        const targeted = notification.direction === 'long' ? candle.high >= targetPrice : candle.low <= targetPrice
        return stopped || targeted
      })
      if (resolution) {
        const stopped = notification.direction === 'long'
          ? resolution.low <= stopPrice
          : resolution.high >= stopPrice
        await pool.query(
          `UPDATE trade_notifications SET exit_time = TO_TIMESTAMP($3), exit_price = $4,
             outcome = $5, r_result = $6, updated_at = NOW()
           WHERE id = $1 AND user_id = $2`,
          [notification.id, userId, resolution.time, stopped ? stopPrice : targetPrice,
            stopped ? 'loss' : 'win', stopped ? -1 : 4],
        )
      }
      continue
    }
    const index = indexes.get(notification.strategy_version) ?? indexes.get(currentStrategyVersion)
    if (!index) continue
    const setupId = notification.signal_key.slice(notification.signal_key.indexOf(':') + 1)
    const setup = index.byId.get(setupId) ?? index.byEvent.get(
      `${notification.direction}:${Math.floor(notification.detected_at.getTime() / 1000)}`,
    )
    if (!setup) continue
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
    loadCandles('1', strategyCandleLimits.oneMinute),
    loadCandles('15', strategyCandleLimits.fifteenMinute),
  ])
  const oneMinute = analyzeStructure(oneMinuteCandles)
  const versionSevenOneMinute = analyzeStructure(oneMinuteCandles, {
    ...defaultStructureSettings,
    pivotLength: 2,
    stopBufferPercent: 5,
  })
  const fifteenMinute = analyzeStructure(fifteenMinuteCandles)
  const runtime = await getStrategyRuntime(userId)
  await reconcileExistingPredictions(userId, {
    [currentStrategyVersion]: oneMinute.fairValueGaps,
    'structure-v7': versionSevenOneMinute.fairValueGaps,
  }, oneMinuteCandles)
  await expireStaleUnfilledPredictions(userId)
  const unresolved = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM trade_notifications
     WHERE user_id = $1 AND outcome IN ('waiting', 'active')`,
    [userId],
  )
  if (Number(unresolved.rows[0].count) > 0) {
    return { scanned: 0, bias: fifteenMinute.bias, startedAt: runtime.startedAt }
  }
  const latestResolution = await pool.query<{ boundary: Date | null }>(
    `SELECT MAX(exit_time) AS boundary
     FROM trade_notifications
     WHERE user_id = $1 AND strategy_version = $2 AND exit_time IS NOT NULL`,
    [userId, currentStrategyVersion],
  )
  const resolvedBoundary = latestResolution.rows[0].boundary?.getTime() ?? Number.NEGATIVE_INFINITY
  const exclusiveBoundary = Math.max(runtime.startedAt.getTime(), resolvedBoundary) / 1000
  const setups = setupSequenceAfter(oneMinute.fairValueGaps, exclusiveBoundary)

  for (const setup of setups) {
    const result = outcomeFor(setup)
    const knownBias = fifteenMinute.biasChanges
      .filter((change) => change.time <= setup.detectedTime)
      .at(-1)?.direction ?? 'neutral'
    await pool.query(
      `INSERT INTO trade_notifications
        (user_id, signal_key, strategy_version, setup_type, direction, higher_timeframe_bias, detected_at, entry_time, exit_time,
         entry_price, stop_price, target_price, exit_price, risk_usd, outcome, r_result)
       VALUES ($1, $2, $3, $4, $5, $6, TO_TIMESTAMP($7), TO_TIMESTAMP($8), TO_TIMESTAMP($9),
         $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (user_id, signal_key) DO UPDATE SET
         setup_type = EXCLUDED.setup_type,
         higher_timeframe_bias = EXCLUDED.higher_timeframe_bias,
         entry_time = EXCLUDED.entry_time,
         exit_time = EXCLUDED.exit_time,
         entry_price = EXCLUDED.entry_price,
         stop_price = EXCLUDED.stop_price,
         target_price = EXCLUDED.target_price,
         exit_price = EXCLUDED.exit_price,
         outcome = EXCLUDED.outcome,
         r_result = EXCLUDED.r_result,
         updated_at = NOW()`,
      [userId, `${currentStrategyVersion}:${setup.id}`, currentStrategyVersion, setup.setupType, setup.direction, knownBias, setup.detectedTime,
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
