import { describe, expect, it } from 'vitest'
import type { Candle } from '../types'
import { alignedOneMinuteSetups, analyzeStructure, findFairValueGaps, findSwingPoints, oneSetupAtATime } from './structureStrategy'

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
    const longGap = { direction: 'long' as const, detectedTime: 10, choch: { time: 10 } }
    const shortGap = { direction: 'short' as const, detectedTime: 10, choch: { time: 10 } }
    const oneMinute = { swings: [], chochEvents: [], fairValueGaps: [longGap, shortGap], biasChanges: [], bias: 'long' as const }
    const fifteenMinute = { swings: [], chochEvents: [], bosEvents: [], trendLines: [], fvgZones: [], fairValueGaps: [], biasChanges: [{ time: 0, direction: 'short' as const }], bias: 'short' as const }
    expect(alignedOneMinuteSetups(oneMinute as never, fifteenMinute)).toEqual([shortGap])
  })

  it('handles insufficient candles without producing false signals', () => {
    const analysis = analyzeStructure([candle(0, 10, 11, 9, 10)])
    expect(analysis.chochEvents).toHaveLength(0)
    expect(analysis.fairValueGaps).toHaveLength(0)
    expect(analysis.bias).toBe('neutral')
  })

  it('confirms BOS, connects the two lows, and creates a trend-continuation FVG setup', () => {
    const data = [
      candle(0, 10, 10.5, 9.8, 10),
      candle(1, 10, 10.2, 9, 9.6),
      candle(2, 10.6, 12, 10.5, 11.7),
      candle(3, 11, 11, 10, 10.7),
      candle(4, 10.7, 12.5, 10.8, 12.2),
      candle(5, 12.2, 12.4, 11.2, 11.5),
      candle(6, 11.5, 11.6, 11, 11.2),
    ]
    const analysis = analyzeStructure(data, { pivotLength: 1, stopBufferPercent: 5, rewardRisk: 4 })
    const bos = analysis.bosEvents.find((event) => event.direction === 'long')
    const setup = analysis.fairValueGaps.find((gap) => gap.setupType === 'trend-continuation' && gap.direction === 'long')

    expect(bos).toMatchObject({ index: 4, brokenSwing: { index: 2 }, invalidationSwing: { index: 3 } })
    expect(analysis.trendLines).toContainEqual(expect.objectContaining({
      direction: 'long', start: expect.objectContaining({ index: 1 }), end: expect.objectContaining({ index: 3 }),
    }))
    expect(setup).toMatchObject({ bottom: 11, top: 11.2, midpoint: 11.1, setupType: 'trend-continuation' })
    expect(setup?.entryTime).toBe(data[6].time)
  })

  it('anchors a bullish trend line at the bottom-most low instead of the nearest low', () => {
    const data = [
      candle(0, 10, 10.5, 9.8, 10),
      candle(1, 10, 10.2, 9, 9.7),
      candle(2, 10.5, 12, 10, 11.5),
      candle(3, 10, 10.5, 9.5, 10),
      candle(4, 10.5, 11.5, 10.2, 11),
      candle(5, 10.5, 10.8, 10, 10.4),
      candle(6, 10.5, 12.2, 10.5, 12),
      candle(7, 12, 12.1, 11, 11.5),
    ]
    const analysis = analyzeStructure(data, { pivotLength: 1, stopBufferPercent: 5, rewardRisk: 4 })
    const line = analysis.trendLines.find((item) => item.direction === 'long' && item.confirmedIndex === 6)

    expect(line?.start).toMatchObject({ index: 1, price: 9 })
    expect(line?.end).toMatchObject({ index: 5, price: 10 })
  })

  it('confirms bearish CHoCH only from low-high-lower-low through the bullish trend line', () => {
    const data = [
      candle(0, 10, 10.5, 9.8, 10), candle(1, 10, 10.2, 9, 9.6),
      candle(2, 10.6, 12, 10.5, 11.7), candle(3, 11, 11, 10, 10.7),
      candle(4, 10.7, 12.5, 10.8, 12.2), candle(5, 10.8, 11.5, 9.8, 9.9),
    ]
    const analysis = analyzeStructure(data, { pivotLength: 1, stopBufferPercent: 8, rewardRisk: 4 })

    expect(analysis.chochEvents).toContainEqual(expect.objectContaining({
      index: 5, direction: 'short', brokenSwing: expect.objectContaining({ index: 3, type: 'low' }),
      invalidationSwing: expect.objectContaining({ index: 4, type: 'high' }),
    }))
  })

  it('confirms bullish CHoCH only from high-low-higher-high through the bearish trend line', () => {
    const data = [
      candle(0, 10, 10.2, 9.5, 10), candle(1, 10, 11, 9.8, 10.6),
      candle(2, 9, 9.5, 8, 8.4), candle(3, 9.5, 10, 8.5, 9.6),
      candle(4, 8.5, 9.2, 7.5, 7.8), candle(5, 8, 10.2, 7.8, 10.1),
    ]
    const analysis = analyzeStructure(data, { pivotLength: 1, stopBufferPercent: 8, rewardRisk: 4 })

    expect(analysis.chochEvents).toContainEqual(expect.objectContaining({
      index: 5, direction: 'long', brokenSwing: expect.objectContaining({ index: 3, type: 'high' }),
      invalidationSwing: expect.objectContaining({ index: 4, type: 'low' }),
    }))
  })

  it('detects the finalized 03:33/03:34/03:35 bearish wick gap', () => {
    const data = [
      candle(0, 77711.2, 77718.7, 77692.6, 77696.6),
      candle(1, 77696.6, 77696.6, 77671.9, 77672),
      candle(2, 77672, 77677, 77640, 77650),
    ]
    const gap = findFairValueGaps(data)[0]

    expect(gap).toMatchObject({ direction: 'short', middleIndex: 1, top: 77692.6, bottom: 77677 })
    expect(gap.midpoint).toBeCloseTo(77684.8)
  })

  it('detects the finalized 07:03/07:04/07:05 bullish wick gap', () => {
    const data = [
      candle(0, 77829.5, 77869.4, 77824, 77836.9),
      candle(1, 77836.9, 78124.8, 77836.9, 78104.9),
      candle(2, 78104.9, 78149, 78067, 78148.4),
    ]
    const gap = findFairValueGaps(data)[0]

    expect(gap).toMatchObject({ direction: 'long', middleIndex: 1, bottom: 77869.4, top: 78067 })
    expect(gap.midpoint).toBeCloseTo(77968.2)
  })

  it('prefers the displacement FVG finalized after a Strategy 1 BOS', () => {
    const data = [
      candle(0, 10, 10.5, 9.8, 10),
      candle(1, 10, 10.2, 9, 9.6),
      candle(2, 10.6, 12, 10.5, 11.7),
      candle(3, 11, 11, 10, 10.7),
      candle(4, 10.7, 12.5, 10.8, 12.2),
      candle(5, 12.2, 15, 12.2, 14.8),
      candle(6, 14.8, 15.5, 14, 15),
      candle(7, 15, 15.2, 13, 14),
    ]
    const setup = analyzeStructure(data, { pivotLength: 1, stopBufferPercent: 8, rewardRisk: 4 })
      .fairValueGaps.find((gap) => gap.setupType === 'trend-continuation' && gap.choch.index === 4)

    expect(setup).toMatchObject({ middleIndex: 5, bottom: 12.5, top: 14, midpoint: 13.25 })
    expect(setup?.detectedIndex).toBe(6)
    expect(setup?.entryTime).toBe(data[7].time)
  })

  it('matches the reviewed 05:00-06:13 market-structure sequence', () => {
    const replay: Array<[number, number, number, number]> = [
      [77749.7, 77792, 77743.2, 77792], [77792, 77792, 77753.6, 77753.6],
      [77753.6, 77766.9, 77728, 77759.9], [77759.9, 77764.1, 77739.2, 77740.8],
      [77740.8, 77742.9, 77714, 77714], [77714, 77722.4, 77708, 77710.1],
      [77710.1, 77710.1, 77684, 77700.6], [77700.6, 77707.8, 77686, 77698.6],
      [77698.6, 77723.3, 77696.4, 77723.3], [77723.3, 77729.1, 77644.2, 77673.6],
      [77673.6, 77709.7, 77673.6, 77700.1], [77700.1, 77700.1, 77649, 77649.7],
      [77649.7, 77653.3, 77628.1, 77628.1], [77628.1, 77628.2, 77599.3, 77599.3],
      [77599.3, 77605.7, 77569, 77603.4], [77603.4, 77615.7, 77574, 77599.5],
      [77599.5, 77610.9, 77592.8, 77592.8], [77592.8, 77592.8, 77457, 77484.1],
      [77484.1, 77521, 77455.9, 77499.1], [77499.1, 77499.1, 77449.1, 77463.1],
      [77463.1, 77467.6, 77342, 77344.4], [77344.4, 77374.1, 77286.8, 77297.9],
      [77297.9, 77330.1, 77227.4, 77274.6], [77274.6, 77274.6, 77170, 77225.1],
      [77225.1, 77278.6, 77204.8, 77247.9], [77247.9, 77251.9, 77194.3, 77207.8],
      [77207.8, 77216.4, 77168, 77168], [77168, 77188.3, 77088, 77095],
      [77095, 77174.3, 77062.1, 77125.4], [77125.4, 77185.4, 77125.4, 77161.3],
      [77161.3, 77232, 77128.7, 77208.9], [77208.9, 77258.7, 77202, 77235.6],
      [77235.6, 77292.1, 77235.6, 77291.8], [77291.8, 77306.8, 77258.7, 77270.1],
      [77270.1, 77319.4, 77270, 77309], [77309, 77349, 77309, 77334.1],
      [77334.1, 77363.9, 77333.9, 77363.8], [77363.8, 77399.9, 77350.4, 77394.4],
      [77394.4, 77410, 77370, 77410], [77410, 77439.9, 77400, 77400],
      [77400, 77400.1, 77366.3, 77390.7], [77390.7, 77435, 77387.7, 77429.6],
      [77429.6, 77429.6, 77399.4, 77418.2], [77418.2, 77441.6, 77406.8, 77441.6],
      [77441.6, 77478.8, 77441.5, 77459.3], [77459.3, 77459.3, 77401.3, 77405.1],
      [77405.1, 77405.2, 77369.6, 77384], [77384, 77430, 77374.7, 77429],
      [77429, 77494, 77429, 77482.9], [77482.9, 77487.4, 77460.9, 77470],
      [77470, 77508.8, 77469.8, 77508.7], [77508.7, 77670, 77508.7, 77627.5],
      [77627.5, 77692.1, 77612.6, 77665.3], [77665.3, 77665.3, 77600.2, 77614.7],
      [77614.7, 77678.1, 77600.1, 77652.2], [77652.2, 77700, 77652.1, 77690],
      [77690, 77790.9, 77675, 77790.9], [77790.9, 77805, 77753.6, 77777.8],
      [77777.8, 77789.6, 77750, 77779.3], [77779.3, 77800, 77758, 77780.8],
      [77780.8, 77820, 77720, 77731.4], [77731.4, 77750.7, 77709.5, 77713.7],
      [77713.7, 77745.1, 77689.7, 77700.2], [77700.2, 77708.6, 77690.1, 77704.6],
      [77704.6, 77713, 77690.1, 77695.7], [77695.7, 77712.8, 77695.6, 77712.8],
      [77712.8, 77755.8, 77699.5, 77700], [77700, 77719.7, 77674, 77683.1],
      [77683.1, 77694.3, 77676.7, 77676.7], [77676.7, 77719.1, 77670, 77689.1],
      [77689.1, 77722, 77683.6, 77722], [77722, 77723.1, 77663.7, 77663.8],
      [77663.8, 77695.8, 77660, 77695.8], [77695.8, 77707.2, 77677.4, 77677.4],
    ]
    const data = replay.map(([open, high, low, close], index) => candle(index, open, high, low, close))
    const analysis = analyzeStructure(data, { pivotLength: 1, stopBufferPercent: 8, rewardRisk: 4 })
    const bosIndices = analysis.bosEvents.map((event) => event.index)
    const chochIndices = analysis.chochEvents.map((event) => event.index)
    expect(chochIndices).toEqual(expect.arrayContaining([32, 71]))
    expect(chochIndices).not.toContain(41)
    expect(chochIndices).not.toContain(45)
    expect(chochIndices).not.toContain(48)
    expect(bosIndices).toEqual(expect.arrayContaining([44, 48, 55]))
    expect(bosIndices).not.toContain(56)
    expect(bosIndices).not.toContain(72)
    expect(analysis.trendLines.find((line) => line.confirmedIndex === 48 && line.direction === 'long'))
      .toMatchObject({ start: { index: 28 }, end: { index: 47 } })

    const syntheticContinuation = [
      ...data,
      candle(74, 77677.4, 77690, 77670, 77672),
      candle(75, 77672, 77685, 77640, 77650),
    ]
    const continued = analyzeStructure(syntheticContinuation, { pivotLength: 1, stopBufferPercent: 8, rewardRisk: 4 })
    expect(continued.trendLines.find((line) => line.confirmedIndex === 75 && line.direction === 'short'))
      .toMatchObject({ start: { index: 60, price: 77820 }, end: { index: 74, price: 77690 } })
  })

  it('matches the reviewed 07:15-07:41 BOS and CHoCH sequence', () => {
    const replay: Array<[number, number, number, number]> = [
      [77836.9, 78124.8, 77836.9, 78104.9], // 07:04
      [78104.9, 78149, 78067, 78148.4], [78148.4, 78148.4, 78035, 78062.3],
      [78062.3, 78065.5, 77973, 78032.6], [78032.6, 78047.9, 77980, 77983.9],
      [77983.9, 78016, 77980, 77980], [77980, 77998.2, 77945.9, 77980.1],
      [77980.1, 78062, 77972, 78056.8], [78056.8, 78093.2, 78042.9, 78064],
      [78064, 78074.1, 78041, 78049.8], [78049.8, 78055, 78041, 78041],
      [78041, 78041.1, 77936.5, 77940], // 07:15 BOS
      [77940, 77959.5, 77913.4, 77913.5], [77913.5, 77947.7, 77913.4, 77913.4],
      [77913.4, 77925, 77908.5, 77911.6], [77911.6, 77950, 77901.1, 77931],
      [77931, 77931, 77891, 77894.7], // 07:20 continuation, not CHoCH
      [77894.7, 77928.5, 77885, 77928.4], [77928.4, 77997.8, 77928.4, 77979.4],
      [77979.4, 77992.4, 77942.9, 77985.4], [77985.4, 77985.9, 77923.2, 77929.7],
      [77929.7, 77938.2, 77873, 77873], // 07:25 BOS
      [77873, 77883.9, 77855, 77883.9], [77883.9, 77915.9, 77876.3, 77913.7],
      [77913.7, 77955.4, 77903.3, 77955.4], [77955.4, 77955.4, 77910.8, 77910.8],
      [77910.8, 77915, 77833.3, 77833.4], [77833.4, 77841.3, 77827, 77838.5],
      [77838.5, 77873.6, 77815.5, 77873.6], [77873.6, 77900, 77861.9, 77895.6],
      [77895.6, 77900, 77860, 77889.8], [77889.8, 77900, 77872.4, 77880.1],
      [77880.1, 77900, 77862.3, 77862.3], [77862.3, 77900, 77862.3, 77900],
      [77900, 77900, 77870.4, 77900], [77900, 77950, 77900, 77950],
      [77950, 77964.2, 77935.9, 77964.1],
      [77964.1, 78038.3, 77964.1, 78038.2], // 07:41 CHoCH
      [78038.2, 78044.8, 78007.3, 78022.9],
    ]
    const data = replay.map(([open, high, low, close], index) => candle(index, open, high, low, close))
    const analysis = analyzeStructure(data, { pivotLength: 1, stopBufferPercent: 8, rewardRisk: 4 })
    const bosIndices = analysis.bosEvents.map((event) => event.index)
    const chochIndices = analysis.chochEvents.map((event) => event.index)

    expect(bosIndices).toEqual(expect.arrayContaining([11, 21]))
    expect(chochIndices).not.toContain(16)
    expect(chochIndices).toContain(37)
    expect(analysis.trendLines.find((line) => line.confirmedIndex === 11 && line.direction === 'short'))
      .toMatchObject({ start: { index: 1, price: 78149 }, end: { index: 9, price: 78074.1 } })
  })

  it('keeps tracking a filled trade until the 4R target', () => {
    const analysis = analyzeStructure(bullishSequence, { pivotLength: 1, stopBufferPercent: 5, rewardRisk: 4 })
    const bullish = analysis.fairValueGaps.find((gap) => gap.direction === 'long')

    expect(bullish).toBeDefined()
    expect(bullish?.midpoint).toBe(9.35)
    expect(bullish?.stopPrice).toBeCloseTo(7.52)
    expect(bullish?.targetPrice).toBeCloseTo(16.67)
    expect(bullish?.status).toBe('won')
  })

  it('does not cancel a filled trade when neither stop nor target has been reached', () => {
    const data = [...bullishSequence]
    data[12] = candle(12, 10, 10.5, 9.8, 10)
    data[13] = candle(13, 10, 10.2, 9.8, 10)
    for (let index = 14; index < 220; index += 1) data.push(candle(index, 10, 10.2, 9.8, 10))
    const analysis = analyzeStructure(data, { pivotLength: 1, stopBufferPercent: 5, rewardRisk: 4 })
    const setup = analysis.fairValueGaps.find((gap) => gap.direction === 'long')

    expect(setup?.status).toBe('filled')
    expect(setup?.exitTime).toBeUndefined()
    expect(setup?.exitPrice).toBeUndefined()
    expect(setup?.rResult).toBeUndefined()
  })

  it('marks a pullback prediction missed when target is reached before entry', () => {
    const data = [...bullishSequence]
    data[11] = candle(11, 12.8, 17, 10, 16)
    const analysis = analyzeStructure(data, { pivotLength: 1, stopBufferPercent: 5, rewardRisk: 4 })
    const setup = analysis.fairValueGaps.find((gap) => gap.direction === 'long')

    expect(setup?.status).toBe('missed')
    expect(setup?.entryTime).toBeUndefined()
    expect(setup?.exitTime).toBe(data[11].time)
    expect(setup?.rResult).toBe(0)
  })

  it('uses only a later candle return as the entry after CHoCH confirms the prediction', () => {
    const analysis = analyzeStructure(bullishSequence, {
      pivotLength: 1, stopBufferPercent: 5, rewardRisk: 4, maxEntryWaitCandles: 60,
    })
    const setup = analysis.fairValueGaps.find((gap) => gap.direction === 'long')

    expect(setup?.choch.index).toBe(9)
    expect(setup?.midpoint).toBe(9.35)
    expect(setup?.entryTime).toBe(bullishSequence[11].time)
    expect(setup?.entryTime).toBeGreaterThan(setup?.choch.time ?? 0)
  })

  it('cancels an unfilled prediction at 0R after its full waiting window', () => {
    const data = [...bullishSequence]
    for (let index = 11; index <= 13; index += 1) data[index] = candle(index, 10, 10.2, 9.6, 10)
    const analysis = analyzeStructure(data, {
      pivotLength: 1, stopBufferPercent: 5, rewardRisk: 4, maxEntryWaitCandles: 3,
    })
    const setup = analysis.fairValueGaps.find((gap) => gap.direction === 'long')

    expect(setup?.status).toBe('cancelled')
    expect(setup?.entryTime).toBeUndefined()
    expect(setup?.exitTime).toBe(data[13].time)
    expect(setup?.exitPrice).toBeUndefined()
    expect(setup?.rResult).toBe(0)
  })

  it('still fills when price returns on the final candle of the waiting window', () => {
    const data = [...bullishSequence]
    data[11] = candle(11, 10, 10.2, 9.6, 10)
    data[12] = candle(12, 10, 10.2, 9.6, 10)
    data[13] = candle(13, 10, 10.1, 9.3, 9.8)
    const analysis = analyzeStructure(data, {
      pivotLength: 1, stopBufferPercent: 5, rewardRisk: 4, maxEntryWaitCandles: 3,
    })
    const setup = analysis.fairValueGaps.find((gap) => gap.direction === 'long')

    expect(setup?.status).toBe('filled')
    expect(setup?.entryTime).toBe(data[13].time)
    expect(setup?.exitTime).toBeUndefined()
  })

  it('uses a still-forming candle wick to fill and finish published setups', () => {
    const fillCandle = { ...bullishSequence[11], confirmed: false }
    const filled = analyzeStructure([...bullishSequence.slice(0, 11), fillCandle], {
      pivotLength: 1, stopBufferPercent: 5, rewardRisk: 4,
    }).fairValueGaps.find((gap) => gap.direction === 'long')

    expect(filled?.status).toBe('filled')
    expect(filled?.entryTime).toBe(fillCandle.time)

    const targetCandle = { ...bullishSequence[12], confirmed: false }
    const won = analyzeStructure([...bullishSequence.slice(0, 12), targetCandle], {
      pivotLength: 1, stopBufferPercent: 5, rewardRisk: 4,
    }).fairValueGaps.find((gap) => gap.direction === 'long')

    expect(won?.status).toBe('won')
    expect(won?.exitTime).toBe(targetCandle.time)
  })

  it('ignores later setups until the selected setup has finished', () => {
    const setup = (time: number, exitTime?: number) => ({ detectedTime: time, choch: { time }, exitTime })
    const selected = oneSetupAtATime([
      setup(10, 20), setup(15, 16), setup(21), setup(22, 25),
    ] as never)

    expect(selected.map((item) => item.choch.time)).toEqual([10, 21])
  })

  it('retains the 01:27-centered bearish wick gap under the refined structure rules', () => {
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
    const gap = analysis.fvgZones.find((item) => item.middleIndex === 21)

    expect(gap).toMatchObject({ direction: 'short', bottom: 77200.2, top: 77217.4 })
    expect(gap?.midpoint).toBeCloseTo(77208.8)
  })

  it('retains the dominant 03:30 bearish FVG under the refined structure rules', () => {
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
    const analysis = analyzeStructure(data, { pivotLength: 1, stopBufferPercent: 5, rewardRisk: 4 })
    const gap = analysis.fvgZones.find((item) => item.middleIndex === leadIn.length + 10)

    expect(gap).toMatchObject({ direction: 'short', bottom: 77563.5, top: 77613.9 })
    expect(gap?.midpoint).toBeCloseTo(77588.7)
  })

  it('retains the completed 06:35 bullish FVG under the refined structure rules', () => {
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
    const analysis = analyzeStructure(data, { pivotLength: 2, stopBufferPercent: 5, rewardRisk: 4 })
    const gap = analysis.fvgZones.find((item) => item.middleIndex === leadIn.length + 10)

    expect(gap).toMatchObject({ direction: 'long', bottom: 77490.6, top: 77500 })
    expect(gap?.midpoint).toBeCloseTo(77495.3)
  })
})
