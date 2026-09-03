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

export interface FvgZone {
  id: string
  direction: TradeSide
  startTime: number
  endTime: number
  middleTime: number
  middleIndex: number
  top: number
  bottom: number
  midpoint: number
}

export interface FairValueGap extends FvgZone {
  detectedTime: number
  detectedIndex: number
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
  fvgZones: FvgZone[]
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
  pivotLength: 1,
  stopBufferPercent: 8,
  rewardRisk: 4,
  maxEntryWaitCandles: 60,
}

export function findSwingPoints(candles: Candle[], pivotLength = 1): SwingPoint[] {
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

export function findFairValueGaps(candles: Candle[]): FvgZone[] {
  const gaps: FvgZone[] = []
  for (let middleIndex = 1; middleIndex < candles.length - 1; middleIndex += 1) {
    const before = candles[middleIndex - 1]
    const middle = candles[middleIndex]
    const after = candles[middleIndex + 1]
    if (after.low > before.high) {
      gaps.push({
        id: `fvg-long-${middle.time}`,
        direction: 'long',
        startTime: before.time,
        endTime: after.time,
        middleTime: middle.time,
        middleIndex,
        top: after.low,
        bottom: before.high,
        midpoint: (after.low + before.high) / 2,
      })
    } else if (after.high < before.low) {
      gaps.push({
        id: `fvg-short-${middle.time}`,
        direction: 'short',
        startTime: before.time,
        endTime: after.time,
        middleTime: middle.time,
        middleIndex,
        top: before.low,
        bottom: after.high,
        midpoint: (before.low + after.high) / 2,
      })
    }
  }
  return gaps
}

export function analyzeStructure(candles: Candle[], settings = defaultStructureSettings): StructureAnalysis {
  // Pattern formation is closed-candle only, but an already published setup
  // reacts to the live candle's wick immediately for entry, stop, and target.
  const firstLiveIndex = candles.findIndex((candle) => candle.confirmed === false)
  const formationCandles = firstLiveIndex === -1 ? candles : candles.slice(0, firstLiveIndex)
  const swings = findSwingPoints(formationCandles, settings.pivotLength)
  const bosEvents: BosEvent[] = []
  const chochEvents: ChochEvent[] = []
  const trendLines: TrendLine[] = []
  const brokenBullishHighs = new Set<number>()
  const brokenBearishLows = new Set<number>()
  const anchors = new Map<TradeSide, SwingPoint>()
  const anchorEstablishedAt = new Map<TradeSide, number>()
  const biasChanges: Array<{ time: number; direction: TradeSide }> = []
  let activeTrendLine: TrendLine | undefined
  const minimumBreakPercent = 0.005

  const extremeBefore = (type: SwingPoint['type'], fromIndex: number, toIndex: number): SwingPoint => {
    let extremeIndex = fromIndex
    for (let candleIndex = fromIndex + 1; candleIndex < toIndex; candleIndex += 1) {
      const isMoreExtreme = type === 'low'
        ? formationCandles[candleIndex].low < formationCandles[extremeIndex].low
        : formationCandles[candleIndex].high > formationCandles[extremeIndex].high
      if (isMoreExtreme) extremeIndex = candleIndex
    }
    return {
      time: formationCandles[extremeIndex].time,
      price: type === 'low' ? formationCandles[extremeIndex].low : formationCandles[extremeIndex].high,
      index: extremeIndex,
      type,
    }
  }

  for (let index = settings.pivotLength * 2 + 1; index < formationCandles.length; index += 1) {
    const available = swings.filter((swing) => swing.index <= index - settings.pivotLength)
    const highs = available.filter((swing) => swing.type === 'high')
    const lows = available.filter((swing) => swing.type === 'low')
    const current = formationCandles[index]
    const latestHigh = highs.at(-1)
    const latestLow = lows.at(-1)

    if (activeTrendLine && latestHigh && latestLow) {
      const distance = activeTrendLine.end.index - activeTrendLine.start.index
      const projectedPrice = distance > 0
        ? activeTrendLine.end.price
          + ((activeTrendLine.end.price - activeTrendLine.start.price) / distance) * (index - activeTrendLine.end.index)
        : activeTrendLine.end.price
      const previous = formationCandles[index - 1]
      const beforePrevious = formationCandles[index - 2]
      const bearishChoch = activeTrendLine.direction === 'long'
        && previous.close > beforePrevious.close
        && current.close < previous.open
        && current.low < latestLow.price && current.close < projectedPrice
      const bullishChoch = activeTrendLine.direction === 'short'
        && latestLow.index > latestHigh.index
        && current.high > latestHigh.price && current.close > projectedPrice
      if (bearishChoch || bullishChoch) {
        const direction: TradeSide = bullishChoch ? 'long' : 'short'
        const invalidationSwing: SwingPoint = bullishChoch ? latestLow : {
          time: previous.time, price: previous.high, index: index - 1, type: 'high',
        }
        const event: ChochEvent = {
          kind: 'choch', time: current.time, price: current.close, index, direction,
          brokenSwing: bullishChoch ? latestHigh : latestLow,
          invalidationSwing,
        }
        chochEvents.push(event)
        biasChanges.push({ time: event.time, direction })
        const anchorType = direction === 'long' ? 'low' : 'high'
        anchors.set(direction, extremeBefore(anchorType, activeTrendLine.start.index, index))
        anchorEstablishedAt.set(direction, index)
        activeTrendLine = undefined
        continue
      }
    }

    const higherLow = latestLow
    const previousLow = anchors.get('long') ?? (higherLow
      ? lows.filter((low) => low.index < higherLow.index)
        .reduce<SwingPoint | undefined>((lowest, low) => !lowest || low.price < lowest.price ? low : lowest, undefined)
      : undefined)
    const bullishBreak = higherLow && previousLow
      ? highs.filter((high) => high.index > Math.max(previousLow.index, anchorEstablishedAt.get('long') ?? -1)
        && high.index < higherLow.index)
        .reduce<SwingPoint | undefined>((highest, high) => !highest || high.price > highest.price ? high : highest, undefined)
      : undefined
    if (previousLow && higherLow && bullishBreak
      && (!activeTrendLine || activeTrendLine.direction === 'long')
      && bullishBreak.index > previousLow.index
      && higherLow.price > previousLow.price
      && current.high > bullishBreak.price * (1 + minimumBreakPercent / 100)
      && !brokenBullishHighs.has(bullishBreak.index)) {
      const event: BosEvent = {
        kind: 'bos', time: current.time, price: current.high, index, direction: 'long',
        brokenSwing: bullishBreak, invalidationSwing: higherLow,
      }
      const reversal = formationCandles[higherLow.index + 1]
      const lineEnd: SwingPoint = reversal && higherLow.index + 1 < index && reversal.close > reversal.open
        ? { time: reversal.time, price: reversal.low, index: higherLow.index + 1, type: 'low' }
        : higherLow
      const trendLine: TrendLine = {
        id: `long-${previousLow.time}-${lineEnd.time}`,
        direction: 'long', start: previousLow, end: lineEnd,
        confirmedAt: current.time, confirmedIndex: index,
      }
      bosEvents.push(event)
      biasChanges.push({ time: event.time, direction: 'long' })
      anchors.set('long', previousLow)
      const candidateSlope = (trendLine.end.price - trendLine.start.price) / (trendLine.end.index - trendLine.start.index)
      const activeSlope = activeTrendLine
        ? (activeTrendLine.end.price - activeTrendLine.start.price) / (activeTrendLine.end.index - activeTrendLine.start.index)
        : Number.POSITIVE_INFINITY
      if (!activeTrendLine || candidateSlope < activeSlope) {
        trendLines.push(trendLine)
        activeTrendLine = trendLine
      }
      brokenBullishHighs.add(bullishBreak.index)
    }

    const lowerHigh = latestHigh
    const previousHigh = anchors.get('short') ?? (lowerHigh
      ? highs.filter((high) => high.index < lowerHigh.index)
        .reduce<SwingPoint | undefined>((highest, high) => !highest || high.price > highest.price ? high : highest, undefined)
      : undefined)
    const bearishBreak = lowerHigh && previousHigh
      ? lows.filter((low) => low.index > Math.max(previousHigh.index, anchorEstablishedAt.get('short') ?? -1)
        && low.index < lowerHigh.index)
        .reduce<SwingPoint | undefined>((lowest, low) => !lowest || low.price < lowest.price ? low : lowest, undefined)
      : undefined
    if (previousHigh && lowerHigh && bearishBreak
      && (!activeTrendLine || activeTrendLine.direction === 'short')
      && bearishBreak.index > previousHigh.index
      && lowerHigh.price < previousHigh.price
      && current.low < bearishBreak.price * (1 - minimumBreakPercent / 100)
      && !brokenBearishLows.has(bearishBreak.index)) {
      const event: BosEvent = {
        kind: 'bos', time: current.time, price: current.low, index, direction: 'short',
        brokenSwing: bearishBreak, invalidationSwing: lowerHigh,
      }
      const reversal = formationCandles[lowerHigh.index + 1]
      const lineEnd: SwingPoint = reversal && lowerHigh.index + 1 < index && reversal.close < reversal.open
        ? { time: reversal.time, price: reversal.high, index: lowerHigh.index + 1, type: 'high' }
        : lowerHigh
      const trendLine: TrendLine = {
        id: `short-${previousHigh.time}-${lineEnd.time}`,
        direction: 'short', start: previousHigh, end: lineEnd,
        confirmedAt: current.time, confirmedIndex: index,
      }
      bosEvents.push(event)
      biasChanges.push({ time: event.time, direction: 'short' })
      anchors.set('short', previousHigh)
      const candidateSlope = (trendLine.end.price - trendLine.start.price) / (trendLine.end.index - trendLine.start.index)
      const activeSlope = activeTrendLine
        ? (activeTrendLine.end.price - activeTrendLine.start.price) / (activeTrendLine.end.index - activeTrendLine.start.index)
        : Number.POSITIVE_INFINITY
      if (!activeTrendLine || candidateSlope < activeSlope) {
        trendLines.push(trendLine)
        activeTrendLine = trendLine
      }
      brokenBearishLows.add(bearishBreak.index)
    }
  }

  const fvgZones = findFairValueGaps(formationCandles)
  const chronologicalBiasChanges = biasChanges.sort((a, b) => a.time - b.time)
    .filter((change, index, all) => index === 0 || change.direction !== all[index - 1].direction)

  const setupEvents: Array<{ event: StructureEvent; setupType: FairValueGap['setupType'] }> = [
    ...chochEvents.map((event) => ({ event, setupType: 'choch' as const })),
    ...bosEvents.map((event) => ({ event, setupType: 'trend-continuation' as const })),
  ]
  const fairValueGaps = setupEvents.flatMap(({ event: choch, setupType }) => {
    // Search the entire structural leg from its invalidation swing to CHoCH.
    // When several three-candle imbalances exist, use the widest gap: it is
    // the dominant displacement zone and avoids selecting tiny later gaps.
    const candidates = fvgZones.filter((gap) => gap.direction === choch.direction
      && gap.middleIndex > choch.invalidationSwing.index && gap.middleIndex <= choch.index)
    const establishedBeforeChoch = candidates.filter((candidate) => candidate.middleIndex < choch.index - 1)
    const relevantCandidates = establishedBeforeChoch.length > 0 ? establishedBeforeChoch : candidates
    const selected = relevantCandidates.sort((a, b) => (b.top - b.bottom) - (a.top - a.bottom)
      || b.middleIndex - a.middleIndex)[0]
    if (!selected) return []
    const { middleIndex, middleTime, top, bottom, midpoint } = selected
    const before = formationCandles[middleIndex - 1]
    const after = formationCandles[middleIndex + 1]
    const detectedIndex = Math.max(choch.index, middleIndex + 1)
    const detectedTime = formationCandles[detectedIndex].time
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
      id: `${setupType}-${choch.direction}-${detectedTime}`,
      direction: choch.direction,
      setupType,
      detectedTime,
      detectedIndex,
      startTime: before.time,
      endTime: candles.at(-1)!.time,
      middleTime,
      middleIndex,
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
    const evaluationStart = detectedIndex + 1
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

  const bias = chronologicalBiasChanges.at(-1)?.direction ?? 'neutral'

  return { swings, chochEvents, bosEvents, trendLines, fvgZones, fairValueGaps, biasChanges: chronologicalBiasChanges, bias }
}

export function alignedOneMinuteSetups(oneMinute: StructureAnalysis, fifteenMinute: StructureAnalysis) {
  return oneMinute.fairValueGaps.filter((gap) => {
    const knownBias = fifteenMinute.biasChanges
      .filter((change) => change.time <= gap.detectedTime)
      .at(-1)?.direction
    return knownBias === gap.direction
  })
}

export function oneSetupAtATime(setups: FairValueGap[]) {
  const selected: FairValueGap[] = []
  let unavailableUntil = Number.NEGATIVE_INFINITY

  for (const setup of [...setups].sort((a, b) => a.detectedTime - b.detectedTime)) {
    if (setup.detectedTime <= unavailableUntil) continue
    selected.push(setup)
    unavailableUntil = setup.exitTime ?? Number.POSITIVE_INFINITY
  }

  return selected
}
