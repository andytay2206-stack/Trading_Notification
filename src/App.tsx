import { useEffect, useState } from 'react'
import { Logo } from './components/Logo'
import { demoTrades } from './data/demoTrades'
import { Dashboard } from './pages/Dashboard'
import { Market } from './pages/Market'
import type { Currency } from './types'

type Page = 'dashboard' | 'market'

const pageFromHash = (): Page => window.location.hash === '#market' ? 'market' : 'dashboard'

export default function App() {
  const [page, setPage] = useState<Page>(pageFromHash)
  const [currency, setCurrency] = useState<Currency>('USD')

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = (next: Page) => {
    window.location.hash = next === 'market' ? 'market' : ''
    setPage(next)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Logo />
        <nav aria-label="Main navigation">
          <button type="button" className={page === 'dashboard' ? 'active' : ''} onClick={() => navigate('dashboard')}>Overview</button>
          <button type="button" className={page === 'market' ? 'active' : ''} onClick={() => navigate('market')}>Live market</button>
        </nav>
        <div className="header-status"><i />Monitor ready</div>
      </header>

      {page === 'dashboard'
        ? <Dashboard currency={currency} onCurrencyChange={setCurrency} trades={demoTrades} onOpenMarket={() => navigate('market')} />
        : <Market />}

      <footer><Logo /><span>Futures intelligence · Built for disciplined execution</span><small>All times shown locally · Notification-only</small></footer>
    </div>
  )
}
