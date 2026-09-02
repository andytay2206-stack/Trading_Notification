import type { Candle, CandleInterval } from '../types'

const REST_URL = '/api/market/candles'

interface BybitKlineResponse {
  retCode: number
  retMsg: string
  result: {
    list: string[][]
  }
}

interface BybitStreamCandle {
  start: number
  open: string
  high: string
  low: string
  close: string
  volume: string
  confirm: boolean
}

interface CandleRequest {
  limit?: number
  end?: number
}

const intervalSeconds = (interval: CandleInterval) => interval === 'D' ? 86_400 : Number(interval) * 60

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
    confirmed: Number(time) / 1000 + intervalSeconds(interval) <= Date.now() / 1000,
  })).reverse()
}

export async function fetchCandleRange(
  interval: CandleInterval,
  start: number,
  end: number,
  signal?: AbortSignal,
): Promise<Candle[]> {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new Error('The historical start must be earlier than the end')
  }

  const candles = new Map<number, Candle>()
  let cursor = end
  while (cursor >= start) {
    const page = await fetchCandles(interval, signal, { limit: 1000, end: cursor })
    if (page.length === 0) break
    page.forEach((item) => {
      const timestamp = item.time * 1000
      if (timestamp >= start && timestamp <= end) candles.set(item.time, item)
    })
    const oldest = page[0].time * 1000
    if (oldest <= start || oldest >= cursor) break
    cursor = oldest - 1
  }

  return [...candles.values()].sort((a, b) => a.time - b.time)
}

export function subscribeToCandles(
  interval: CandleInterval,
  onCandle: (candle: Candle) => void,
  onStatus: (status: 'connecting' | 'live' | 'offline') => void,
) {
  onStatus('connecting')
  const stream = new EventSource(`/api/market/stream?interval=${encodeURIComponent(interval)}`)

  stream.addEventListener('ready', () => {
    onStatus('live')
  })

  stream.addEventListener('message', (event) => {
    try {
      const items = JSON.parse(event.data) as BybitStreamCandle[]
      const item = Array.isArray(items) ? items[0] : undefined
      if (!item) return
      const candle = {
        time: Number(item.start) / 1000,
        open: Number(item.open),
        high: Number(item.high),
        low: Number(item.low),
        close: Number(item.close),
        volume: Number(item.volume),
        confirmed: Boolean(item.confirm),
      }
      if (![candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)) return
      onCandle(candle)
    } catch {
      // Ignore a malformed stream event; the REST poll remains available as fallback.
    }
  })

  stream.addEventListener('error', () => onStatus('offline'))

  return () => {
    stream.close()
  }
}
