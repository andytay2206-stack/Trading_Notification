import { useCallback, useEffect, useState } from 'react'
import { CurrencySwitch } from '../components/CurrencySwitch'
import { MetricCard } from '../components/MetricCard'
import { formatCurrency } from '../lib/currency'
import { summarizePerformance } from '../lib/performance'
import type { Currency, Trade } from '../types'
import { decideStrategyNotification, getPortfolioTrades, getStrategyNotifications, scanStrategy, type StrategyNotification } from '../services/api'

interface DashboardProps {
  currency: Currency
  onCurrencyChange: (currency: Currency) => void
  onOpenMarket: () => void
}

const signedR = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}R`
const needsDecision = (notification: StrategyNotification) => notification.outcome === 'win'
  || notification.outcome === 'loss'
  || (notification.outcome === 'cancelled' && notification.entry_time !== null)
const CURRENT_STRATEGY_VERSION = 'structure-v7'
const isPrediction = (notification: StrategyNotification) => notification.strategy_version === CURRENT_STRATEGY_VERSION
  && (notification.outcome === 'waiting' || notification.outcome === 'active')
const isFinished = (notification: StrategyNotification) => ['win', 'loss', 'missed', 'cancelled'].includes(notification.outcome)

export function Dashboard({ currency, onCurrencyChange, onOpenMarket }: DashboardProps) {
  const [trades, setTrades] = useState<Trade[]>([])
  const [notifications, setNotifications] = useState<StrategyNotification[]>([])
  const [loadingSignals, setLoadingSignals] = useState(true)
  const [signalError, setSignalError] = useState<string | null>(null)
  const [decidingId, setDecidingId] = useState<string | null>(null)

  const refresh = useCallback(async (runScan = false) => {
    try {
      if (runScan) await scanStrategy()
      const [notificationResponse, portfolioTrades] = await Promise.all([getStrategyNotifications(), getPortfolioTrades()])
      setNotifications(notificationResponse.notifications)
      setTrades(portfolioTrades)
      setSignalError(null)
    } catch (cause: unknown) {
      setSignalError(cause instanceof Error ? cause.message : 'Could not refresh strategy notifications')
    } finally {
      setLoadingSignals(false)
    }
  }, [])

  useEffect(() => {
    void refresh(true)
    const timer = window.setInterval(() => void refresh(true), 60_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const decide = async (notification: StrategyNotification, decision: 'accepted' | 'dismissed') => {
    setDecidingId(notification.id)
    try {
      await decideStrategyNotification(notification.id, decision)
      await refresh(false)
    } catch (cause: unknown) {
      setSignalError(cause instanceof Error ? cause.message : 'Could not save your decision')
    } finally {
      setDecidingId(null)
    }
  }

  const performance = summarizePerformance(trades)
  const recentTrades = [...trades].sort((a, b) => (b.closedAt ?? b.openedAt).localeCompare(a.closedAt ?? a.openedAt)).slice(0, 5)
  const predictions = notifications.filter(isPrediction)
  const historyNotifications = notifications.filter(isFinished)
  const strategyFinished = notifications.filter((item) => item.strategy_version === CURRENT_STRATEGY_VERSION
    && (item.outcome === 'win' || item.outcome === 'loss'))
  const strategyWins = strategyFinished.filter((item) => item.outcome === 'win').length
  const strategyLosses = strategyFinished.length - strategyWins
  const strategyWinRate = strategyFinished.length ? (strategyWins / strategyFinished.length) * 100 : 0

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

      <section className="noticeboard panel">
        <div className="panel-heading">
          <div><div className="overline">Trade notification board</div><h2>Pullback predictions</h2></div>
          <button type="button" className="secondary-button" onClick={() => void refresh(true)} disabled={loadingSignals}>Scan now</button>
        </div>
        {signalError && <div className="notice-error">{signalError}</div>}
        {loadingSignals && <div className="notice-empty">Scanning 15m direction and 1m structure…</div>}
        {!loadingSignals && predictions.length === 0 && (
          <div className="notice-empty">No active pullback prediction. The scanner is waiting for the next one-slot setup.</div>
        )}
        <div className="notification-list">
          {predictions.slice(0, 5).map((notification) => (
              <article className="notification-card" key={notification.id}>
                <div className={`notification-side ${notification.direction}`}>{notification.direction}</div>
                <div className="notification-main">
                  <b>BTCUSDT · {notification.outcome === 'active' ? 'Entry filled' : 'Waiting for pullback'}</b>
                  <span>{new Date(notification.detected_at).toLocaleString()} · 15m {notification.higher_timeframe_bias}</span>
                </div>
                <div className="notification-level"><small>Entry</small><b>{Number(notification.entry_price).toFixed(1)}</b></div>
                <div className="notification-level"><small>Stop loss</small><b className="negative">{Number(notification.stop_price).toFixed(1)}</b></div>
                <div className="notification-level"><small>Take profit</small><b className="positive">{Number(notification.target_price).toFixed(1)}</b></div>
              </article>
          ))}
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard eyebrow="Net profit" value={formatCurrency(performance.totalPnlUsd, currency)} detail={`${signedR(performance.totalR)} all time`} tone={performance.totalPnlUsd >= 0 ? 'positive' : 'negative'} featured />
        <MetricCard eyebrow="Strategy win rate" value={`${strategyWinRate.toFixed(1)}%`} detail={`${strategyWins} wins · ${strategyLosses} losses · automatic`} />
        <MetricCard eyebrow="Overall win rate" value={`${performance.overallWinRate.toFixed(1)}%`} detail={`${performance.wins} wins · ${performance.losses} losses · ${performance.cancellations} cancelled`} />
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

      <section className="panel signal-history">
        <div className="panel-heading"><div><div className="overline">Finished trade history</div><h2>Accepted, skipped, finished, and cancelled</h2></div><span className="muted">Strategy result is automatic · decisions only affect portfolio</span></div>
        {historyNotifications.length === 0
          ? <div className="notice-empty">Finished strategy setups will appear here automatically.</div>
          : <div className="trade-table">
            <div className="trade-row signal-row trade-header"><span>Setup</span><span>Direction</span><span>Outcome</span><span>Status</span><span>Result</span></div>
            {historyNotifications.slice(0, 20).map((item) => {
              const status = item.outcome === 'cancelled' ? 'cancelled'
                : item.outcome === 'missed' ? 'skipped'
                  : item.decision === 'accepted' ? 'accepted'
                    : item.decision === 'dismissed' ? 'skipped' : 'finished'
              return (
                <div className="trade-row signal-row" key={item.id}>
                  <span><b>BTCUSDT</b><small>{new Date(item.detected_at).toLocaleString()}</small></span>
                  <span className={item.direction}>{item.direction}</span>
                  <span>{item.outcome}</span>
                  <span className={status === 'accepted' ? 'positive' : status === 'cancelled' ? 'warning' : 'muted'}>
                    {status}
                    {!item.decision && needsDecision(item) && <span className="history-decision-actions">
                      <button type="button" className="accept" disabled={decidingId === item.id} onClick={() => void decide(item, 'accepted')} title="I took this trade">✓</button>
                      <button type="button" className="dismiss" disabled={decidingId === item.id} onClick={() => void decide(item, 'dismissed')} title="I skipped this trade">×</button>
                    </span>}
                  </span>
                  <span className={Number(item.r_result) > 0 ? 'positive' : Number(item.r_result) < 0 ? 'negative' : 'muted'}>{Number(item.r_result) > 0 ? '+' : ''}{Number(item.r_result).toFixed(2)}R</span>
                </div>
              )
            })}
          </div>}
      </section>
    </main>
  )
}
