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
    const longGap = { direction: 'long' as const }
    const shortGap = { direction: 'short' as const }
    const oneMinute = { swings: [], chochEvents: [], fairValueGaps: [longGap, shortGap], bias: 'long' as const }
    const fifteenMinute = { swings: [], chochEvents: [], fairValueGaps: [], bias: 'short' as const }
    expect(alignedOneMinuteSetups(oneMinute as never, fifteenMinute)).toEqual([shortGap])
  })

  it('handles insufficient candles without producing false signals', () => {
    const analysis = analyzeStructure([candle(0, 10, 11, 9, 10)])
    expect(analysis.chochEvents).toHaveLength(0)
    expect(analysis.fairValueGaps).toHaveLength(0)
    expect(analysis.bias).toBe('neutral')
  })
})
