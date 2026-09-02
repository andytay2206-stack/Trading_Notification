import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import express from 'express'
import helmet from 'helmet'
import { createSession, requireAuth, SESSION_COOKIE } from './auth.js'
import { describeBybitError, restClient, subscribeToKline } from './bybit.js'
import { config } from './config.js'
import { closeDatabase, initializeDatabase, pool } from './db.js'
import { decideNotification, getStrategyRuntime, scanStrategy } from './strategy.js'
import { startStrategyWorker } from './worker.js'

const app = express()
const allowedIntervals = new Set(['1', '3', '5', '15', '30', '60', '120', '240', '360', '720', 'D', 'W', 'M'])

app.use(helmet({ contentSecurityPolicy: false }))
app.use(express.json({ limit: '100kb' }))
app.use(cookieParser())

app.get('/api/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1')
    response.json({ status: 'ok', database: 'connected' })
  } catch {
    response.status(503).json({ status: 'degraded', database: 'unavailable' })
  }
})

app.post('/api/auth/login', async (request, response) => {
  const username = String(request.body?.username ?? '').trim()
  const password = String(request.body?.password ?? '')
  if (!username || !password) return response.status(400).json({ error: 'Username and password are required' })

  const result = await pool.query<{ id: string; username: string; password_hash: string }>(
    'SELECT id, username, password_hash FROM app_users WHERE username = $1',
    [username],
  )
  const user = result.rows[0]
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return response.status(401).json({ error: 'Invalid username or password' })
  }

  const sessionUser = { id: user.id, username: user.username }
  response.cookie(SESSION_COOKIE, createSession(sessionUser), {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.production,
    maxAge: 12 * 60 * 60 * 1_000,
    path: '/',
  })
  return response.json({ user: sessionUser })
})

app.get('/api/auth/session', requireAuth, (request, response) => {
  response.json({ user: request.user })
})

app.post('/api/auth/logout', (_request, response) => {
  response.clearCookie(SESSION_COOKIE, { path: '/' })
  response.status(204).end()
})

app.use('/api', requireAuth)

app.get('/api/market/candles', async (request, response) => {
  const interval = String(request.query.interval ?? '15')
  const limit = Math.min(1000, Math.max(1, Number(request.query.limit ?? 300)))
  const end = request.query.end ? Number(request.query.end) : undefined
  if (!allowedIntervals.has(interval)) return response.status(400).json({ error: 'Unsupported candle interval' })

  try {
    const payload = await restClient.getKline({
      category: 'linear',
      symbol: 'BTCUSDT',
      interval: interval as '1',
      limit,
      ...(end ? { end } : {}),
    })
    if (payload.retCode !== 0) return response.status(502).json({ error: payload.retMsg || 'Bybit rejected the request' })
    return response.json(payload)
  } catch (cause) {
    console.error('[bybit rest]', describeBybitError(cause))
    return response.status(502).json({ error: 'Unable to reach Bybit through the server' })
  }
})

app.get('/api/market/stream', (request, response) => {
  const interval = String(request.query.interval ?? '15')
  if (!allowedIntervals.has(interval)) return response.status(400).json({ error: 'Unsupported candle interval' })

  response.setHeader('Content-Type', 'text/event-stream')
  response.setHeader('Cache-Control', 'no-cache, no-transform')
  response.setHeader('Connection', 'keep-alive')
  response.flushHeaders()
  response.write('event: ready\ndata: {}\n\n')

  const unsubscribe = subscribeToKline(interval, (data) => {
    response.write(`data: ${JSON.stringify(data)}\n\n`)
  })
  const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 20_000)
  request.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
})

app.get('/api/trades', async (request, response) => {
  const result = await pool.query(
    `SELECT id, symbol, side, status, entry_price, exit_price, risk_usd, pnl_usd, r_multiple, opened_at, closed_at
     FROM trades WHERE user_id = $1 ORDER BY opened_at DESC LIMIT 500`,
    [request.user!.id],
  )
  response.json({ trades: result.rows })
})

