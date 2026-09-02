import { describe, expect, it } from 'vitest'
import type { Candle } from '../types'
import { alignedOneMinuteSetups, analyzeStructure, findSwingPoints } from './structureStrategy'

const candle = (index: number, open: number, high: number, low: number, close: number): Candle => ({
  time: 1_700_000_000 + index * 60,
  open,
  high,
  low,
  close,
  volume: 1,
  confirmed: true,
})

describe('market structure strategy', () => {
  it('finds confirmed swing highs and lows', () => {
    const data = [
      candle(0, 10, 11, 9, 10), candle(1, 10, 12, 9.5, 11), candle(2, 11, 15, 10, 14),
      candle(3, 14, 14.5, 9.8, 10), candle(4, 10, 13, 8, 9), candle(5, 9, 12, 9, 11), candle(6, 11, 13, 10, 12),
    ]
    const swings = findSwingPoints(data, 2)
    expect(swings).toEqual(expect.arrayContaining([
      expect.objectContaining({ index: 2, type: 'high', price: 15 }),
      expect.objectContaining({ index: 4, type: 'low', price: 8 }),
    ]))
  })

  it('only aligns one-minute gaps with the fifteen-minute bias', () => {
    const longGap = { direction: 'long' as const, choch: { time: 10 } }
    const shortGap = { direction: 'short' as const, choch: { time: 10 } }
    const oneMinute = { swings: [], chochEvents: [], fairValueGaps: [longGap, shortGap], biasChanges: [], bias: 'long' as const }
    const fifteenMinute = { swings: [], chochEvents: [], fairValueGaps: [], biasChanges: [{ time: 0, direction: 'short' as const }], bias: 'short' as const }
    expect(alignedOneMinuteSetups(oneMinute as never, fifteenMinute)).toEqual([shortGap])
  })

  it('handles insufficient candles without producing false signals', () => {
    const analysis = analyzeStructure([candle(0, 10, 11, 9, 10)])
    expect(analysis.chochEvents).toHaveLength(0)
    expect(analysis.fairValueGaps).toHaveLength(0)
    expect(analysis.bias).toBe('neutral')
  })

  it('creates a bullish CHoCH FVG with buffered stop and a 4R target', () => {
    const data = [
      candle(0, 10, 10.5, 9.5, 10),
      candle(1, 10, 12, 9.8, 11),
      candle(2, 11, 11.4, 9.2, 10),
      candle(3, 10, 10.5, 8, 8.5),
      candle(4, 8.5, 10, 8.4, 9.5),
      candle(5, 9.5, 11, 8.8, 10.5),
      candle(6, 10.5, 10.7, 7.8, 8.2),
      candle(7, 8.2, 9, 7, 7.5),
      candle(8, 7.5, 10, 7.4, 9.8),
      candle(9, 9.8, 13, 9.5, 12.5),
      candle(10, 12.5, 13.2, 10.5, 12.8),
      candle(11, 12.8, 13, 10.2, 11),
      candle(12, 11, 14.2, 10.8, 14),
      candle(13, 14, 14.1, 13, 13.5),
    ]
    const analysis = analyzeStructure(data, { pivotLength: 1, stopBufferPercent: 5, rewardRisk: 4, maxEntryWaitCandles: 20 })
    const bullish = analysis.fairValueGaps.find((gap) => gap.direction === 'long')

    expect(bullish).toBeDefined()
    expect(bullish?.midpoint).toBe(10.25)
    expect(bullish?.stopPrice).toBeCloseTo(9.325)
    expect(bullish?.targetPrice).toBeCloseTo(13.95)
    expect(bullish?.status).toBe('won')
  })
})
