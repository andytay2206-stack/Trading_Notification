import { useEffect, useState } from 'react'
import { Logo } from './components/Logo'
import { demoTrades } from './data/demoTrades'
import { Dashboard } from './pages/Dashboard'
import { Market } from './pages/Market'
import { Backtest } from './pages/Backtest'
import type { Currency } from './types'

type Page = 'dashboard' | 'market' | 'backtest'

const pageFromHash = (): Page => {
  if (window.location.hash === '#market') return 'market'
  if (window.location.hash === '#backtest') return 'backtest'
  return 'dashboard'
}

const navigation: Array<{ page: Page; label: string; icon: string }> = [
  { page: 'dashboard', label: 'Overview', icon: '⌂' },
  { page: 'market', label: 'Live market', icon: '⌁' },
  { page: 'backtest', label: 'Backtesting', icon: '↗' },
]

export default function App() {
  const [page, setPage] = useState<Page>(pageFromHash)
  const [currency, setCurrency] = useState<Currency>('USD')

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = (next: Page) => {
    window.location.hash = next === 'dashboard' ? '' : next
    setPage(next)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><Logo /></div>
        <nav aria-label="Main navigation">
          <div className="nav-label">Workspace</div>
          {navigation.map((item) => (
            <button type="button" key={item.page} className={page === item.page ? 'active' : ''} onClick={() => navigate(item.page)}>
              <span className="nav-icon">{item.icon}</span><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-status"><i /><span><b>Monitor ready</b><small>BTCUSDT · Bybit</small></span></div>
      </aside>

      <div className="content-shell">
        {page === 'dashboard' && <Dashboard currency={currency} onCurrencyChange={setCurrency} trades={demoTrades} onOpenMarket={() => navigate('market')} />}
        {page === 'market' && <Market />}
        {page === 'backtest' && <Backtest />}

        <footer><span>Northstar · Futures intelligence</span><small>All times shown locally · Notification-only</small></footer>
      </div>
    </div>
  )
}
