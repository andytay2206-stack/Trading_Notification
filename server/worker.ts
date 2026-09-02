import { config } from './config.js'
import { pool } from './db.js'
import { scanStrategy } from './strategy.js'

export function startStrategyWorker() {
  if (!config.strategyWorkerEnabled) {
    console.log('[strategy worker] disabled')
    return () => undefined
  }

  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const schedule = () => {
    if (!stopped) timer = setTimeout(() => void run(), config.strategyWorkerIntervalMs)
  }

  const run = async () => {
    try {
      const users = await pool.query<{ id: string }>('SELECT id FROM app_users ORDER BY id')
      for (const user of users.rows) {
        if (stopped) break
        try {
          await scanStrategy(user.id)
        } catch (cause) {
          console.error(`[strategy worker] scan failed for user ${user.id}:`, cause)
        }
      }
    } catch (cause) {
      console.error('[strategy worker] cycle failed:', cause)
    } finally {
      schedule()
    }
  }

  console.log(`[strategy worker] enabled every ${config.strategyWorkerIntervalMs / 1_000}s`)
  timer = setTimeout(() => void run(), 5_000)

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}
