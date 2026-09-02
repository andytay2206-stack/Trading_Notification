import { describe, expect, it } from 'vitest'
import type { Candle } from '../types'
import { randomHistoricalEnd, runStructureBacktest, type BacktestConfig } from './backtest'

const config: BacktestConfig = {
  interval: '1', candleCount: 1000, pivotLength: 1, stopBufferPercent: 5, rewardRisk: 4, riskUsd: 100,
}

const values: Array<[number, number, number, number]> = [
  [10, 10.5, 9.5, 10], [10, 12, 9.8, 11], [11, 11.4, 9.2, 10], [10, 10.5, 8, 8.5],
  [8.5, 10, 8.4, 9.5], [9.5, 11, 8.8, 10.5], [10.5, 10.7, 9.4, 10], [10, 10.2, 8.7, 9],
  [9, 9.2, 7.6, 8], [8, 13, 7.8, 12.5], [12.5, 13.2, 9.5, 12.8],
  [12.8, 13, 9.2, 10], [10, 16.8, 9.8, 16.5], [16.5, 16.6, 15, 15.5],
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

  it('tracks the one-minute setup when higher-timeframe bias is unavailable', () => {
    const result = runStructureBacktest(candles(60), candles(900).slice(0, 2), config)
    expect(result.trades).toHaveLength(1)
    expect(result.netR).toBe(4)
  })

  it('only scores setups detected inside the selected historical window', () => {
    const oneMinute = candles(60)
    const result = runStructureBacktest(oneMinute, candles(900, 1_699_985_000), config, oneMinute.at(-1)!.time + 1)
    expect(result.trades).toHaveLength(0)
  })
})

describe('randomHistoricalEnd', () => {
  it('chooses a minute-aligned endpoint between two days and two years ago', () => {
    const now = new Date('2026-09-01T00:00:00Z').getTime()
    const end = randomHistoricalEnd(now, () => 0.5)
    expect(end).toBeLessThanOrEqual(now - 2 * 86_400_000)
    expect(end).toBeGreaterThanOrEqual(now - 732 * 86_400_000)
    expect(end % 60_000).toBe(0)
  })
})
