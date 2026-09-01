import { describe, expect, it } from 'vitest'
import type { Trade } from '../types'
import { summarizePerformance } from './performance'

const trades: Trade[] = [
  { id: '1', symbol: 'BTCUSDT', side: 'long', openedAt: '2026-09-01T01:00:00Z', closedAt: '2026-09-01T02:00:00Z', entryPrice: 100, exitPrice: 102, riskUsd: 100, pnlUsd: 200, rMultiple: 2, outcome: 'win' },
  { id: '2', symbol: 'BTCUSDT', side: 'short', openedAt: '2026-09-01T03:00:00Z', closedAt: '2026-09-01T04:00:00Z', entryPrice: 100, exitPrice: 101, riskUsd: 100, pnlUsd: -100, rMultiple: -1, outcome: 'loss' },
  { id: '3', symbol: 'BTCUSDT', side: 'long', openedAt: '2026-08-31T01:00:00Z', closedAt: '2026-08-31T02:00:00Z', entryPrice: 100, exitPrice: 101, riskUsd: 100, pnlUsd: 100, rMultiple: 1, outcome: 'win' },
  { id: '4', symbol: 'BTCUSDT', side: 'long', openedAt: '2026-09-01T05:00:00Z', entryPrice: 100, riskUsd: 100, pnlUsd: 0, rMultiple: 0, outcome: 'open' },
]

describe('summarizePerformance', () => {
  it('calculates closed trade, win-rate, P&L, and R metrics', () => {
    const result = summarizePerformance(trades, new Date('2026-09-01T12:00:00+08:00'))

    expect(result.totalPnlUsd).toBe(200)
    expect(result.totalR).toBe(2)
    expect(result.overallWinRate).toBeCloseTo(66.67, 1)
    expect(result.todayWinRate).toBe(50)
    expect(result.todayR).toBe(1)
    expect(result.closedTrades).toBe(3)
    expect(result.todayTrades).toBe(2)
  })

  it('returns zero win rates for an empty ledger', () => {
    expect(summarizePerformance([]).overallWinRate).toBe(0)
    expect(summarizePerformance([]).todayWinRate).toBe(0)
  })
})
