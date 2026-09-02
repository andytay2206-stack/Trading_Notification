import { describe, expect, it } from 'vitest'
import type { Candle } from '../types'
import { randomHistoricalEnd, runStructureBacktest, type BacktestConfig } from './backtest'

const config: BacktestConfig = {
  interval: '1', candleCount: 1000, pivotLength: 1, stopBufferPercent: 5, rewardRisk: 4, riskUsd: 100,
}

const values: Array<[number, number, number, number]> = [
  [10, 10.5, 9.5, 10], [10, 12, 9.8, 11], [11, 11.4, 9.2, 10], [10, 10.5, 8, 8.5],
  [8.5, 10, 8.4, 9.5], [9.5, 11, 8.8, 10.5], [10.5, 10.7, 7.8, 8.2], [8.2, 9, 7, 7.5],
  [7.5, 10, 7.4, 9.8], [9.8, 13, 9.5, 12.5], [12.5, 13.2, 10.5, 12.8],
  [12.8, 13, 10.2, 11], [11, 14.2, 10.8, 14], [14, 14.1, 13, 13.5],
]

const candles = (seconds: number, start = 1_700_000_000): Candle[] => values.map(([open, high, low, close], index) => ({
  time: start + index * seconds,
  open, high, low, close, volume: 1, confirmed: true,
}))

describe('runStructureBacktest', () => {
  it('scores aligned CHoCH/FVG trades in R and USD', () => {
    const result = runStructureBacktest(candles(60), candles(900, 1_699_985_000), config)
    expect(result.trades).toHaveLength(1)
    expect(result.wins).toBe(1)
    expect(result.netR).toBe(4)
    expect(result.netProfitUsd).toBe(400)
    expect(result.winRate).toBe(100)
  })

  it('returns no trades when higher-timeframe bias is unavailable', () => {
    const result = runStructureBacktest(candles(60), candles(900).slice(0, 2), config)
    expect(result.trades).toHaveLength(0)
    expect(result.netR).toBe(0)
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
