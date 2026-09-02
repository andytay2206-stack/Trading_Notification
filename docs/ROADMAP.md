# Roadmap

## Phase 1 — Interface and market data (current)

- Performance dashboard
- R-based statistics
- Currency display selection
- Live Bybit BTC perpetual chart
- Sidebar navigation
- Resilient WebSocket plus REST-polling market feed
- Random-window structural-strategy backtesting engine
- Node `bybit-api` market-data gateway
- PostgreSQL persistence foundation
- Administrator login and logout

## Phase 2 — Strategy specification

- Review swing-pivot length against visual examples
- Confirm FVG wick/body boundaries and midpoint entry behavior
- Confirm the 5% buffer means CHoCH candle range, not market price
- Add more known bullish and bearish example fixtures

## Phase 3 — Signal and virtual trade tracking

- Move scanning from dashboard-triggered requests to an always-on worker
- Add strategy-version identifiers and migration behavior
- Add stale-feed and missed-candle recovery

## Phase 4 — Notifications

- Choose phone channel: push, Telegram, SMS, or another provider
- Configure email delivery
- Add alert templates, cooldowns, retries, and delivery audit history
- Add health and stale-data notifications

## Phase 5 — Deployment and operations

- Select an always-on hosting target
- Add a database and secret management
- Monitor market-feed connectivity and worker health
- Back up and export the trade journal
- Replace temporary credentials and startup schema creation with managed secrets and versioned migrations
