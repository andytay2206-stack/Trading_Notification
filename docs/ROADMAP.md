# Roadmap

## Phase 1 — Interface and market data (current)

- Performance dashboard
- R-based statistics
- Currency display selection
- Live Bybit BTC perpetual chart
- Sidebar navigation
- Resilient WebSocket plus REST-polling market feed
- Random-window demo backtesting engine

## Phase 2 — Strategy specification

- Define exact indicators and parameters
- Decide whether conditions are evaluated intrabar or only at candle close
- Define long and short entry conditions
- Define stop-loss, target, invalidation, and expiry rules
- Create executable examples and edge-case tests before enabling signals
- Replace the demonstration EMA strategy in both backtesting and live monitoring

## Phase 3 — Signal and virtual trade tracking

- Evaluate each relevant candle
- Deduplicate repeated signals
- Record entry, risk, stop, targets, and lifecycle state
- Determine win, loss, breakeven, and R result from subsequent candles
- Persist the journal across restarts

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
