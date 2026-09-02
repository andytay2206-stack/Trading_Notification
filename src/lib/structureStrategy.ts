import type { Candle, TradeSide } from '../types.js'

export interface SwingPoint {
  time: number
  price: number
  index: number
  type: 'high' | 'low'
}

export interface ChochEvent {
  time: number
  price: number
  index: number
  direction: TradeSide
  brokenSwing: SwingPoint
}

export interface FairValueGap {
  id: string
  direction: TradeSide
  startTime: number
  endTime: number
  top: number
  bottom: number
  midpoint: number
  choch: ChochEvent
  stopPrice: number
  targetPrice: number
  status: 'open' | 'filled' | 'won' | 'lost' | 'expired'
  entryTime?: number
  exitTime?: number
}

export interface StructureAnalysis {
  swings: SwingPoint[]
  chochEvents: ChochEvent[]
  fairValueGaps: FairValueGap[]
  biasChanges: Array<{ time: number; direction: TradeSide }>
  bias: TradeSide | 'neutral'
}

export interface StrategySettings {
  pivotLength: number
  stopBufferPercent: number
  rewardRisk: number
  maxEntryWaitCandles: number
}

export const defaultStructureSettings: StrategySettings = {
  pivotLength: 2,
  stopBufferPercent: 5,
  rewardRisk: 4,
  maxEntryWaitCandles: 120,
}

export function findSwingPoints(candles: Candle[], pivotLength = 2): SwingPoint[] {
  const swings: SwingPoint[] = []
  for (let index = pivotLength; index < candles.length - pivotLength; index += 1) {
    const candle = candles[index]
    const neighbors = candles.slice(index - pivotLength, index + pivotLength + 1)
    const isHigh = neighbors.every((item, neighborIndex) => neighborIndex === pivotLength || candle.high > item.high)
    const isLow = neighbors.every((item, neighborIndex) => neighborIndex === pivotLength || candle.low < item.low)
    if (isHigh) swings.push({ time: candle.time, price: candle.high, index, type: 'high' })
    if (isLow) swings.push({ time: candle.time, price: candle.low, index, type: 'low' })
  }
  return swings.sort((a, b) => a.index - b.index)
}

const inferTrend = (highs: SwingPoint[], lows: SwingPoint[]): TradeSide | 'neutral' => {
  if (highs.length < 2 || lows.length < 2) return 'neutral'
  const higherHigh = highs.at(-1)!.price > highs.at(-2)!.price
  const higherLow = lows.at(-1)!.price > lows.at(-2)!.price
  const lowerHigh = highs.at(-1)!.price < highs.at(-2)!.price
  const lowerLow = lows.at(-1)!.price < lows.at(-2)!.price
  if (higherHigh && higherLow) return 'long'
  if (lowerHigh && lowerLow) return 'short'
  return 'neutral'
}

export function analyzeStructure(candles: Candle[], settings = defaultStructureSettings): StructureAnalysis {
  const swings = findSwingPoints(candles, settings.pivotLength)
  const chochEvents: ChochEvent[] = []
  const biasChanges: Array<{ time: number; direction: TradeSide }> = []
  let trend: TradeSide | 'neutral' = 'neutral'
  let lastBreakIndex = -1

  for (let index = settings.pivotLength * 2 + 1; index < candles.length - 1; index += 1) {
    const available = swings.filter((swing) => swing.index <= index - settings.pivotLength)
    const highs = available.filter((swing) => swing.type === 'high')
    const lows = available.filter((swing) => swing.type === 'low')
    const inferred = inferTrend(highs, lows)
    if (trend === 'neutral' && inferred !== 'neutral') {
      trend = inferred
      biasChanges.push({ time: candles[index].time, direction: inferred })
    }
    const lastHigh = highs.at(-1)
    const lastLow = lows.at(-1)
    const candle = candles[index]
    const previous = candles[index - 1]

    if (trend === 'short' && lastHigh && candle.close > lastHigh.price && previous.close <= lastHigh.price && lastHigh.index > lastBreakIndex) {
      chochEvents.push({ time: candle.time, price: candle.close, index, direction: 'long', brokenSwing: lastHigh })
      trend = 'long'
      biasChanges.push({ time: candle.time, direction: 'long' })
      lastBreakIndex = lastHigh.index
    } else if (trend === 'long' && lastLow && candle.close < lastLow.price && previous.close >= lastLow.price && lastLow.index > lastBreakIndex) {
      chochEvents.push({ time: candle.time, price: candle.close, index, direction: 'short', brokenSwing: lastLow })
      trend = 'short'
      biasChanges.push({ time: candle.time, direction: 'short' })
      lastBreakIndex = lastLow.index
    }
  }

  const fairValueGaps = chochEvents.flatMap((choch) => {
    const before = candles[choch.index - 1]
    const displacement = candles[choch.index]
    const after = candles[choch.index + 1]
    if (!before || !displacement || !after) return []
    const bullishGap = choch.direction === 'long' && after.low > before.high
    const bearishGap = choch.direction === 'short' && after.high < before.low
    if (!bullishGap && !bearishGap) return []

    const top = bullishGap ? after.low : before.low
    const bottom = bullishGap ? before.high : after.high
    const midpoint = (top + bottom) / 2
    const candleRange = Math.max(displacement.high - displacement.low, displacement.close * 0.0001)
    const buffer = candleRange * (settings.stopBufferPercent / 100)
    const stopPrice = choch.direction === 'long' ? displacement.low - buffer : displacement.high + buffer
    const risk = Math.abs(midpoint - stopPrice)
    const targetPrice = choch.direction === 'long'
      ? midpoint + risk * settings.rewardRisk
      : midpoint - risk * settings.rewardRisk
    const gap: FairValueGap = {
      id: `${choch.direction}-${choch.time}`,
      direction: choch.direction,
      startTime: before.time,
      endTime: candles.at(-1)!.time,
      top,
      bottom,
      midpoint,
      choch,
      stopPrice,
      targetPrice,
      status: 'open',
    }

    const evaluationEnd = Math.min(candles.length, choch.index + 2 + settings.maxEntryWaitCandles)
    for (let index = choch.index + 2; index < evaluationEnd; index += 1) {
      const candle = candles[index]
      if (!gap.entryTime) {
        if (candle.low <= midpoint && candle.high >= midpoint) {
          gap.entryTime = candle.time
          gap.status = 'filled'
        }
        continue
      }
      const stopped = choch.direction === 'long' ? candle.low <= stopPrice : candle.high >= stopPrice
      const targeted = choch.direction === 'long' ? candle.high >= targetPrice : candle.low <= targetPrice
      if (stopped) {
        gap.status = 'lost'
        gap.exitTime = candle.time
        break
      }
      if (targeted) {
        gap.status = 'won'
        gap.exitTime = candle.time
        break
      }
    }
    if (!gap.entryTime && evaluationEnd < candles.length) gap.status = 'expired'
    return [gap]
  })

  return { swings, chochEvents, fairValueGaps, biasChanges, bias: trend }
}

export function alignedOneMinuteSetups(oneMinute: StructureAnalysis, fifteenMinute: StructureAnalysis) {
  return oneMinute.fairValueGaps.filter((gap) => {
    const knownBias = fifteenMinute.biasChanges
      .filter((change) => change.time <= gap.choch.time)
      .at(-1)?.direction
    return knownBias === gap.direction
  })
}
