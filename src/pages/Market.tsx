import { useEffect, useMemo, useState } from 'react'
import { CandleChart } from '../components/CandleChart'
import { fetchCandles, subscribeToCandles } from '../services/bybit'
import type { Candle, CandleInterval } from '../types'

const intervals: Array<{ value: CandleInterval; label: string }> = [
  { value: '1', label: '1m' }, { value: '3', label: '3m' }, { value: '5', label: '5m' },
  { value: '15', label: '15m' }, { value: '30', label: '30m' }, { value: '60', label: '1H' },
  { value: '240', label: '4H' }, { value: 'D', label: '1D' },
]

type ConnectionStatus = 'connecting' | 'live' | 'offline'

export function Market() {
  const [interval, setInterval] = useState<CandleInterval>('15')
  const [candles, setCandles] = useState<Candle[]>([])
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setCandles([])
    setError(null)
    setStatus('connecting')

    fetchCandles(interval, controller.signal)
      .then(setCandles)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setError(cause instanceof Error ? cause.message : 'Could not load Bybit candles')
      })

    const unsubscribe = subscribeToCandles(interval, (incoming) => {
      setCandles((current) => {
        const last = current.at(-1)
        if (!last || incoming.time > last.time) return [...current, incoming].slice(-300)
        if (incoming.time === last.time) return [...current.slice(0, -1), incoming]
        return current
      })
    }, setStatus)

    return () => {
      controller.abort()
      unsubscribe()
    }
  }, [interval])

  const latest = candles.at(-1)
  const previous = candles.at(-2)
  const change = useMemo(() => latest && previous ? ((latest.close - previous.close) / previous.close) * 100 : 0, [latest, previous])

  return (
    <main>
      <section className="page-heading market-heading">
        <div>
          <div className="overline">Live market</div>
          <h1>Bitcoin <span>Perpetual.</span></h1>
          <p>Real-time public market data from Bybit. No trading account is connected.</p>
        </div>
        <div className={`connection ${status}`}><i />{status === 'live' ? 'Live feed' : status === 'connecting' ? 'Connecting' : 'Offline'}</div>
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
          </div>
          {error ? <div className="chart-error"><b>Market data unavailable</b><span>{error}. Check the connection and retry.</span></div> : candles.length ? <CandleChart candles={candles} /> : <div className="chart-loading"><i /><span>Loading Bybit candles…</span></div>}
        </div>

        <aside className="trade-rail">
          <article className="panel signal-card">
            <div className="signal-heading"><span className="radar-icon">⌁</span><span className="pill">Strategy pending</span></div>
            <div className="overline">Signal monitor</div>
            <h2>Watching the market</h2>
            <p>Your notification parameters have not been configured yet. Once supplied, qualifying setups will appear here and be tracked candle by candle.</p>
            <div className="signal-placeholder"><i /><span>Awaiting strategy rules</span></div>
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
