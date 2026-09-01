import type { Trade } from '../types'

const atLocalTime = (daysAgo: number, hour: number) => {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

export const demoTrades: Trade[] = [
  { id: 'demo-1', symbol: 'BTCUSDT', side: 'long', openedAt: atLocalTime(0, 8), closedAt: atLocalTime(0, 9), entryPrice: 108_240, exitPrice: 109_105, riskUsd: 120, pnlUsd: 240, rMultiple: 2, outcome: 'win' },
  { id: 'demo-2', symbol: 'BTCUSDT', side: 'short', openedAt: atLocalTime(0, 11), closedAt: atLocalTime(0, 12), entryPrice: 109_320, exitPrice: 109_720, riskUsd: 120, pnlUsd: -120, rMultiple: -1, outcome: 'loss' },
  { id: 'demo-3', symbol: 'BTCUSDT', side: 'short', openedAt: atLocalTime(1, 16), closedAt: atLocalTime(1, 18), entryPrice: 110_150, exitPrice: 108_950, riskUsd: 150, pnlUsd: 300, rMultiple: 2, outcome: 'win' },
  { id: 'demo-4', symbol: 'BTCUSDT', side: 'long', openedAt: atLocalTime(2, 7), closedAt: atLocalTime(2, 8), entryPrice: 107_800, exitPrice: 107_300, riskUsd: 100, pnlUsd: -100, rMultiple: -1, outcome: 'loss' },
  { id: 'demo-5', symbol: 'BTCUSDT', side: 'long', openedAt: atLocalTime(3, 20), closedAt: atLocalTime(3, 23), entryPrice: 105_900, exitPrice: 107_420, riskUsd: 100, pnlUsd: 250, rMultiple: 2.5, outcome: 'win' },
]
