import type { Candle, CandleInterval } from '../types'

const REST_URL = import.meta.env.DEV
  ? '/bybit-api/v5/market/kline'
  : (import.meta.env.VITE_BYBIT_REST_URL ?? 'https://api.bybit.com/v5/market/kline')
const WS_URL = 'wss://stream.bybit.com/v5/public/linear'

interface BybitKlineResponse {
  retCode: number
  retMsg: string
  result: {
    list: string[][]
  }
}

interface BybitSocketMessage {
  topic?: string
  data?: Array<{
    start: number
    open: string
    high: string
    low: string
    close: string
    volume: string
    confirm: boolean
  }>
}

interface CandleRequest {
  limit?: number
  end?: number
}

export async function fetchCandles(interval: CandleInterval, signal?: AbortSignal, request: CandleRequest = {}): Promise<Candle[]> {
  const params = new URLSearchParams({
    category: 'linear',
    symbol: 'BTCUSDT',
    interval,
    limit: String(request.limit ?? 300),
  })
  if (request.end) params.set('end', String(request.end))
  const response = await fetch(`${REST_URL}?${params}`, { signal })
  if (!response.ok) throw new Error(`Bybit returned HTTP ${response.status}`)

  const payload = await response.json() as BybitKlineResponse
  if (payload.retCode !== 0) throw new Error(payload.retMsg || 'Bybit rejected the candle request')

  return payload.result.list.map(([time, open, high, low, close, volume]) => ({
    time: Number(time) / 1000,
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
    volume: Number(volume),
    confirmed: Number(time) < Date.now() - 1_000,
  })).reverse()
}

export function subscribeToCandles(
  interval: CandleInterval,
  onCandle: (candle: Candle) => void,
  onStatus: (status: 'connecting' | 'live' | 'offline') => void,
) {
  onStatus('connecting')
  const socket = new WebSocket(WS_URL)
  const topic = `kline.${interval}.BTCUSDT`
  let pingTimer: number | undefined

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ op: 'subscribe', args: [topic] }))
    pingTimer = window.setInterval(() => socket.send(JSON.stringify({ op: 'ping' })), 20_000)
    onStatus('live')
  })

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data) as BybitSocketMessage
    const item = message.topic === topic ? message.data?.[0] : undefined
    if (!item) return
    onCandle({
      time: item.start / 1000,
      open: Number(item.open),
      high: Number(item.high),
      low: Number(item.low),
      close: Number(item.close),
      volume: Number(item.volume),
      confirmed: item.confirm,
    })
  })

  socket.addEventListener('error', () => onStatus('offline'))
  socket.addEventListener('close', () => onStatus('offline'))

  return () => {
    if (pingTimer) window.clearInterval(pingTimer)
    socket.close()
  }
}
