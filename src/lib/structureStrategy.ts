import type { Candle, TradeSide } from '../types.js'

export interface SwingPoint {
  time: number
  price: number
  index: number
  type: 'high' | 'low'
}

export interface ChochEvent {
  kind: 'choch'
  time: number
  price: number
  index: number
  direction: TradeSide
  brokenSwing: SwingPoint
  invalidationSwing: SwingPoint
}

export interface BosEvent {
  kind: 'bos'
  time: number
  price: number
  index: number
  direction: TradeSide
  brokenSwing: SwingPoint
  invalidationSwing: SwingPoint
}

export interface TrendLine {
  id: string
  direction: TradeSide
  start: SwingPoint
  end: SwingPoint
  confirmedAt: number
  confirmedIndex: number
}

type StructureEvent = ChochEvent | BosEvent

export interface FairValueGap {
  id: string
  direction: TradeSide
  startTime: number
  endTime: number
  top: number
  bottom: number
  midpoint: number
  setupType: 'choch' | 'trend-continuation'
  /** Structural event that published the setup. Kept as `choch` for stored-signal compatibility. */
  choch: StructureEvent
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
  bosEvents: BosEvent[]
  trendLines: TrendLine[]
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
  // Pattern formation is closed-candle only, but an already published setup
  // reacts to the live candle's wick immediately for entry, stop, and target.
  const firstLiveIndex = candles.findIndex((candle) => candle.confirmed === false)
  const formationCandles = firstLiveIndex === -1 ? candles : candles.slice(0, firstLiveIndex)
  const swings = findSwingPoints(formationCandles, settings.pivotLength)
  const chochEvents: ChochEvent[] = []
  const biasChanges: Array<{ time: number; direction: TradeSide }> = []
  let trend: TradeSide | 'neutral' = 'neutral'
  let lastBreakIndex = -1

  for (let index = settings.pivotLength * 2 + 1; index < formationCandles.length - 1; index += 1) {
    const available = swings.filter((swing) => swing.index <= index - settings.pivotLength)
    const highs = available.filter((swing) => swing.type === 'high')
    const lows = available.filter((swing) => swing.type === 'low')
    const inferred = inferTrend(highs, lows)
    if (trend === 'neutral' && inferred !== 'neutral') {
      trend = inferred
      biasChanges.push({ time: candles[index].time, direction: inferred })
    }
    const candle = formationCandles[index]
    const latestHigh = highs.at(-1)
    const latestLow = lows.at(-1)

    // A CHoCH is confirmed by a candle close through the body edge of the
    // structural swing. Wicks still define pivots and the candle range used
    // for the stop buffer, but do not make the break unnecessarily late.
    const structuralHigh = latestHigh && {
      ...latestHigh,
      price: Math.max(formationCandles[latestHigh.index].open, formationCandles[latestHigh.index].close),
    }
    const structuralLow = latestLow && {
      ...latestLow,
      price: Math.min(formationCandles[latestLow.index].open, formationCandles[latestLow.index].close),
    }
    if (trend === 'short' && structuralHigh && structuralLow
      && candle.close > structuralHigh.price && structuralHigh.index > lastBreakIndex) {
      chochEvents.push({
        kind: 'choch',
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
        kind: 'choch',
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

  const bosEvents: BosEvent[] = []
  const trendLines: TrendLine[] = []
  const brokenBullishHighs = new Set<number>()
  const brokenBearishLows = new Set<number>()

  for (let index = settings.pivotLength * 2 + 1; index < formationCandles.length; index += 1) {
    const available = swings.filter((swing) => swing.index <= index - settings.pivotLength)
    const highs = available.filter((swing) => swing.type === 'high')
    const lows = available.filter((swing) => swing.type === 'low')
    const current = formationCandles[index]

    const higherLow = lows.at(-1)
    const previousLow = lows.at(-2)
    const bullishBreak = higherLow && previousLow
      ? highs.filter((high) => high.index > previousLow.index && high.index < higherLow.index).at(-1)
      : undefined
    if (previousLow && higherLow && bullishBreak
      && higherLow.price > previousLow.price
      && current.high > bullishBreak.price
      && !brokenBullishHighs.has(bullishBreak.index)) {
      bosEvents.push({
        kind: 'bos', time: current.time, price: current.high, index, direction: 'long',
        brokenSwing: bullishBreak, invalidationSwing: higherLow,
      })
      trendLines.push({
        id: `long-${previousLow.time}-${higherLow.time}`,
        direction: 'long', start: previousLow, end: higherLow,
        confirmedAt: current.time, confirmedIndex: index,
      })
      brokenBullishHighs.add(bullishBreak.index)
    }

    const lowerHigh = highs.at(-1)
    const previousHigh = highs.at(-2)
    const bearishBreak = lowerHigh && previousHigh
      ? lows.filter((low) => low.index > previousHigh.index && low.index < lowerHigh.index).at(-1)
      : undefined
    if (previousHigh && lowerHigh && bearishBreak
      && lowerHigh.price < previousHigh.price
      && current.low < bearishBreak.price
      && !brokenBearishLows.has(bearishBreak.index)) {
      bosEvents.push({
        kind: 'bos', time: current.time, price: current.low, index, direction: 'short',
        brokenSwing: bearishBreak, invalidationSwing: lowerHigh,
      })
      trendLines.push({
        id: `short-${previousHigh.time}-${lowerHigh.time}`,
        direction: 'short', start: previousHigh, end: lowerHigh,
        confirmedAt: current.time, confirmedIndex: index,
      })
      brokenBearishLows.add(bearishBreak.index)
    }
  }

  const setupEvents: Array<{ event: StructureEvent; setupType: FairValueGap['setupType'] }> = [
    ...chochEvents.map((event) => ({ event, setupType: 'choch' as const })),
    ...bosEvents.map((event) => ({ event, setupType: 'trend-continuation' as const })),
  ]
  const fairValueGaps = setupEvents.flatMap(({ event: choch, setupType }) => {
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
      const before = formationCandles[middleIndex - 1]
      const displacement = formationCandles[middleIndex]
      const after = formationCandles[middleIndex + 1]
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
    const invalidationCandle = formationCandles[choch.invalidationSwing.index]
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
      id: `${setupType}-${choch.direction}-${choch.time}`,
      direction: choch.direction,
      setupType,
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

  const contextualBiasChanges = [...biasChanges, ...bosEvents.map((event) => ({
    time: event.time,
    direction: event.direction,
  }))].sort((a, b) => a.time - b.time)
    .filter((change, index, all) => index === 0 || change.direction !== all[index - 1].direction)
  const bias = contextualBiasChanges.at(-1)?.direction ?? trend

  return { swings, chochEvents, bosEvents, trendLines, fairValueGaps, biasChanges: contextualBiasChanges, bias }
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
