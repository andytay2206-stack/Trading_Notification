export type Currency = 'USD' | 'IDR' | 'MYR'
export type TradeOutcome = 'win' | 'loss' | 'breakeven' | 'cancelled' | 'open'
export type TradeSide = 'long' | 'short'

export interface Trade {
  id: string
  symbol: 'BTCUSDT'
  side: TradeSide
  openedAt: string
  closedAt?: string
  entryPrice: number
  exitPrice?: number
  riskUsd: number
  pnlUsd: number
  rMultiple: number
  outcome: TradeOutcome
}

export interface Candle {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  confirmed: boolean
}

export type CandleInterval = '1' | '3' | '5' | '15' | '30' | '60' | '240' | 'D'
