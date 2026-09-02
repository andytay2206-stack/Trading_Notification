import { closeDatabase, initializeDatabase, pool } from '../server/db.js'

const tables = ['trade_notifications', 'trades', 'performance_snapshots', 'backtest_runs', 'strategy_runtime']

try {
  await initializeDatabase()
  const users = await pool.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM app_users')
  await pool.query('BEGIN')
  await pool.query(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY`)
  await pool.query(
    `INSERT INTO strategy_runtime (user_id, strategy_version, started_at)
     SELECT id, 'structure-v7', NOW() FROM app_users`,
  )
  await pool.query('COMMIT')
  console.log(`Reset complete: ${tables.join(', ')}. Schema and ${users.rows[0].count} user account(s) were preserved.`)
} catch (error) {
  await pool.query('ROLLBACK')
  throw error
} finally {
  await closeDatabase()
}
