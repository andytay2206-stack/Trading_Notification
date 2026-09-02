import 'dotenv/config'

const production = process.env.NODE_ENV === 'production'
const workerIntervalSeconds = Number(process.env.STRATEGY_WORKER_INTERVAL_SECONDS || 60)

const required = (name: string, fallback?: string) => {
  const value = process.env[name] || fallback
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const config = {
  port: Number(process.env.PORT || 3001),
  production,
  jwtSecret: required('JWT_SECRET', production ? undefined : 'development-only-secret'),
  adminUsername: required('ADMIN_USERNAME', 'admin'),
  adminPassword: required('ADMIN_PASSWORD', production ? undefined : '123admin'),
  databaseUrl: required('DATABASE_URL'),
  bybitApiKey: process.env.BYBIT_API_KEY || undefined,
  bybitApiSecret: process.env.BYBIT_API_SECRET || undefined,
  bybitTestnet: process.env.BYBIT_TESTNET === 'true',
  bybitApiRegion: process.env.BYBIT_API_REGION || 'default',
  bybitBaseUrl: process.env.BYBIT_BASE_URL || undefined,
  bybitWsUrl: process.env.BYBIT_WS_URL || undefined,
  strategyRiskUsd: Number(process.env.STRATEGY_RISK_USD || 100),
  strategyWorkerEnabled: process.env.STRATEGY_WORKER_ENABLED
    ? process.env.STRATEGY_WORKER_ENABLED === 'true'
    : production,
  strategyWorkerIntervalMs: Math.max(60, Number.isFinite(workerIntervalSeconds) ? workerIntervalSeconds : 60) * 1_000,
}
