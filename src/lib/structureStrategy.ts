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
  invalidationSwing: SwingPoint
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
  status: 'open' | 'filled' | 'won' | 'lost' | 'missed' | 'cancelled'
  entryTime?: number
  exitTime?: number
  exitPrice?: number
  rResult?: number
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
  maxEntryWaitCandles?: number
}

export const defaultStructureSettings: StrategySettings = {
  pivotLength: 2,
  stopBufferPercent: 5,
  rewardRisk: 4,
  maxEntryWaitCandles: 60,
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
    const candle = candles[index]
    const latestHigh = highs.at(-1)
    const latestLow = lows.at(-1)

    // A CHoCH is confirmed by a candle close through the body edge of the
    // structural swing. Wicks still define pivots and the candle range used
    // for the stop buffer, but do not make the break unnecessarily late.
    const structuralHigh = latestHigh && {
      ...latestHigh,
      price: Math.max(candles[latestHigh.index].open, candles[latestHigh.index].close),
    }
    const structuralLow = latestLow && {
      ...latestLow,
      price: Math.min(candles[latestLow.index].open, candles[latestLow.index].close),
    }

    if (trend === 'short' && structuralHigh && structuralLow
      && candle.close > structuralHigh.price && structuralHigh.index > lastBreakIndex) {
      chochEvents.push({
        time: candle.time,
        price: candle.close,
        index,
        direction: 'long',
        brokenSwing: structuralHigh,
        invalidationSwing: latestLow,
      })
      trend = 'long'
      biasChanges.push({ time: candle.time, direction: 'long' })
      lastBreakIndex = structuralHigh.index
    } else if (trend === 'long' && structuralHigh && structuralLow
      && candle.close < structuralLow.price && structuralLow.index > lastBreakIndex) {
      chochEvents.push({
        time: candle.time,
        price: candle.close,
        index,
        direction: 'short',
        brokenSwing: structuralLow,
        invalidationSwing: latestHigh,
      })
      trend = 'short'
      biasChanges.push({ time: candle.time, direction: 'short' })
      lastBreakIndex = structuralLow.index
    }
  }

  const fairValueGaps = chochEvents.flatMap((choch) => {
    // Search the entire structural leg from its invalidation swing to CHoCH.
    // When several three-candle imbalances exist, use the widest gap: it is
    // the dominant displacement zone and avoids selecting tiny later gaps.
    const candidates = [] as Array<{
      before: Candle
      after: Candle
      middleIndex: number
      bullishGap: boolean
      size: number
    }>
    for (let middleIndex = choch.invalidationSwing.index + 1; middleIndex <= choch.index; middleIndex += 1) {
      const before = candles[middleIndex - 1]
      const displacement = candles[middleIndex]
      const after = candles[middleIndex + 1]
      if (!before || !displacement || !after) continue
      const bullishGap = choch.direction === 'long' && after.low > before.high
      const bearishGap = choch.direction === 'short' && after.high < before.low
      if (!bullishGap && !bearishGap) continue
      candidates.push({
        before,
        after,
        middleIndex,
        bullishGap,
        size: bullishGap ? after.low - before.high : before.low - after.high,
      })
    }
    const establishedBeforeChoch = candidates.filter((candidate) => candidate.middleIndex < choch.index - 1)
    const relevantCandidates = establishedBeforeChoch.length > 0 ? establishedBeforeChoch : candidates
    const selected = relevantCandidates.sort((a, b) => b.size - a.size || b.middleIndex - a.middleIndex)[0]
    if (!selected) return []
    const { before, after, middleIndex, bullishGap } = selected

    const top = bullishGap ? after.low : before.low
    const bottom = bullishGap ? before.high : after.high
    const midpoint = (top + bottom) / 2
    const invalidationCandle = candles[choch.invalidationSwing.index]
    const invalidationRange = Math.max(
      invalidationCandle.high - invalidationCandle.low,
      invalidationCandle.close * 0.0001,
    )
    const buffer = invalidationRange * (settings.stopBufferPercent / 100)
    const stopPrice = choch.direction === 'long'
      ? choch.invalidationSwing.price - buffer
      : choch.invalidationSwing.price + buffer
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

    // The midpoint is a prediction made only after CHoCH and the complete FVG
    // are known. Historical candles that formed either condition can never
    // retroactively fill the entry.
    const evaluationStart = Math.max(choch.index + 1, middleIndex + 2)
    const entryExpiryIndex = evaluationStart + (settings.maxEntryWaitCandles ?? 60) - 1
    for (let index = evaluationStart; index < candles.length; index += 1) {
      const candle = candles[index]
      if (!gap.entryTime) {
        const touchedEntry = candle.low <= midpoint && candle.high >= midpoint
        const passedTarget = choch.direction === 'long'
          ? candle.high >= targetPrice
          : candle.low <= targetPrice
        if (!touchedEntry && passedTarget) {
          gap.status = 'missed'
          gap.exitTime = candle.time
          gap.exitPrice = targetPrice
          gap.rResult = 0
          break
        }
        if (touchedEntry) {
          gap.entryTime = candle.time
          gap.status = 'filled'
        }
        if (!gap.entryTime && index >= entryExpiryIndex) {
          gap.status = 'cancelled'
          gap.exitTime = candle.time
          gap.rResult = 0
          break
        }
        if (!gap.entryTime) continue
      }
      const stopped = choch.direction === 'long' ? candle.low <= stopPrice : candle.high >= stopPrice
      const targeted = choch.direction === 'long' ? candle.high >= targetPrice : candle.low <= targetPrice
      if (stopped) {
        gap.status = 'lost'
        gap.exitTime = candle.time
        gap.exitPrice = stopPrice
        gap.rResult = -1
        break
      }
      if (targeted) {
        gap.status = 'won'
        gap.exitTime = candle.time
        gap.exitPrice = targetPrice
        gap.rResult = settings.rewardRisk
        break
      }
    }
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

export function oneSetupAtATime(setups: FairValueGap[]) {
  const selected: FairValueGap[] = []
  let unavailableUntil = Number.NEGATIVE_INFINITY

  for (const setup of [...setups].sort((a, b) => a.choch.time - b.choch.time)) {
    if (setup.choch.time <= unavailableUntil) continue
    selected.push(setup)
    unavailableUntil = setup.exitTime ?? Number.POSITIVE_INFINITY
  }

  return selected
}
