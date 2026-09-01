import { useState, type FormEvent } from 'react'
import { Logo } from '../components/Logo'
import { login, type AuthUser } from '../services/api'

interface LoginProps {
  onLogin: (user: AuthUser) => void
}

export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const response = await login(username, password)
      onLogin(response.user)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-brand"><Logo /><span>Trading intelligence, privately monitored.</span></div>
      <form className="login-card" onSubmit={submit}>
        <div className="overline">Secure workspace</div>
        <h1>Welcome <span>back.</span></h1>
        <p>Sign in to access your market monitor, performance ledger, and backtesting history.</p>

        <label>Username
          <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
        </label>
        <label>Password
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button className="run-button" type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'} <span>→</span></button>
        <small>Temporary account: admin · password configured in your local .env</small>
      </form>
    </main>
  )
}
