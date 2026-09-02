import { describe, expect, it } from 'vitest'
import type { Candle } from '../types'
import { alignedOneMinuteSetups, analyzeStructure, findSwingPoints, oneSetupAtATime } from './structureStrategy'

const candle = (index: number, open: number, high: number, low: number, close: number): Candle => ({
  time: 1_700_000_000 + index * 60,
  open,
  high,
  low,
  close,
  volume: 1,
  confirmed: true,
})

const bullishSequence = [
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

  it('keeps tracking a filled trade after its entry-wait window until the 4R target', () => {
    const analysis = analyzeStructure(bullishSequence, { pivotLength: 1, stopBufferPercent: 5, rewardRisk: 4, maxSetupCandles: 4 })
    const bullish = analysis.fairValueGaps.find((gap) => gap.direction === 'long')

    expect(bullish).toBeDefined()
    expect(bullish?.midpoint).toBe(9.35)
    expect(bullish?.stopPrice).toBeCloseTo(7.52)
    expect(bullish?.targetPrice).toBeCloseTo(16.67)
    expect(bullish?.status).toBe('won')
  })

  it('cancels a filled trade at its lifetime close and records partial R', () => {
    const data = [...bullishSequence]
    data[12] = candle(12, 10, 10.5, 9.8, 10)
    const analysis = analyzeStructure(data, { pivotLength: 1, stopBufferPercent: 5, rewardRisk: 4, maxSetupCandles: 3 })
    const setup = analysis.fairValueGaps.find((gap) => gap.direction === 'long')

    expect(setup?.status).toBe('cancelled')
    expect(setup?.exitTime).toBe(data[12].time)
    expect(setup?.exitPrice).toBe(10)
    expect(setup?.rResult).toBeCloseTo((10 - 9.35) / (9.35 - 7.52))
  })

  it('ignores later setups until the selected setup has finished', () => {
    const setup = (time: number, exitTime?: number) => ({ choch: { time }, exitTime })
    const selected = oneSetupAtATime([
      setup(10, 20), setup(15, 16), setup(21), setup(22, 25),
    ] as never)

    expect(selected.map((item) => item.choch.time)).toEqual([10, 21])
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
    expect(setup?.choch.brokenSwing).toMatchObject({ index: 11, price: 77222.5, type: 'low' })
    expect(setup?.choch.invalidationSwing).toMatchObject({ index: 19, price: 77322, type: 'high' })
    expect(setup?.bottom).toBe(77200.2)
    expect(setup?.top).toBe(77217.4)
    expect(setup?.midpoint).toBeCloseTo(77208.8)
    expect(setup?.stopPrice).toBeCloseTo(77326.38)
    expect(setup?.targetPrice).toBeCloseTo(76738.48)
    expect(setup?.status).toBe('open')
  })

  it('uses the dominant earlier FVG for the 03:34 bearish CHoCH and fills at 03:39', () => {
    const leadIn: Array<[number, number, number, number]> = [
      [77300, 77320, 77280, 77310],
      [77310, 77400, 77300, 77380],
      [77380, 77390, 77320, 77330],
      [77330, 77380, 77300, 77350],
      [77350, 77500, 77340, 77480],
      [77480, 77490, 77400, 77420],
    ]
    const example: Array<[number, number, number, number]> = [
      [77529, 77571.6, 77528.9, 77535.2],
      [77535.2, 77542.6, 77505.8, 77505.8],
      [77505.8, 77512.9, 77484, 77501.9],
      [77501.9, 77513, 77489.1, 77504.4],
      [77504.4, 77511.3, 77497.7, 77509.6],
      [77509.6, 77688, 77499.9, 77671.6],
      [77671.6, 77777.9, 77671.4, 77708.4],
      [77708.4, 77708.9, 77651.7, 77665.9],
      [77665.9, 77672.3, 77626, 77631.6],
      [77631.6, 77650, 77613.9, 77614],
      [77614, 77622.5, 77555.8, 77555.8],
      [77555.8, 77563.5, 77519.2, 77519.2],
      [77519.2, 77558, 77511.7, 77533.9],
      [77533.9, 77534.1, 77488.6, 77509.5],
      [77509.5, 77509.5, 77490.1, 77500],
      [77500, 77509.5, 77466.4, 77496.3],
      [77496.3, 77496.3, 77472.8, 77488],
      [77488, 77507.9, 77480.2, 77503.8],
      [77503.8, 77503.9, 77463.1, 77499.1],
      [77499.1, 77623.1, 77499.1, 77623.1],
      [77623.1, 77632.1, 77576.9, 77577],
    ]
    const data = [...leadIn, ...example].map(([open, high, low, close], index) => candle(index, open, high, low, close))
    const analysis = analyzeStructure(data, { pivotLength: 1, stopBufferPercent: 5, rewardRisk: 4, maxSetupCandles: 180 })
    const chochIndex = leadIn.length + 14
    const setup = analysis.fairValueGaps.find((gap) => gap.choch.index === chochIndex)

    expect(setup?.direction).toBe('short')
    expect(setup?.choch.brokenSwing.price).toBe(77509.5)
    expect(setup?.choch.invalidationSwing.price).toBe(77777.9)
    expect(setup?.startTime).toBe(data[leadIn.length + 9].time)
    expect(setup?.bottom).toBe(77563.5)
    expect(setup?.top).toBe(77613.9)
    expect(setup?.midpoint).toBeCloseTo(77588.7)
    expect(setup?.stopPrice).toBeCloseTo(77783.225)
    expect(setup?.entryTime).toBe(data[leadIn.length + 19].time)
    expect(setup?.status).toBe('filled')
  })

  it('uses the completed 06:35 FVG for the 06:39 bullish CHoCH', () => {
    const leadIn: Array<[number, number, number, number]> = [
      [77800, 77820, 77780, 77800],
      [77800, 77900, 77790, 77850],
      [77850, 77860, 77650, 77700],
      [77700, 77800, 77680, 77750],
      [77750, 77760, 77550, 77600],
    ]
    const example: Array<[number, number, number, number]> = [
      [77560, 77600, 77560, 77600],
      [77600, 77604, 77597.4, 77598.3],
      [77598.3, 77630, 77556.9, 77565.4],
      [77565.4, 77591.3, 77565.4, 77573],
      [77573, 77573, 77504.3, 77510.4],
      [77510.4, 77511.2, 77461.9, 77488.2],
      [77488.2, 77495.8, 77458.9, 77461.5],
      [77461.5, 77477.9, 77449.8, 77458.1],
      [77458.1, 77471.4, 77441.5, 77441.5],
      [77441.5, 77490.6, 77408.3, 77488.8],
      [77488.8, 77500, 77466.8, 77500],
      [77500, 77525.6, 77500, 77509.2],
      [77509.2, 77509.2, 77476.3, 77494],
      [77494, 77494, 77486.8, 77492.8],
      [77492.8, 77512.3, 77479.3, 77510.2],
      [77510.2, 77631.4, 77510.2, 77630.4],
    ]
    const data = [...leadIn, ...example].map(([open, high, low, close], index) => candle(index, open, high, low, close))
    const chochIndex = leadIn.length + 14
    const analysis = analyzeStructure(data, { pivotLength: 2, stopBufferPercent: 5, rewardRisk: 4, maxSetupCandles: 180 })
    const setup = analysis.fairValueGaps.find((gap) => gap.choch.index === chochIndex)

    expect(setup?.direction).toBe('long')
    expect(setup?.choch.invalidationSwing).toMatchObject({ index: leadIn.length + 9, price: 77408.3, type: 'low' })
    expect(setup?.startTime).toBe(data[leadIn.length + 9].time)
    expect(setup?.bottom).toBe(77490.6)
    expect(setup?.top).toBe(77500)
    expect(setup?.midpoint).toBeCloseTo(77495.3)
    expect(setup?.stopPrice).toBeCloseTo(77404.185)
    expect(setup?.targetPrice).toBeCloseTo(77859.76)
    expect(setup?.status).toBe('open')
  })
})
