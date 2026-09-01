import type { Candle, CandleInterval, TradeSide } from '../types'

export interface BacktestConfig {
  interval: CandleInterval
  candleCount: number
  fastEma: number
  slowEma: number
  atrPeriod: number
  rewardRisk: number
  riskUsd: number
}

export interface BacktestTrade {
  id: string
  side: TradeSide
  entryTime: number
  exitTime: number
  entryPrice: number
  exitPrice: number
  rMultiple: number
  pnlUsd: number
  outcome: 'win' | 'loss' | 'breakeven'
  exitReason: 'target' | 'stop' | 'opposite-signal' | 'window-end'
}

export interface BacktestResult {
  trades: BacktestTrade[]
  netR: number
  netProfitUsd: number
  winRate: number
  wins: number
  losses: number
  maxDrawdownR: number
}

const ema = (values: number[], period: number) => {
  const multiplier = 2 / (period + 1)
  return values.reduce<number[]>((output, value, index) => {
    output.push(index === 0 ? value : value * multiplier + output[index - 1] * (1 - multiplier))
    return output
  }, [])
}

const atr = (candles: Candle[], period: number) => {
  const trueRanges = candles.map((candle, index) => {
    const previousClose = candles[index - 1]?.close ?? candle.close
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose))
  })
  const values: number[] = []
  let running = 0
  trueRanges.forEach((range, index) => {
    running += range
    if (index >= period) running -= trueRanges[index - period]
    values.push(running / Math.min(index + 1, period))
  })
  return values
}

export function runEmaBacktest(candles: Candle[], config: BacktestConfig): BacktestResult {
  if (candles.length < config.slowEma + 2) return emptyResult()
  const fast = ema(candles.map((candle) => candle.close), config.fastEma)
  const slow = ema(candles.map((candle) => candle.close), config.slowEma)
  const volatility = atr(candles, config.atrPeriod)
  const trades: BacktestTrade[] = []
  let position: { side: TradeSide; entryIndex: number; entryPrice: number; risk: number; stop: number; target: number } | null = null

  const closePosition = (index: number, exitPrice: number, exitReason: BacktestTrade['exitReason']) => {
    if (!position) return
    const rawR = position.side === 'long'
      ? (exitPrice - position.entryPrice) / position.risk
      : (position.entryPrice - exitPrice) / position.risk
    const rMultiple = Math.round(rawR * 100) / 100
    trades.push({
      id: `backtest-${position.entryIndex}-${index}`,
      side: position.side,
      entryTime: candles[position.entryIndex].time,
      exitTime: candles[index].time,
      entryPrice: position.entryPrice,
      exitPrice,
      rMultiple,
      pnlUsd: rMultiple * config.riskUsd,
      outcome: rMultiple > 0 ? 'win' : rMultiple < 0 ? 'loss' : 'breakeven',
      exitReason,
    })
    position = null
  }

  for (let index = config.slowEma; index < candles.length; index += 1) {
    const candle = candles[index]
    const crossedUp = fast[index - 1] <= slow[index - 1] && fast[index] > slow[index]
    const crossedDown = fast[index - 1] >= slow[index - 1] && fast[index] < slow[index]

    if (position) {
      // If both levels are touched in one candle, assume the stop was hit first.
      if (position.side === 'long' && candle.low <= position.stop) closePosition(index, position.stop, 'stop')
      else if (position.side === 'short' && candle.high >= position.stop) closePosition(index, position.stop, 'stop')
      else if (position.side === 'long' && candle.high >= position.target) closePosition(index, position.target, 'target')
      else if (position.side === 'short' && candle.low <= position.target) closePosition(index, position.target, 'target')
      else if ((position.side === 'long' && crossedDown) || (position.side === 'short' && crossedUp)) closePosition(index, candle.close, 'opposite-signal')
    }

    if (!position && (crossedUp || crossedDown)) {
      const side: TradeSide = crossedUp ? 'long' : 'short'
      const risk = Math.max(volatility[index], candle.close * 0.0001)
      position = {
        side,
        entryIndex: index,
        entryPrice: candle.close,
        risk,
        stop: side === 'long' ? candle.close - risk : candle.close + risk,
        target: side === 'long' ? candle.close + risk * config.rewardRisk : candle.close - risk * config.rewardRisk,
      }
    }
  }

  if (position) closePosition(candles.length - 1, candles.at(-1)!.close, 'window-end')

  const netR = trades.reduce((sum, trade) => sum + trade.rMultiple, 0)
  let equityR = 0
  let peakR = 0
  let maxDrawdownR = 0
  trades.forEach((trade) => {
    equityR += trade.rMultiple
    peakR = Math.max(peakR, equityR)
    maxDrawdownR = Math.max(maxDrawdownR, peakR - equityR)
  })
  const wins = trades.filter((trade) => trade.outcome === 'win').length
  const losses = trades.filter((trade) => trade.outcome === 'loss').length

  return {
    trades,
    netR,
    netProfitUsd: netR * config.riskUsd,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    wins,
    losses,
    maxDrawdownR,
  }
}

const emptyResult = (): BacktestResult => ({ trades: [], netR: 0, netProfitUsd: 0, winRate: 0, wins: 0, losses: 0, maxDrawdownR: 0 })

export function randomHistoricalEnd(now = Date.now(), random = Math.random) {
  const minimumAge = 2 * 24 * 60 * 60 * 1_000
  const historyRange = 730 * 24 * 60 * 60 * 1_000
  return Math.floor(now - minimumAge - random() * historyRange)
}
