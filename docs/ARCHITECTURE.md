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

Tables are created idempotently when the API starts. Later production deployment should replace this startup initialization with versioned migrations.

## Backtesting flow

```text
Random endpoint from previous 2 years
              ↓
Bybit historical candles
              ↓
Demo EMA 9/21 crossover engine
              ↓
Trade lifecycle → win rate / net R / USD profit / drawdown
```

The demo engine enters after a fast/slow EMA crossover, uses one ATR as initial risk, and tests subsequent candle highs and lows against the stop and reward target. If both stop and target fall inside the same candle, the stop is assumed to occur first. This avoids overstating results when tick-level ordering is unavailable.

## Performance definitions

- **Net profit:** Sum of `pnlUsd` for closed trades. Other currencies are display conversions only.
- **Overall win rate:** Winning closed trades divided by all closed trades. Breakeven trades count as closed non-wins.
- **Today's win rate:** The same calculation restricted to trades closed today in the user's local timezone.
- **R-multiple:** Profit or loss divided by planned initial risk. For example, risking USD 100 and earning USD 200 is `+2R`; losing the planned USD 100 is `-1R`.
- **Today's R:** Sum of R-multiples for trades closed today.

## Current data limitations

- Demonstration dashboard trades remain in memory; real tracked trades will use the PostgreSQL `trades` table.
- IDR and MYR use labeled indicative rates, not a live FX feed.
- The browser consumes Bybit's public endpoints without exchange authentication.
- No final signal rules or notification provider exists yet.
- Backtest results exclude fees, spread, funding, and slippage and must not be interpreted as live strategy evidence.

## Safety boundary

The app is notification-only. A future exchange connection should begin as read-only. Automated order execution is outside the current scope and must not be introduced implicitly.

## Next architecture slice

Once the strategy parameters are supplied, the next slice will add a deterministic signal engine with versioned rules, candle-close/intrabar evaluation semantics, signal deduplication, a persisted virtual trade lifecycle, and tests covering each entry and exit condition. Notification delivery should consume signal events rather than duplicate strategy logic.
