import { useMemo, useState } from 'react'
import { CandleChart } from '../components/CandleChart'
import { formatCurrency } from '../lib/currency'
import { randomHistoricalEnd, runStructureBacktest, type BacktestConfig, type BacktestResult } from '../lib/backtest'
import { analyzeStructure, oneSetupAtATime } from '../lib/structureStrategy'
import { fetchCandleRange } from '../services/bybit'
import { saveBacktestRun } from '../services/api'
import type { Candle } from '../types'

const MINUTE = 60 * 1_000
const HOUR = 60 * MINUTE
const WARMUP_WINDOW = 12 * HOUR

const initialConfig: BacktestConfig = {
  interval: '1',
  candleCount: 1000,
  pivotLength: 2,
  stopBufferPercent: 8,
  rewardRisk: 4,
  riskUsd: 100,
}

export function Backtest() {
  const [config, setConfig] = useState(initialConfig)
  const [candles, setCandles] = useState<Candle[]>([])
  const [higherTimeframeCandles, setHigherTimeframeCandles] = useState<Candle[]>([])
  const [windowStart, setWindowStart] = useState<number | null>(null)
  const [windowEnd, setWindowEnd] = useState<number | null>(null)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const end = randomHistoricalEnd()
      const start = end - (config.candleCount - 1) * MINUTE
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
      setHigherTimeframeCandles(biasCandles)
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
  const higherTimeframeAnalysis = useMemo(() => analyzeStructure(higherTimeframeCandles), [higherTimeframeCandles])
  const chartSetups = useMemo(
    () => oneSetupAtATime(chartAnalysis.fairValueGaps)
      .filter((setup) => setup.choch.time >= (windowStart ?? Number.NEGATIVE_INFINITY)
        && setup.choch.time <= (windowEnd ?? Number.POSITIVE_INFINITY)),
    [chartAnalysis, windowStart, windowEnd],
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
          <h1>Random-window <span>backtest.</span></h1>
          <p>Test the strategy against a randomly selected period of Bitcoin history.</p>
        </div>
        <span className="pill">BTCUSDT · Bybit</span>
      </section>

      <div className="demo-banner"><span>Structure strategy v8</span> 15m directional context · 1m BOS trend continuation or CHoCH reversal · wick-defined FVG midpoint entry · 8% candle-range stop buffer · 4R target.</div>

      <section className="backtest-layout">
        <aside className="panel backtest-controls">
          <div className="overline">Test parameters</div>
          <h2>Configure the run</h2>

          <div className="fixed-parameter"><span>Direction timeframe</span><b>15 minutes</b></div>
          <div className="fixed-parameter"><span>Execution timeframe</span><b>1 minute</b></div>
          <label>Random sample size
            <select value={config.candleCount} onChange={(event) => setConfig({ ...config, candleCount: Number(event.target.value) })}>
              <option value={500}>500 candles</option>
              <option value={800}>800 candles</option>
              <option value={1000}>1,000 candles</option>
            </select>
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
            {loading ? 'Selecting random history…' : 'Run random backtest'} <span>↗</span>
          </button>
          <p className="control-note">Each run randomly selects an endpoint from two days to two years ago. A 12-hour warm-up establishes prior structure. Results exclude fees, funding, slippage, and spread.</p>
        </aside>

        <div className="backtest-results">
          {error && <div className="panel backtest-empty error"><b>Backtest data unavailable</b><span>{error}</span><button type="button" className="secondary-button" onClick={run}>Try again</button></div>}
          {!error && !result && <div className="panel backtest-empty"><div className="empty-orbit">R</div><b>No random sample yet</b><span>Run the backtest to draw a past candle window and calculate the strategy outcome.</span></div>}
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
                  <div><div className="overline">Random sample</div><h2>Historical BTCUSDT</h2></div>
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
                  higherTimeframeAnalysis={higherTimeframeAnalysis}
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
                        <span className={trade.side}>{trade.side}<small>{trade.setupType === 'trend-continuation' ? 'BOS trend' : 'CHoCH'}</small></span>
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
