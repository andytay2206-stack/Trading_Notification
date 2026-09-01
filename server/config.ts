import 'dotenv/config'

const required = (name: string, fallback?: string) => {
  const value = process.env[name] || fallback
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const config = {
  port: Number(process.env.PORT || 3001),
  production: process.env.NODE_ENV === 'production',
  jwtSecret: required('JWT_SECRET', 'development-only-secret'),
  adminUsername: required('ADMIN_USERNAME', 'admin'),
  adminPassword: required('ADMIN_PASSWORD', '123admin'),
  databaseUrl: required('DATABASE_URL'),
  bybitApiKey: process.env.BYBIT_API_KEY || undefined,
  bybitApiSecret: process.env.BYBIT_API_SECRET || undefined,
  bybitTestnet: process.env.BYBIT_TESTNET === 'true',
  bybitApiRegion: process.env.BYBIT_API_REGION || 'default',
  bybitBaseUrl: process.env.BYBIT_BASE_URL || undefined,
  bybitWsUrl: process.env.BYBIT_WS_URL || undefined,
}
