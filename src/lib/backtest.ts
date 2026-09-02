import type { Candle, CandleInterval } from '../types'
import { analyzeStructure, oneSetupAtATime } from './structureStrategy'

export interface BacktestConfig {
  interval: CandleInterval
  candleCount: number
  pivotLength: number
  stopBufferPercent: number
  rewardRisk: number
  riskUsd: number
}

export interface BacktestTrade {
  id: string
  side: 'long' | 'short'
  entryTime: number
  exitTime: number
  entryPrice: number
  exitPrice: number
  rMultiple: number
  pnlUsd: number
  outcome: 'win' | 'loss' | 'cancelled'
  exitReason: 'target' | 'stop' | 'cancelled'
}

export interface BacktestResult {
  trades: BacktestTrade[]
  netR: number
  netProfitUsd: number
  winRate: number
  wins: number
  losses: number
  cancellations: number
  maxDrawdownR: number
}

export function runStructureBacktest(
  oneMinuteCandles: Candle[],
  _fifteenMinuteCandles: Candle[],
  config: BacktestConfig,
  windowStart = Number.NEGATIVE_INFINITY,
  windowEnd = Number.POSITIVE_INFINITY,
): BacktestResult {
  const settings = {
    pivotLength: config.pivotLength,
    stopBufferPercent: config.stopBufferPercent,
    rewardRisk: config.rewardRisk,
  }
  const oneMinute = analyzeStructure(oneMinuteCandles, settings)
  const setups = oneSetupAtATime(oneMinute.fairValueGaps)
    .filter((setup) => setup.choch.time >= windowStart && setup.choch.time <= windowEnd)
  const trades: BacktestTrade[] = setups
    .filter((setup) => setup.entryTime && setup.exitTime
      && (setup.status === 'won' || setup.status === 'lost'))
    .map((setup) => {
      const won = setup.status === 'won'
      const rMultiple = setup.rResult ?? (won ? config.rewardRisk : -1)
      return {
        id: setup.id,
        side: setup.direction,
        entryTime: setup.entryTime!,
        exitTime: setup.exitTime!,
        entryPrice: setup.midpoint,
        exitPrice: setup.exitPrice ?? (won ? setup.targetPrice : setup.stopPrice),
        rMultiple,
        pnlUsd: rMultiple * config.riskUsd,
        outcome: won ? 'win' as const : 'loss' as const,
        exitReason: won ? 'target' as const : 'stop' as const,
      }
    })

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
  const cancellations = trades.filter((trade) => trade.outcome === 'cancelled').length
  return {
    trades,
    netR,
    netProfitUsd: netR * config.riskUsd,
    winRate: wins + losses ? (wins / (wins + losses)) * 100 : 0,
    wins,
    losses,
    cancellations,
    maxDrawdownR,
  }
}

export function randomHistoricalEnd(now = Date.now(), random = Math.random) {
  const minimumAge = 2 * 24 * 60 * 60 * 1_000
  const randomHistory = 730 * 24 * 60 * 60 * 1_000
  const timestamp = now - minimumAge - random() * randomHistory
  return Math.floor(timestamp / 60_000) * 60_000
}
