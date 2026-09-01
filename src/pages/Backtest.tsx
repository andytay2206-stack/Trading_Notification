import { useState } from 'react'
import { CandleChart } from '../components/CandleChart'
import { formatCurrency } from '../lib/currency'
import { randomHistoricalEnd, runEmaBacktest, type BacktestConfig, type BacktestResult } from '../lib/backtest'
import { fetchCandles } from '../services/bybit'
import { saveBacktestRun } from '../services/api'
import type { Candle, CandleInterval } from '../types'

const intervalOptions: Array<{ value: CandleInterval; label: string }> = [
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '240', label: '4 hours' },
]

const initialConfig: BacktestConfig = {
  interval: '15',
  candleCount: 500,
  fastEma: 9,
  slowEma: 21,
  atrPeriod: 14,
  rewardRisk: 2,
  riskUsd: 100,
}

export function Backtest() {
  const [config, setConfig] = useState(initialConfig)
  const [candles, setCandles] = useState<Candle[]>([])
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const historicalCandles = await fetchCandles(config.interval, undefined, {
        limit: config.candleCount,
        end: randomHistoricalEnd(),
      })
      const backtestResult = runEmaBacktest(historicalCandles, config)
      await saveBacktestRun(config, backtestResult, historicalCandles)
      setCandles(historicalCandles)
      setResult(backtestResult)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The historical candle request failed')
    } finally {
      setLoading(false)
    }
  }

  const first = candles.at(0)
  const last = candles.at(-1)

  return (
    <main>
      <section className="page-heading market-heading">
        <div>
          <div className="overline">Strategy research</div>
          <h1>Random-window <span>backtest.</span></h1>
          <p>Sample a hidden period of Bitcoin history and measure the strategy without choosing a favorable date.</p>
        </div>
        <span className="pill">BTCUSDT · Bybit</span>
      </section>

      <div className="demo-banner"><span>Demo strategy</span> EMA 9/21 crossover with a 1 ATR stop and 2R target. This will be replaced by your exact rules.</div>

      <section className="backtest-layout">
        <aside className="panel backtest-controls">
          <div className="overline">Test parameters</div>
          <h2>Configure the run</h2>

          <label>Chart timeframe
            <select value={config.interval} onChange={(event) => setConfig({ ...config, interval: event.target.value as CandleInterval })}>
              {intervalOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>Test duration
            <select value={config.candleCount} onChange={(event) => setConfig({ ...config, candleCount: Number(event.target.value) })}>
              <option value={300}>300 candles</option>
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
              <option value={1}>1R</option>
              <option value={1.5}>1.5R</option>
              <option value={2}>2R</option>
              <option value={3}>3R</option>
            </select>
          </label>

          <button className="run-button" type="button" onClick={run} disabled={loading}>
            {loading ? 'Selecting random history…' : 'Run random backtest'} <span>↗</span>
          </button>
          <p className="control-note">Each run chooses a random endpoint between 2 days and 2 years ago. Results exclude fees, funding, slippage, and spread.</p>
        </aside>

        <div className="backtest-results">
          {error && <div className="panel backtest-empty error"><b>Backtest data unavailable</b><span>{error}</span><button type="button" className="secondary-button" onClick={run}>Try another period</button></div>}
          {!error && !result && <div className="panel backtest-empty"><div className="empty-orbit">R</div><b>No period selected yet</b><span>Run the test to draw a random historical window and calculate its outcome.</span></div>}
          {!error && result && (
            <>
              <section className="backtest-metrics">
                <article className="panel"><span>Net profit</span><strong className={result.netProfitUsd >= 0 ? 'positive' : 'negative'}>{formatCurrency(result.netProfitUsd, 'USD')}</strong><small>{result.netR >= 0 ? '+' : ''}{result.netR.toFixed(2)}R</small></article>
                <article className="panel"><span>Win rate</span><strong>{result.winRate.toFixed(1)}%</strong><small>{result.wins}W · {result.losses}L</small></article>
                <article className="panel"><span>Total trades</span><strong>{result.trades.length}</strong><small>{config.candleCount} candles</small></article>
                <article className="panel"><span>Max drawdown</span><strong className="negative">−{result.maxDrawdownR.toFixed(2)}R</strong><small>Peak to trough</small></article>
              </section>

              <section className="panel backtest-chart">
                <div className="panel-heading">
                  <div><div className="overline">Random sample</div><h2>Historical BTCUSDT</h2></div>
                  <span className="muted">{first && last ? `${new Date(first.time * 1000).toLocaleDateString()} — ${new Date(last.time * 1000).toLocaleDateString()}` : ''}</span>
                </div>
                <CandleChart candles={candles} />
              </section>

              <section className="panel trade-table-panel backtest-trades">
                <div className="panel-heading"><div><div className="overline">Simulation journal</div><h2>Backtest trades</h2></div><span className="muted">Most recent first</span></div>
                {result.trades.length === 0
                  ? <div className="no-trades">No EMA crossovers occurred in this window. Run another sample.</div>
                  : <div className="trade-table">
                    <div className="trade-row backtest-row trade-header"><span>Side</span><span>Entry</span><span>Exit</span><span>Reason</span><span>Result</span></div>
                    {[...result.trades].reverse().slice(0, 12).map((trade) => (
                      <div className="trade-row backtest-row" key={trade.id}>
                        <span className={trade.side}>{trade.side}</span>
                        <span>{new Date(trade.entryTime * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        <span>{new Date(trade.exitTime * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        <span>{trade.exitReason.replace('-', ' ')}</span>
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
