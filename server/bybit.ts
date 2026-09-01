import { RestClientV5, WebsocketClient, type APIRegion } from 'bybit-api'
import { config } from './config.js'

const credentials = config.bybitApiKey && config.bybitApiSecret
  ? { key: config.bybitApiKey, secret: config.bybitApiSecret }
  : {}

const region = config.bybitApiRegion as APIRegion
export const restClient = new RestClientV5({
  ...credentials,
  testnet: config.bybitTestnet,
  apiRegion: region,
  ...(config.bybitBaseUrl ? { baseUrl: config.bybitBaseUrl } : {}),
})
const websocket = new WebsocketClient({
  ...credentials,
  testnet: config.bybitTestnet,
  restOptions: { apiRegion: region },
  ...(config.bybitWsUrl ? { wsUrl: config.bybitWsUrl } : {}),
})

export function describeBybitError(error: unknown) {
  if (!(error instanceof Error)) return String(error)
  const code = 'code' in error ? String(error.code) : undefined
  const cause = error.cause instanceof Error ? error.cause.message : undefined
  return [code, error.message, cause].filter(Boolean).join(' · ')
}

type CandleListener = (data: unknown) => void
const listeners = new Map<string, Set<CandleListener>>()
const subscriptions = new Set<string>()

websocket.on('update', (message: { topic?: string; data?: unknown }) => {
  if (!message.topic) return
  listeners.get(message.topic)?.forEach((listener) => listener(message.data))
})

websocket.on('exception', (error) => {
  console.error('[bybit websocket]', describeBybitError(error))
})

export function subscribeToKline(interval: string, listener: CandleListener) {
  const topic = `kline.${interval}.BTCUSDT`
  if (!subscriptions.has(topic)) {
    subscriptions.add(topic)
    websocket.subscribeV5(topic, 'linear')
  }
  const topicListeners = listeners.get(topic) ?? new Set<CandleListener>()
  topicListeners.add(listener)
  listeners.set(topic, topicListeners)

  return () => topicListeners.delete(listener)
}
