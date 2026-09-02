import { useEffect, useMemo, useState } from 'react'
import { CandleChart } from '../components/CandleChart'
import { fetchCandles, subscribeToCandles } from '../services/bybit'
import { alignedOneMinuteSetups, analyzeStructure } from '../lib/structureStrategy'
import type { Candle, CandleInterval } from '../types'

const intervals: Array<{ value: CandleInterval; label: string }> = [
  { value: '1', label: '1m' }, { value: '3', label: '3m' }, { value: '5', label: '5m' },
  { value: '15', label: '15m' }, { value: '30', label: '30m' }, { value: '60', label: '1H' },
  { value: '240', label: '4H' }, { value: 'D', label: '1D' },
]

type ConnectionStatus = 'connecting' | 'live' | 'polling' | 'offline'

const mergeCandles = (current: Candle[], incoming: Candle[]) => {
  const merged = new Map(current.map((candle) => [candle.time, candle]))
  incoming.forEach((candle) => merged.set(candle.time, candle))
  return [...merged.values()].sort((a, b) => a.time - b.time).slice(-300)
}

export function Market() {
  const [interval, setInterval] = useState<CandleInterval>('15')
  const [candles, setCandles] = useState<Candle[]>([])
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [fifteenMinuteCandles, setFifteenMinuteCandles] = useState<Candle[]>([])

  useEffect(() => {
    const controller = new AbortController()
    setCandles([])
    setError(null)
    setStatus('connecting')

    const refresh = (initial = false) => fetchCandles(interval, controller.signal, { limit: initial ? 300 : 3 })
      .then((incoming) => {
        setCandles((current) => initial ? incoming : mergeCandles(current, incoming))
        setError(null)
        setLastUpdated(new Date())
        setStatus((current) => current === 'live' ? 'live' : 'polling')
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : 'Could not load Bybit candles')
        setStatus('offline')
      })

    void refresh(true)
    const pollTimer = window.setInterval(() => void refresh(), 10_000)

    const unsubscribe = subscribeToCandles(interval, (incoming) => {
      setCandles((current) => {
        const last = current.at(-1)
        if (!last || incoming.time > last.time) return [...current, incoming].slice(-300)
        if (incoming.time === last.time) return [...current.slice(0, -1), incoming]
        return current
      })
      setLastUpdated(new Date())
    }, (socketStatus) => {
      if (socketStatus === 'live') setStatus('live')
      if (socketStatus === 'connecting') setStatus('connecting')
    })

    return () => {
      controller.abort()
      window.clearInterval(pollTimer)
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

  const latest = candles.at(-1)
  const previous = candles.at(-2)
  const change = useMemo(() => latest && previous ? ((latest.close - previous.close) / previous.close) * 100 : 0, [latest, previous])
  const analysis = useMemo(() => analyzeStructure(candles.filter((candle) => candle.confirmed)), [candles])
  const fifteenMinuteAnalysis = useMemo(() => analyzeStructure(fifteenMinuteCandles.filter((candle) => candle.confirmed)), [fifteenMinuteCandles])
  const alignedSetups = useMemo(() => interval === '1' ? alignedOneMinuteSetups(analysis, fifteenMinuteAnalysis) : [], [analysis, fifteenMinuteAnalysis, interval])
  const chartSetups = useMemo(
    () => interval === '1' ? analysis.fairValueGaps.filter((setup) => setup.status === 'open' || setup.status === 'filled').slice(-1) : [],
    [analysis, interval],
  )
  const chartSetupQualification = chartSetups[0] && alignedSetups.some((setup) => setup.id === chartSetups[0].id)
    ? 'aligned' as const
    : 'candidate' as const

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
            {intervals.map((item) => <button type="button" className={interval === item.value ? 'active' : ''} key={item.value} onClick={() => setInterval(item.value)}>{item.label}</button>)}
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
            : candles.length ? <CandleChart candles={candles} analysis={analysis} tradeSetups={chartSetups} setupQualification={chartSetupQualification} /> : <div className="chart-loading"><i /><span>Loading Bybit candles…</span></div>}
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
