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
      candle(6, 10.5, 10.7, 9.4, 10),
      candle(7, 10, 10.2, 8.7, 9),
      candle(8, 9, 9.2, 7.6, 8),
      candle(9, 8, 13, 7.8, 12.5),
      candle(10, 12.5, 13.2, 9.5, 12.8),
      candle(11, 12.8, 13, 9.2, 10),
      candle(12, 10, 16.8, 9.8, 16.5),
      candle(13, 16, 16.1, 15, 15.5),
    ]
    const analysis = analyzeStructure(data, { pivotLength: 1, stopBufferPercent: 5, rewardRisk: 4, maxEntryWaitCandles: 20 })
    const bullish = analysis.fairValueGaps.find((gap) => gap.direction === 'long')

    expect(bullish).toBeDefined()
    expect(bullish?.midpoint).toBe(9.35)
    expect(bullish?.stopPrice).toBeCloseTo(7.52)
    expect(bullish?.targetPrice).toBeCloseTo(16.67)
    expect(bullish?.status).toBe('won')
  })

  it('matches the 01:17 low, 01:25 high, and 01:27 bearish CHoCH example', () => {
    const values: Array<[number, number, number, number]> = [
      [77157.2, 77160, 77129.6, 77130.9],
      [77130.9, 77172, 77121.8, 77171.9],
      [77171.9, 77172, 77113.6, 77126.5],
      [77126.5, 77203.6, 77126.5, 77203.2],
      [77203.2, 77266.8, 77197.1, 77261],
      [77261, 77261.1, 77207.5, 77228.8],
      [77228.8, 77342.9, 77204.4, 77328.3],
      [77328.3, 77328.3, 77238.8, 77280.9],
      [77280.9, 77328.7, 77280.9, 77310],
      [77310, 77310, 77207.9, 77250.8],
      [77250.8, 77262.5, 77205.4, 77222.5],
      [77222.5, 77262, 77200, 77262],
      [77262, 77319.1, 77262, 77296.8],
      [77296.8, 77297.8, 77253.3, 77281.2],
      [77281.2, 77288.9, 77239.5, 77239.5],
      [77239.5, 77255, 77239.5, 77253.4],
      [77253.4, 77272, 77238, 77254.2],
      [77254.2, 77268.6, 77236.1, 77266.9],
      [77266.9, 77319.9, 77266.9, 77319.9],
      [77319.9, 77322, 77234.4, 77241.4],
      [77241.4, 77255.9, 77217.4, 77223.5],
      [77223.5, 77223.6, 77177, 77197.7],
      [77197.7, 77200.2, 77118.5, 77142.5],
      [77142.5, 77142.6, 77108.1, 77114.4],
    ]
    const data = values.map(([open, high, low, close], index) => candle(index, open, high, low, close))
    const analysis = analyzeStructure(data)
    const setup = analysis.fairValueGaps.find((gap) => gap.choch.index === 21)

    expect(setup?.direction).toBe('short')
    expect(setup?.choch.brokenSwing).toMatchObject({ index: 11, price: 77200, type: 'low' })
    expect(setup?.choch.invalidationSwing).toMatchObject({ index: 19, price: 77322, type: 'high' })
    expect(setup?.bottom).toBe(77200.2)
    expect(setup?.top).toBe(77217.4)
    expect(setup?.midpoint).toBeCloseTo(77208.8)
    expect(setup?.stopPrice).toBeCloseTo(77326.38)
    expect(setup?.targetPrice).toBeCloseTo(76738.48)
    expect(setup?.status).toBe('open')
  })
})
