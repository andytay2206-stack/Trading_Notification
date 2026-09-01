import type { Trade } from '../types'

export interface PerformanceSummary {
  totalPnlUsd: number
  totalR: number
  todayR: number
  overallWinRate: number
  todayWinRate: number
  closedTrades: number
  todayTrades: number
  wins: number
  losses: number
}

const isSameLocalDay = (isoDate: string, now: Date) => {
  const date = new Date(isoDate)
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
}

const winRate = (trades: Trade[]) => {
  if (trades.length === 0) return 0
  return (trades.filter((trade) => trade.outcome === 'win').length / trades.length) * 100
}

export function summarizePerformance(trades: Trade[], now = new Date()): PerformanceSummary {
  const closed = trades.filter((trade) => trade.outcome !== 'open')
  const today = closed.filter((trade) => trade.closedAt && isSameLocalDay(trade.closedAt, now))

  return {
    totalPnlUsd: closed.reduce((sum, trade) => sum + trade.pnlUsd, 0),
    totalR: closed.reduce((sum, trade) => sum + trade.rMultiple, 0),
    todayR: today.reduce((sum, trade) => sum + trade.rMultiple, 0),
    overallWinRate: winRate(closed),
    todayWinRate: winRate(today),
    closedTrades: closed.length,
    todayTrades: today.length,
    wins: closed.filter((trade) => trade.outcome === 'win').length,
    losses: closed.filter((trade) => trade.outcome === 'loss').length,
  }
}
