# Architecture

## Current system

Northstar uses a React/TypeScript client, a Node/Express API, and PostgreSQL.

```text
Bybit public APIs ← bybit-api SDK ← Node API ← authenticated React client
                                      ↓
                                 PostgreSQL
```

The Node API loads the latest 300 `BTCUSDT` linear perpetual candles using `RestClientV5`. `WebsocketClient` subscribes to Bybit klines and bridges updates to the browser through server-sent events. A 10-second REST poll provides a fallback when WebSocket access is restricted.

## Authentication

The administrator is seeded from environment variables at API startup. Passwords are stored as bcrypt hashes. A successful login creates a signed, HTTP-only, same-site cookie valid for 12 hours. All market, persistence, and streaming routes require this session.

The `admin` / `123admin` credentials are temporary development defaults and must be replaced before deployment.

## PostgreSQL records

- `app_users`: application identities and password hashes
- `trades`: persistent live or virtual trade lifecycles and R outcomes
- `performance_snapshots`: historical dashboard aggregates
- `backtest_runs`: strategy configuration, random period, win rate, profit, R, and drawdown for every completed test
- `trade_notifications`: detected structural setups, virtual outcomes, and the user's accepted/dismissed decision

Tables are created idempotently when the API starts. Later production deployment should replace this startup initialization with versioned migrations.

## Backtesting flow

```text
Random endpoint from previous 2 years
              ↓
Bybit historical candles
              ↓
15m structure bias + 1m CHoCH/FVG engine
              ↓
Trade lifecycle → win rate / net R / USD profit / drawdown
```

The backtest and live scanner share the same deterministic strategy module. Each 1-minute setup uses only the 15-minute bias known at that setup's timestamp, preventing look-ahead bias. If both stop and target fall inside the same candle, the stop is assumed to occur first.

## Automated strategy chart

The chart is built with TradingView Lightweight Charts but is an automated output display rather than a manual analysis tool. Mouse/touch scrolling and scaling are disabled. It automatically follows recent Bybit BTCUSDT perpetual candles and renders:

- dotted swing-structure trend segments;
- CHoCH arrows at closed-candle breaks;
- dashed upper/lower FVG boundaries;
- a gold midpoint entry;
- a red `−1R` stop;
- a green `+4R` target.

Only the newest waiting/active setup receives trade levels. Resolved trade overlays are removed automatically. Translucent green and red bands visualize reward and risk respectively. The chart retains orange previous-candle CHoCH break lines and up to three shaded FVGs from the latest hour, plus compact labeled swing-high and swing-low trend lines.

Pending signals carry a strategy version. `structure-v2` identifies the previous-candle-break CHoCH rule; unresolved signals from older definitions are excluded from the current noticeboard, while user-decided history remains preserved.

The chart, server scanner, notification outcomes, and backtester all consume the same strategy implementation.

## Notification decisions

The server scans 500 closed 15-minute candles and 1,000 closed 1-minute candles. Aligned setups are deduplicated in PostgreSQL. After a setup reaches its stop or target, the dashboard asks whether the user actually took it:

- **Check:** adds the result to `trades`, portfolio profit, R, and win rate, while retaining notification history.
- **Cross:** retains the setup in notification history but excludes it from portfolio performance.

## Performance definitions

- **Net profit:** Sum of `pnlUsd` for closed trades. Other currencies are display conversions only.
- **Overall win rate:** Winning closed trades divided by all closed trades. Breakeven trades count as closed non-wins.
- **Today's win rate:** The same calculation restricted to trades closed today in the user's local timezone.
- **R-multiple:** Profit or loss divided by planned initial risk. For example, risking USD 100 and earning USD 200 is `+2R`; losing the planned USD 100 is `-1R`.
- **Today's R:** Sum of R-multiples for trades closed today.

## Current data limitations

- IDR and MYR use labeled indicative rates, not a live FX feed.
- The Node API consumes public Bybit/Bytick endpoints without exchange authentication.
- Phone/email delivery providers are not connected yet; the in-app noticeboard is implemented.
- Backtest results exclude fees, spread, funding, and slippage and must not be interpreted as live strategy evidence.

## Safety boundary

The app is notification-only. A future exchange connection should begin as read-only. Automated order execution is outside the current scope and must not be introduced implicitly.

## Next architecture slice

Add phone/email delivery as consumers of persisted signal events, then move the one-minute scanner into an always-on scheduled worker so it does not depend on the dashboard being open.
