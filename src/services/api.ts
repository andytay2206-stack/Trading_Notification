import type { BacktestConfig, BacktestResult } from '../lib/backtest'
import type { Candle } from '../types'
import type { Trade } from '../types'

export interface AuthUser {
  id: string
  username: string
}

async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  const payload = response.status === 204 ? null : await response.json()
  if (!response.ok) throw new Error(payload?.error || `Request failed with HTTP ${response.status}`)
  return payload as T
}

export async function getSession() {
  return jsonRequest<{ user: AuthUser }>('/api/auth/session')
}

export async function login(username: string, password: string) {
  return jsonRequest<{ user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function logout() {
  await jsonRequest<null>('/api/auth/logout', { method: 'POST' })
}

export async function saveBacktestRun(config: BacktestConfig, result: BacktestResult, candles: Candle[]) {
  const first = candles.at(0)
  const last = candles.at(-1)
  if (!first || !last) return

  await jsonRequest('/api/backtests', {
    method: 'POST',
    body: JSON.stringify({
      interval: config.interval,
      candleCount: candles.length,
      windowStart: new Date(first.time * 1000).toISOString(),
      windowEnd: new Date(last.time * 1000).toISOString(),
      riskUsd: config.riskUsd,
      rewardRisk: config.rewardRisk,
      netProfitUsd: result.netProfitUsd,
      netR: result.netR,
      winRate: result.winRate,
      wins: result.wins,
      losses: result.losses,
      cancellations: result.cancellations,
      totalTrades: result.trades.length,
      maxDrawdownR: result.maxDrawdownR,
      config,
    }),
  })
}

export interface StrategyNotification {
  id: string
  signal_key: string
  direction: 'long' | 'short'
  higher_timeframe_bias: 'long' | 'short' | 'neutral'
  detected_at: string
  entry_time: string | null
  exit_time: string | null
  entry_price: string
  stop_price: string
  target_price: string
  exit_price: string | null
  risk_usd: string
  outcome: 'waiting' | 'active' | 'win' | 'loss' | 'cancelled'
  r_result: string
  decision: 'accepted' | 'dismissed' | null
  decided_at: string | null
}

export async function scanStrategy() {
  return jsonRequest<{ scanned: number; bias: string; startedAt: string }>('/api/strategy/scan', { method: 'POST' })
}

export async function getStrategyState() {
  return jsonRequest<{ startedAt: string }>('/api/strategy/state')
}

export async function getStrategyNotifications() {
  return jsonRequest<{ notifications: StrategyNotification[] }>('/api/strategy/notifications')
}

export async function decideStrategyNotification(id: string, decision: 'accepted' | 'dismissed') {
  return jsonRequest(`/api/strategy/notifications/${id}/decision`, {
    method: 'PATCH',
    body: JSON.stringify({ decision }),
  })
}

interface ApiTrade {
  id: string
  symbol: 'BTCUSDT'
  side: 'long' | 'short'
  status: 'open' | 'win' | 'loss' | 'breakeven' | 'cancelled'
  entry_price: string
  exit_price: string | null
  risk_usd: string
  pnl_usd: string
  r_multiple: string
  opened_at: string
  closed_at: string | null
}

export async function getPortfolioTrades(): Promise<Trade[]> {
  const response = await jsonRequest<{ trades: ApiTrade[] }>('/api/trades')
  return response.trades.map((trade) => ({
    id: trade.id,
    symbol: trade.symbol,
    side: trade.side,
    openedAt: trade.opened_at,
    closedAt: trade.closed_at ?? undefined,
    entryPrice: Number(trade.entry_price),
    exitPrice: trade.exit_price ? Number(trade.exit_price) : undefined,
    riskUsd: Number(trade.risk_usd),
    pnlUsd: Number(trade.pnl_usd),
    rMultiple: Number(trade.r_multiple),
    outcome: trade.status,
  }))
}
