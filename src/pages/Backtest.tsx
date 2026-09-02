import { useMemo, useState } from 'react'
import { CandleChart } from '../components/CandleChart'
import { formatCurrency } from '../lib/currency'
import { runStructureBacktest, type BacktestConfig, type BacktestResult } from '../lib/backtest'
import { alignedOneMinuteSetups, analyzeStructure, oneSetupAtATime } from '../lib/structureStrategy'
import { fetchCandleRange } from '../services/bybit'
import { saveBacktestRun } from '../services/api'
import type { Candle } from '../types'

const HOUR = 60 * 60 * 1_000
const DAY = 24 * HOUR
const MAX_TEST_WINDOW = 7 * DAY
const WARMUP_WINDOW = 12 * HOUR

const datetimeLocal = (timestamp: number) => {
  const date = new Date(timestamp)
  return new Date(timestamp - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

const initialEnd = Math.floor((Date.now() - HOUR) / 60_000) * 60_000

const initialConfig: BacktestConfig = {
  interval: '1',
  candleCount: 0,
  pivotLength: 2,
  stopBufferPercent: 5,
  rewardRisk: 4,
  riskUsd: 100,
}

export function Backtest() {
  const [config, setConfig] = useState(initialConfig)
  const [startAt, setStartAt] = useState(datetimeLocal(initialEnd - DAY))
  const [endAt, setEndAt] = useState(datetimeLocal(initialEnd))
  const [candles, setCandles] = useState<Candle[]>([])
  const [windowStart, setWindowStart] = useState<number | null>(null)
  const [windowEnd, setWindowEnd] = useState<number | null>(null)
  const [fifteenMinuteCandles, setFifteenMinuteCandles] = useState<Candle[]>([])
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const start = new Date(startAt).getTime()
      const end = new Date(endAt).getTime()
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error('Choose a start time earlier than the end time')
      if (end > Date.now()) throw new Error('The backtest end cannot be in the future')
      if (end - start > MAX_TEST_WINDOW) throw new Error('Choose a historical window of 7 days or less')

      const warmupStart = start - WARMUP_WINDOW
      const [historicalCandles, biasCandles] = await Promise.all([
        fetchCandleRange('1', warmupStart, end),
        fetchCandleRange('15', warmupStart, end),
      ])
      const selectedCandles = historicalCandles.filter((item) => item.time * 1000 >= start)
      if (selectedCandles.length === 0) throw new Error('Bybit returned no candles for this historical window')

      const runConfig = { ...config, candleCount: selectedCandles.length }
      const backtestResult = runStructureBacktest(historicalCandles, biasCandles, runConfig, start / 1000, end / 1000)
      await saveBacktestRun(runConfig, backtestResult, selectedCandles)
      setConfig(runConfig)
      setCandles(historicalCandles)
      setFifteenMinuteCandles(biasCandles)
      setWindowStart(start / 1000)
      setWindowEnd(end / 1000)
      setResult(backtestResult)
      setSelectedTradeId(backtestResult.trades.at(-1)?.id ?? null)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The historical candle request failed')
    } finally {
      setLoading(false)
    }
  }

  const chartAnalysis = useMemo(() => analyzeStructure(candles), [candles])
  const biasAnalysis = useMemo(() => analyzeStructure(fifteenMinuteCandles), [fifteenMinuteCandles])
  const chartSetups = useMemo(
    () => oneSetupAtATime(alignedOneMinuteSetups(chartAnalysis, biasAnalysis))
      .filter((setup) => setup.choch.time >= (windowStart ?? Number.NEGATIVE_INFINITY)
        && setup.choch.time <= (windowEnd ?? Number.POSITIVE_INFINITY)),
    [chartAnalysis, biasAnalysis, windowStart, windowEnd],
  )
  const selectedSetup = useMemo(
    () => chartSetups.find((setup) => setup.id === selectedTradeId),
    [chartSetups, selectedTradeId],
  )
  const first = windowStart ? new Date(windowStart * 1000) : null
  const last = windowEnd ? new Date(windowEnd * 1000) : null

  return (
    <main>
      <section className="page-heading market-heading">
        <div>
          <div className="overline">Strategy research</div>
          <h1>Historical <span>backtest.</span></h1>
          <p>Choose a fixed Bitcoin history window so repeated tests use the same market data.</p>
        </div>
        <span className="pill">BTCUSDT · Bybit</span>
      </section>

      <div className="demo-banner"><span>Structure strategy</span> 15m directional bias · 1m CHoCH · dominant three-candle FVG midpoint entry · 5% candle-range stop buffer · 4R target.</div>

      <section className="backtest-layout">
        <aside className="panel backtest-controls">
          <div className="overline">Test parameters</div>
          <h2>Configure the run</h2>

          <div className="fixed-parameter"><span>Direction timeframe</span><b>15 minutes</b></div>
          <div className="fixed-parameter"><span>Execution timeframe</span><b>1 minute</b></div>
          <label>Historical start
            <input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
          </label>
          <label>Historical end
            <input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} />
          </label>
          <label>Risk per trade (USD)
            <input type="number" min="1" step="10" value={config.riskUsd} onChange={(event) => setConfig({ ...config, riskUsd: Math.max(1, Number(event.target.value)) })} />
          </label>
          <label>Reward target
            <select value={config.rewardRisk} onChange={(event) => setConfig({ ...config, rewardRisk: Number(event.target.value) })}>
              <option value={4}>4R</option>
            </select>
          </label>

          <button className="run-button" type="button" onClick={run} disabled={loading}>
            {loading ? 'Loading historical candles…' : 'Run historical backtest'} <span>↗</span>
          </button>
          <p className="control-note">Choose up to 7 days. A 12-hour warm-up establishes structure before the selected start. Results exclude fees, funding, slippage, and spread.</p>
        </aside>

        <div className="backtest-results">
          {error && <div className="panel backtest-empty error"><b>Backtest data unavailable</b><span>{error}</span><button type="button" className="secondary-button" onClick={run}>Try again</button></div>}
          {!error && !result && <div className="panel backtest-empty"><div className="empty-orbit">R</div><b>No period selected yet</b><span>Choose an older start and end time, then run the test against that exact historical window.</span></div>}
          {!error && result && (
            <>
              <section className="backtest-metrics">
                <article className="panel"><span>Net profit</span><strong className={result.netProfitUsd >= 0 ? 'positive' : 'negative'}>{formatCurrency(result.netProfitUsd, 'USD')}</strong><small>{result.netR >= 0 ? '+' : ''}{result.netR.toFixed(2)}R</small></article>
                <article className="panel"><span>Win rate</span><strong>{result.winRate.toFixed(1)}%</strong><small>{result.wins}W · {result.losses}L · {result.cancellations}C</small></article>
                <article className="panel"><span>Total trades</span><strong>{result.trades.length}</strong><small>{config.candleCount.toLocaleString()} candles</small></article>
                <article className="panel"><span>Max drawdown</span><strong className="negative">−{result.maxDrawdownR.toFixed(2)}R</strong><small>Peak to trough</small></article>
              </section>

              <section className="panel backtest-chart">
                <div className="panel-heading">
                  <div><div className="overline">Selected timeline</div><h2>Historical BTCUSDT</h2></div>
                  <span className="muted">{first && last ? `${first.toLocaleString()} — ${last.toLocaleString()}` : ''}</span>
                </div>
                {selectedSetup && <div className="selected-trade-levels">
                  <span>Entry <b>{selectedSetup.midpoint.toFixed(1)}</b></span>
                  <span>Stop <b>{selectedSetup.stopPrice.toFixed(1)}</b></span>
                  <span>Target <b>{selectedSetup.targetPrice.toFixed(1)}</b></span>
                </div>}
                <CandleChart
                  key={selectedTradeId ?? 'backtest'}
                  candles={candles}
                  analysis={chartAnalysis}
                  tradeSetups={selectedSetup ? [selectedSetup] : []}
                  showResolvedSetups
                  focusTime={selectedSetup?.entryTime ?? selectedSetup?.choch.time}
                />
              </section>

              <section className="panel trade-table-panel backtest-trades">
                <div className="panel-heading"><div><div className="overline">Simulation journal</div><h2>Backtest trades</h2></div><span className="muted">Select a trade to inspect its chart levels</span></div>
                {result.trades.length === 0
                  ? <div className="no-trades">No completed aligned structure setups occurred in this window.</div>
                  : <div className="trade-table">
                    <div className="trade-row backtest-row trade-header"><span>Side</span><span>Entry</span><span>Exit</span><span>Reason</span><span>Result</span></div>
                    {[...result.trades].reverse().map((trade) => (
                      <div
                        className={`trade-row backtest-row selectable-trade ${selectedTradeId === trade.id ? 'selected' : ''}`}
                        key={trade.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedTradeId(trade.id)}
                        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedTradeId(trade.id) }}
                      >
                        <span className={trade.side}>{trade.side}</span>
                        <span>{new Date(trade.entryTime * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        <span>{new Date(trade.exitTime * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        <span>{trade.exitReason}</span>
                        <span className={trade.rMultiple >= 0 ? 'positive' : 'negative'}>{trade.rMultiple >= 0 ? '+' : ''}{trade.rMultiple.toFixed(2)}R</span>
                      </div>
                    ))}
                  </div>}
              </section>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
