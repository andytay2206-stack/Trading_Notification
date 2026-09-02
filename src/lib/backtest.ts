import type { Candle, CandleInterval } from '../types'
import { alignedOneMinuteSetups, analyzeStructure } from './structureStrategy'

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
  outcome: 'win' | 'loss'
  exitReason: 'target' | 'stop'
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

export function runStructureBacktest(oneMinuteCandles: Candle[], fifteenMinuteCandles: Candle[], config: BacktestConfig): BacktestResult {
  const settings = {
    pivotLength: config.pivotLength,
    stopBufferPercent: config.stopBufferPercent,
    rewardRisk: config.rewardRisk,
    maxEntryWaitCandles: 120,
  }
  const oneMinute = analyzeStructure(oneMinuteCandles, settings)
  const fifteenMinute = analyzeStructure(fifteenMinuteCandles, settings)
  const setups = alignedOneMinuteSetups(oneMinute, fifteenMinute)
  const trades: BacktestTrade[] = setups
    .filter((setup) => setup.entryTime && setup.exitTime && (setup.status === 'won' || setup.status === 'lost'))
    .map((setup) => {
      const won = setup.status === 'won'
      const rMultiple = won ? config.rewardRisk : -1
      return {
        id: setup.id,
        side: setup.direction,
        entryTime: setup.entryTime!,
        exitTime: setup.exitTime!,
        entryPrice: setup.midpoint,
        exitPrice: won ? setup.targetPrice : setup.stopPrice,
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
  const losses = trades.length - wins
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

export function randomHistoricalEnd(now = Date.now(), random = Math.random) {
  const minimumAge = 2 * 24 * 60 * 60 * 1_000
  const historyRange = 730 * 24 * 60 * 60 * 1_000
  return Math.floor(now - minimumAge - random() * historyRange)
}
