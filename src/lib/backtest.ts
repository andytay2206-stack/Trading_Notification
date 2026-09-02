import type { Candle, CandleInterval } from '../types'
import { alignedOneMinuteSetups, analyzeStructure, oneSetupAtATime } from './structureStrategy'

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
  fifteenMinuteCandles: Candle[],
  config: BacktestConfig,
  windowStart = Number.NEGATIVE_INFINITY,
  windowEnd = Number.POSITIVE_INFINITY,
): BacktestResult {
  const settings = {
    pivotLength: config.pivotLength,
    stopBufferPercent: config.stopBufferPercent,
    rewardRisk: config.rewardRisk,
    maxSetupCandles: 180,
  }
  const oneMinute = analyzeStructure(oneMinuteCandles, settings)
  const fifteenMinute = analyzeStructure(fifteenMinuteCandles, settings)
  const setups = oneSetupAtATime(alignedOneMinuteSetups(oneMinute, fifteenMinute))
    .filter((setup) => setup.choch.time >= windowStart && setup.choch.time <= windowEnd)
  const trades: BacktestTrade[] = setups
    .filter((setup) => setup.entryTime && setup.exitTime
      && (setup.status === 'won' || setup.status === 'lost' || setup.status === 'cancelled'))
    .map((setup) => {
      const won = setup.status === 'won'
      const lost = setup.status === 'lost'
      const rMultiple = setup.rResult ?? (won ? config.rewardRisk : lost ? -1 : 0)
      return {
        id: setup.id,
        side: setup.direction,
        entryTime: setup.entryTime!,
        exitTime: setup.exitTime!,
        entryPrice: setup.midpoint,
        exitPrice: setup.exitPrice ?? (won ? setup.targetPrice : setup.stopPrice),
        rMultiple,
        pnlUsd: rMultiple * config.riskUsd,
        outcome: won ? 'win' as const : lost ? 'loss' as const : 'cancelled' as const,
        exitReason: won ? 'target' as const : lost ? 'stop' as const : 'cancelled' as const,
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
