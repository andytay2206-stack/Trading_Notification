import { describe, expect, it } from 'vitest'
import type { Candle } from '../types'
import { randomHistoricalEnd, runEmaBacktest, type BacktestConfig } from './backtest'

const config: BacktestConfig = { interval: '15', candleCount: 300, fastEma: 3, slowEma: 5, atrPeriod: 3, rewardRisk: 2, riskUsd: 100 }

const candles = (closes: number[]): Candle[] => closes.map((close, index) => ({
  time: 1_700_000_000 + index * 900,
  open: close,
  high: close + 0.5,
  low: close - 0.5,
  close,
  volume: 1,
  confirmed: true,
}))

describe('runEmaBacktest', () => {
  it('returns internally consistent result totals', () => {
    const result = runEmaBacktest(candles([10, 10, 9, 8, 9, 11, 13, 15, 14, 12, 10, 8, 7, 9, 12]), config)
    expect(result.trades.length).toBeGreaterThan(0)
    expect(result.netProfitUsd).toBeCloseTo(result.netR * config.riskUsd)
    expect(result.wins + result.losses).toBeLessThanOrEqual(result.trades.length)
  })

  it('returns an empty result when there are not enough candles', () => {
    expect(runEmaBacktest(candles([1, 2, 3]), config).trades).toHaveLength(0)
  })
})

describe('randomHistoricalEnd', () => {
  it('chooses a time between two days and 732 days ago', () => {
    const now = new Date('2026-09-01T00:00:00Z').getTime()
    const end = randomHistoricalEnd(now, () => 0.5)
    expect(end).toBeLessThan(now - 2 * 86_400_000)
    expect(end).toBeGreaterThan(now - 732 * 86_400_000)
  })
})
