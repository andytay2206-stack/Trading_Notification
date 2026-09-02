import { useEffect, useMemo, useState } from 'react'
import { CandleChart } from '../components/CandleChart'
import { fetchCandles, subscribeToCandles } from '../services/bybit'
import { getStrategyState } from '../services/api'
import { alignedOneMinuteSetups, analyzeStructure, oneSetupAtATime } from '../lib/structureStrategy'
import type { Candle, CandleInterval } from '../types'

const intervals: Array<{ value: CandleInterval; label: string }> = [
  { value: '1', label: '1m' }, { value: '3', label: '3m' }, { value: '5', label: '5m' },
  { value: '15', label: '15m' }, { value: '30', label: '30m' }, { value: '60', label: '1H' },
  { value: '240', label: '4H' }, { value: 'D', label: '1D' },
]
const MARKET_INTERVAL_KEY = 'northstar.market.interval'

const initialInterval = (): CandleInterval => {
  try {
    const saved = window.localStorage.getItem(MARKET_INTERVAL_KEY)
    if (intervals.some((item) => item.value === saved)) return saved as CandleInterval
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
  return '15'
}

type ConnectionStatus = 'connecting' | 'live' | 'polling' | 'offline'

const mergeCandles = (current: Candle[], incoming: Candle[]) => {
  const merged = new Map(current.map((candle) => [candle.time, candle]))
  incoming.forEach((candle) => merged.set(candle.time, candle))
  return [...merged.values()].sort((a, b) => a.time - b.time).slice(-300)
}

export function Market() {
  const [interval, setInterval] = useState<CandleInterval>(initialInterval)
  const [candles, setCandles] = useState<Candle[]>([])
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [fifteenMinuteCandles, setFifteenMinuteCandles] = useState<Candle[]>([])
  const [strategyStartedAt, setStrategyStartedAt] = useState<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    let pollTimer: number | undefined
    setCandles([])
    setError(null)
    setStatus('connecting')

    const refresh = (initial = false) => fetchCandles(interval, controller.signal, { limit: initial ? 300 : 3 })
      .then((incoming) => {
        if (!active) return
        setCandles((current) => initial ? incoming : mergeCandles(current, incoming))
        setError(null)
        setLastUpdated(new Date())
        setStatus((current) => current === 'live' ? 'live' : 'polling')
      })
      .catch((cause: unknown) => {
        if (!active || (cause instanceof DOMException && cause.name === 'AbortError')) return
        setError(cause instanceof Error ? cause.message : 'Could not load Bybit candles')
        setStatus('offline')
      })

    const schedulePoll = () => {
      if (!active) return
      pollTimer = window.setTimeout(() => void refresh().finally(schedulePoll), 10_000)
    }
    void refresh(true).finally(schedulePoll)

    const unsubscribe = subscribeToCandles(interval, (incoming) => {
      if (!active) return
      setCandles((current) => {
        const last = current.at(-1)
        if (!last || incoming.time > last.time) return [...current, incoming].slice(-300)
        if (incoming.time === last.time) return [...current.slice(0, -1), incoming]
        return current
      })
      setLastUpdated(new Date())
    }, (socketStatus) => {
      if (!active) return
      if (socketStatus === 'live') setStatus('live')
      if (socketStatus === 'connecting') setStatus('connecting')
    })

    return () => {
      active = false
      controller.abort()
      if (pollTimer !== undefined) window.clearTimeout(pollTimer)
      unsubscribe()
    }
  }, [interval, reloadKey])

  useEffect(() => {
    const controller = new AbortController()
    const loadBias = () => fetchCandles('15', controller.signal, { limit: 500 }).then(setFifteenMinuteCandles).catch(() => undefined)
    void loadBias()
    const timer = window.setInterval(() => void loadBias(), 60_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    void getStrategyState()
      .then(({ startedAt }) => setStrategyStartedAt(new Date(startedAt).getTime() / 1000))
      .catch(() => setStrategyStartedAt(null))
  }, [])

  const latest = candles.at(-1)
  const previous = candles.at(-2)
  const change = useMemo(() => latest && previous ? ((latest.close - previous.close) / previous.close) * 100 : 0, [latest, previous])
  const confirmedCandles = useMemo(() => candles.filter((candle) => candle.confirmed), [candles])
  const confirmedSignature = confirmedCandles
    .map((candle) => `${candle.time}:${candle.open}:${candle.high}:${candle.low}:${candle.close}`)
    .join('|')
  const analysis = useMemo(() => analyzeStructure(confirmedCandles), [confirmedSignature])
  const fifteenMinuteAnalysis = useMemo(() => analyzeStructure(fifteenMinuteCandles.filter((candle) => candle.confirmed)), [fifteenMinuteCandles])
  const alignedSetups = useMemo(
    () => interval === '1' && strategyStartedAt !== null
      ? oneSetupAtATime(alignedOneMinuteSetups(analysis, fifteenMinuteAnalysis)
        .filter((setup) => setup.choch.time >= strategyStartedAt))
      : [],
    [analysis, fifteenMinuteAnalysis, interval, strategyStartedAt],
  )
  const chartSetups = useMemo(
    () => alignedSetups.filter((setup) => setup.status === 'open' || setup.status === 'filled'),
    [alignedSetups],
  )
  const alignedSetupIds = useMemo(() => alignedSetups.map((setup) => setup.id), [alignedSetups])

  const selectInterval = (nextInterval: CandleInterval) => {
    if (nextInterval === interval) return
    setCandles([])
    setInterval(nextInterval)
    try {
      window.localStorage.setItem(MARKET_INTERVAL_KEY, nextInterval)
    } catch {
      // The in-memory selection still works when storage is unavailable.
    }
  }

  return (
    <main>
      <section className="page-heading market-heading">
        <div>
          <div className="overline">Live market</div>
          <h1>Bitcoin <span>Perpetual.</span></h1>
          <p>Real-time public market data from Bybit. No trading account is connected.</p>
        </div>
        <div className={`connection ${status}`}><i />{status === 'live' ? 'WebSocket live' : status === 'polling' ? 'REST live' : status === 'connecting' ? 'Connecting' : 'Offline'}</div>
      </section>

      <section className="market-workspace">
        <div className="chart-panel panel">
          <div className="instrument-bar">
            <div className="instrument">
              <span className="btc-symbol">₿</span>
              <div><b>BTCUSDT</b><small>Bitcoin · Linear perpetual</small></div>
            </div>
            <div className="quote">
              <strong>{latest ? `$${latest.close.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : '—'}</strong>
              <span className={change >= 0 ? 'positive' : 'negative'}>{change >= 0 ? '+' : ''}{change.toFixed(2)}%</span>
            </div>
            <div className="ohlc">
              <span>O <b>{latest?.open.toFixed(1) ?? '—'}</b></span>
              <span>H <b>{latest?.high.toFixed(1) ?? '—'}</b></span>
              <span>L <b>{latest?.low.toFixed(1) ?? '—'}</b></span>
              <span>C <b>{latest?.close.toFixed(1) ?? '—'}</b></span>
            </div>
          </div>
          <div className="interval-bar">
            {intervals.map((item) => <button type="button" className={interval === item.value ? 'active' : ''} key={item.value} onClick={() => selectInterval(item.value)}>{item.label}</button>)}
            <span className="last-update">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Waiting for data'}</span>
          </div>
          <div className="indicator-legend">
            <span><i className="trend-up" />Swing structure</span>
            <span><i className="choch-dot" />CHoCH</span>
            <span><i className="fvg-line" />Fair value gap</span>
            <b className={fifteenMinuteAnalysis.bias === 'long' ? 'positive' : fifteenMinuteAnalysis.bias === 'short' ? 'negative' : ''}>15m bias: {fifteenMinuteAnalysis.bias}</b>
          </div>
          {error && candles.length === 0
            ? <div className="chart-error"><b>Market data unavailable</b><span>{error}. Check the connection and retry.</span><button type="button" className="secondary-button" onClick={() => setReloadKey((key) => key + 1)}>Retry feed</button></div>
            : candles.length ? <CandleChart key={interval} candles={candles} analysis={analysis} tradeSetups={chartSetups} alignedSetupIds={alignedSetupIds} /> : <div className="chart-loading"><i /><span>Loading Bybit candles…</span></div>}
        </div>

        <aside className="trade-rail">
          <article className="panel signal-card">
            <div className="signal-heading"><span className="radar-icon">⌁</span><span className="pill">Strategy pending</span></div>
            <div className="overline">Signal monitor</div>
            <h2>Watching the market</h2>
            <p>Tracking structural CHoCH and fair value gap pullbacks. A 1-minute setup is valid only when aligned with the 15-minute bias.</p>
            <div className="strategy-direction"><span>15m direction</span><b className={fifteenMinuteAnalysis.bias === 'long' ? 'positive' : fifteenMinuteAnalysis.bias === 'short' ? 'negative' : ''}>{fifteenMinuteAnalysis.bias}</b></div>
            <div className="strategy-direction"><span>Aligned 1m FVGs</span><b>{interval === '1' ? alignedSetups.length : 'Select 1m'}</b></div>
          </article>

          <article className="panel market-details">
            <div className="overline">Contract details</div>
            <div><span>Exchange</span><b>Bybit</b></div>
            <div><span>Market</span><b>BTCUSDT</b></div>
            <div><span>Type</span><b>Linear perpetual</b></div>
            <div><span>Data</span><b>Public feed</b></div>
          </article>

          <article className="panel safety-note">
            <span>i</span>
            <p><b>Monitoring only</b>This app does not place orders or connect to your Bybit account.</p>
          </article>
        </aside>
      </section>
    </main>
  )
}