app.post('/api/strategy/scan', async (request, response) => {
  try {
    response.json(await scanStrategy(request.user!.id))
  } catch (cause) {
    console.error('[strategy scan]', describeBybitError(cause))
    response.status(502).json({ error: 'Unable to scan the Bybit strategy candles' })
  }
})

app.get('/api/strategy/state', async (request, response) => {
  response.json(await getStrategyRuntime(request.user!.id))
})

app.get('/api/strategy/notifications', async (request, response) => {
  const result = await pool.query(
    `SELECT id, signal_key, strategy_version, direction, higher_timeframe_bias, detected_at, entry_time, exit_time,
       entry_price, stop_price, target_price, exit_price, risk_usd, outcome, r_result, decision, decided_at
     FROM trade_notifications
     WHERE user_id = $1
     ORDER BY detected_at DESC LIMIT 100`,
    [request.user!.id],
  )
  response.json({ notifications: result.rows })
})

app.patch('/api/strategy/notifications/:id/decision', async (request, response) => {
  const decision = request.body?.decision
  if (decision !== 'accepted' && decision !== 'dismissed') return response.status(400).json({ error: 'Decision must be accepted or dismissed' })
  try {
    const notification = await decideNotification(request.user!.id, request.params.id, decision)
    response.json({ notification })
  } catch (cause) {
    response.status(409).json({ error: cause instanceof Error ? cause.message : 'Could not update notification' })
  }
})

app.get('/api/performance/latest', async (request, response) => {
  const result = await pool.query(
    `SELECT total_profit_usd, total_r, overall_win_rate, today_win_rate, total_trades, captured_at
     FROM performance_snapshots WHERE user_id = $1 ORDER BY captured_at DESC LIMIT 1`,
    [request.user!.id],
  )
  response.json({ snapshot: result.rows[0] ?? null })
})

app.post('/api/performance/snapshots', async (request, response) => {
  const { totalProfitUsd, totalR, overallWinRate, todayWinRate, totalTrades } = request.body ?? {}
  const result = await pool.query(
    `INSERT INTO performance_snapshots
      (user_id, total_profit_usd, total_r, overall_win_rate, today_win_rate, total_trades)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, captured_at`,
    [request.user!.id, totalProfitUsd, totalR, overallWinRate, todayWinRate, totalTrades],
  )
  response.status(201).json({ snapshot: result.rows[0] })
})

app.post('/api/backtests', async (request, response) => {
  const body = request.body ?? {}
  const result = await pool.query(
    `INSERT INTO backtest_runs
      (user_id, strategy_name, interval, candle_count, window_start, window_end, risk_usd, reward_risk,
       net_profit_usd, net_r, win_rate, wins, losses, cancellations, total_trades, max_drawdown_r, config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING id, created_at`,
    [request.user!.id, '15m CHoCH / 1m FVG', body.interval, body.candleCount, body.windowStart, body.windowEnd,
      body.riskUsd, body.rewardRisk, body.netProfitUsd, body.netR, body.winRate, body.wins, body.losses,
      body.cancellations, body.totalTrades, body.maxDrawdownR, JSON.stringify(body.config ?? {})],
  )
  response.status(201).json({ run: result.rows[0] })
})

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error('[api]', error)
  response.status(500).json({ error: 'Unexpected server error' })
})

async function start() {
  await initializeDatabase()
  const server = app.listen(config.port, () => console.log(`Northstar API listening on http://localhost:${config.port}`))
  const stopStrategyWorker = startStrategyWorker()

  const shutdown = () => {
    stopStrategyWorker()
    server.close(() => void closeDatabase().finally(() => process.exit(0)))
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

start().catch((error) => {
  console.error('Failed to start Northstar API:', error)
  process.exit(1)
})
