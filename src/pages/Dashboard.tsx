import { CurrencySwitch } from '../components/CurrencySwitch'
import { MetricCard } from '../components/MetricCard'
import { formatCurrency } from '../lib/currency'
import { summarizePerformance } from '../lib/performance'
import type { Currency, Trade } from '../types'

interface DashboardProps {
  currency: Currency
  onCurrencyChange: (currency: Currency) => void
  trades: Trade[]
  onOpenMarket: () => void
}

const signedR = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}R`

export function Dashboard({ currency, onCurrencyChange, trades, onOpenMarket }: DashboardProps) {
  const performance = summarizePerformance(trades)
  const recentTrades = [...trades].sort((a, b) => (b.closedAt ?? b.openedAt).localeCompare(a.closedAt ?? a.openedAt)).slice(0, 5)

  return (
    <main>
      <section className="page-heading dashboard-heading">
        <div>
          <div className="overline">Performance overview</div>
          <h1>Your trading, <span>at a glance.</span></h1>
          <p>Profitability, discipline, and risk—all measured in one place.</p>
        </div>
        <CurrencySwitch value={currency} onChange={onCurrencyChange} />
      </section>

      <div className="demo-banner"><span>Demo ledger</span> These figures are sample trades and will be replaced by tracked strategy signals.</div>

      <section className="metric-grid">
        <MetricCard eyebrow="Net profit" value={formatCurrency(performance.totalPnlUsd, currency)} detail={`${signedR(performance.totalR)} all time`} tone={performance.totalPnlUsd >= 0 ? 'positive' : 'negative'} featured />
        <MetricCard eyebrow="Overall win rate" value={`${performance.overallWinRate.toFixed(1)}%`} detail={`${performance.wins} wins · ${performance.losses} losses`} />
        <MetricCard eyebrow="Today's win rate" value={`${performance.todayWinRate.toFixed(1)}%`} detail={`${performance.todayTrades} closed today`} />
        <MetricCard eyebrow="Today's result" value={signedR(performance.todayR)} detail="Risk-adjusted return" tone={performance.todayR >= 0 ? 'positive' : 'negative'} />
      </section>

      <section className="dashboard-grid">
        <article className="panel performance-panel">
          <div className="panel-heading">
            <div>
              <div className="overline">Risk performance</div>
              <h2>R-multiple overview</h2>
            </div>
            <span className="pill">{performance.closedTrades} trades</span>
          </div>
          <div className="r-visual">
            <div className="r-orbit"><span>{signedR(performance.totalR)}</span><small>NET R</small></div>
            <div className="r-copy">
              <strong>Every result is normalized by initial risk.</strong>
              <p>A +2R trade earns twice the amount risked. A −1R trade loses the planned risk amount.</p>
              <div className="r-scale"><span>−1R</span><i /><span>0R</span><i /><span>+2R</span></div>
            </div>
          </div>
        </article>

        <article className="panel market-card">
          <div className="market-icon">₿</div>
          <div className="overline">Tracked market</div>
          <h2>Bitcoin Perpetual</h2>
          <p>BTCUSDT · Bybit Linear</p>
          <button className="primary-button" type="button" onClick={onOpenMarket}>Open live market <span>→</span></button>
        </article>
      </section>

      <section className="panel trade-table-panel">
        <div className="panel-heading">
          <div><div className="overline">Journal</div><h2>Recent outcomes</h2></div>
          <span className="muted">Local time</span>
        </div>
        <div className="trade-table">
          <div className="trade-row trade-header"><span>Market</span><span>Side</span><span>Closed</span><span>Result</span><span>P&amp;L</span></div>
          {recentTrades.map((trade) => (
            <div className="trade-row" key={trade.id}>
              <span><b>BTC</b><small>USDT Perpetual</small></span>
              <span className={trade.side}>{trade.side}</span>
              <span>{new Date(trade.closedAt ?? trade.openedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              <span className={trade.rMultiple >= 0 ? 'positive' : 'negative'}>{signedR(trade.rMultiple)}</span>
              <span>{formatCurrency(trade.pnlUsd, currency)}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
