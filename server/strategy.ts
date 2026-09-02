import { alignedOneMinuteSetups, analyzeStructure } from '../src/lib/structureStrategy.js'
import type { Candle } from '../src/types.js'
import { restClient } from './bybit.js'
import { config } from './config.js'
import { pool } from './db.js'

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

const outcomeFor = (status: string) => {
  if (status === 'won') return { outcome: 'win', rResult: 4 }
  if (status === 'lost') return { outcome: 'loss', rResult: -1 }
  if (status === 'filled') return { outcome: 'active', rResult: 0 }
  if (status === 'expired') return { outcome: 'expired', rResult: 0 }
  return { outcome: 'waiting', rResult: 0 }
}

export async function scanStrategy(userId: string) {
  const [oneMinuteCandles, fifteenMinuteCandles] = await Promise.all([
    loadCandles('1', 1000),
    loadCandles('15', 500),
  ])
  const oneMinute = analyzeStructure(oneMinuteCandles.filter((candle) => candle.confirmed))
  const fifteenMinute = analyzeStructure(fifteenMinuteCandles.filter((candle) => candle.confirmed))
  const setups = alignedOneMinuteSetups(oneMinute, fifteenMinute)

  for (const setup of setups) {
    const result = outcomeFor(setup.status)
    await pool.query(
      `INSERT INTO trade_notifications
        (user_id, signal_key, direction, higher_timeframe_bias, detected_at, entry_time, exit_time,
         entry_price, stop_price, target_price, risk_usd, outcome, r_result)
       VALUES ($1, $2, $3, $4, TO_TIMESTAMP($5), TO_TIMESTAMP($6), TO_TIMESTAMP($7),
         $8, $9, $10, $11, $12, $13)
       ON CONFLICT (user_id, signal_key) DO UPDATE SET
         entry_time = EXCLUDED.entry_time,
         exit_time = EXCLUDED.exit_time,
         entry_price = EXCLUDED.entry_price,
         stop_price = EXCLUDED.stop_price,
         target_price = EXCLUDED.target_price,
         outcome = EXCLUDED.outcome,
         r_result = EXCLUDED.r_result,
         updated_at = NOW()`,
      [userId, setup.id, setup.direction, fifteenMinute.bias, setup.choch.time,
        setup.entryTime ?? null, setup.exitTime ?? null, setup.midpoint, setup.stopPrice,
        setup.targetPrice, config.strategyRiskUsd, result.outcome, result.rResult],
    )
  }

  return { scanned: setups.length, bias: fifteenMinute.bias }
}

export async function decideNotification(userId: string, notificationId: string, decision: 'accepted' | 'dismissed') {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query<{
      id: string
      direction: 'long' | 'short'
      outcome: 'win' | 'loss' | 'active' | 'waiting' | 'expired'
      entry_price: string
      stop_price: string
      target_price: string
      risk_usd: string
      r_result: string
      detected_at: Date
      entry_time: Date | null
      exit_time: Date | null
    }>(
      `UPDATE trade_notifications SET decision = $3, decided_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND decision IS NULL AND outcome IN ('win', 'loss')
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
          notification.outcome === 'win' ? Number(notification.target_price) : Number(notification.stop_price),
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
