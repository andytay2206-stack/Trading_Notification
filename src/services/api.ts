import type { BacktestConfig, BacktestResult } from '../lib/backtest'
import type { Candle } from '../types'

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
      totalTrades: result.trades.length,
      maxDrawdownR: result.maxDrawdownR,
      config,
    }),
  })
}
