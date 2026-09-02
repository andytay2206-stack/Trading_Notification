# Architecture

## Current system

Northstar uses a React/TypeScript client, a Node/Express API, and PostgreSQL.

```text
Bybit public APIs ← bybit-api SDK ← Node API ← authenticated React client
                                      ↓
                                 PostgreSQL
```

The Node API loads the latest 300 `BTCUSDT` linear perpetual candles using `RestClientV5`. `WebsocketClient` subscribes to Bybit klines and bridges updates to the browser through server-sent events. A sequential 10-second REST poll provides a fallback when WebSocket access is restricted. Interval changes cancel and deactivate the prior feed before its callbacks can update the new view, preventing stale 15-minute responses from contaminating the 1-minute chart. The selected interval is persisted in browser storage so a remount does not silently return to 15 minutes.

## Authentication

The administrator is seeded from environment variables at API startup. Passwords are stored as bcrypt hashes. A successful login creates a signed, HTTP-only, same-site cookie valid for 12 hours. All market, persistence, and streaming routes require this session.

The `admin` / `123admin` credentials are temporary development defaults and must be replaced before deployment.

## PostgreSQL records

- `app_users`: application identities and password hashes
- `trades`: persistent live or virtual trade lifecycles and R outcomes
- `performance_snapshots`: historical dashboard aggregates
- `backtest_runs`: strategy configuration, random period, win rate, profit, R, and drawdown for every completed test
- `trade_notifications`: detected structural setups, virtual outcomes, and the user's accepted/dismissed decision
- `strategy_runtime`: per-user strategy version and reset timestamp used to prevent historical signal backfill

Tables are created idempotently when the API starts. Later production deployment should replace this startup initialization with versioned migrations.

## Backtesting flow

```text
Random historical endpoint and 500/800/1,000-candle sample
              ↓
Bybit historical candles
              ↓
15m structure bias + 1m CHoCH/FVG engine
              ↓
Trade lifecycle → win rate / net R / USD profit / drawdown
```

The backtest and live scanner share the same deterministic strategy module. Each 1-minute setup records only the 15-minute bias known at that timestamp, preventing look-ahead bias. Bias is contextual rather than a separate scheduling filter, so the chart and server share one chronological slot. If both stop and target fall inside the same candle, the stop is assumed to occur first.

## Automated strategy chart

The chart is built with TradingView Lightweight Charts. Its strategy annotations are automated, while the view supports cursor and touch navigation. Mouse-wheel or pinch gestures zoom, dragging moves through candle history, dragging either axis changes its scale, and double-clicking an axis resets it. Live updates stop forcing the chart back to real time after the user navigates away; **Latest candles** restores the live view. It renders:

- dotted swing-structure trend segments;
- CHoCH arrows at closed-candle breaks;
- softly shaded FVG zones;
- a gold midpoint entry;
- a red `−1R` stop;
- a green `+4R` target.

The one-at-a-time one-minute setup receives viewport-wide price levels and remains visible until its prediction is missed/cancelled or its filled trade wins/loses. Gold identifies a setup against the current 15-minute bias; green identifies an aligned setup. Its time-stamped tag is placed above the setup candle for shorts and below it for longs. Resolved live overlays are removed automatically; the backtest chart can deliberately restore one selected completed trade. Translucent green and red bands visualize reward and risk respectively. The selected gap is shaded more strongly, all FVG/entry/SL/TP values are repeated in the toolbar, and **Fit setup** restores their automatic price range.

Live updates modify only new candle data. Strategy overlays are rebuilt only when a candle closes, not for every update to the current candle. Rolling the 300-candle window no longer resets the visible range, and trade overlays are excluded from automatic price scaling so a distant 4R target cannot compress the candle view into an apparently blank chart.

Pending signals carry a strategy version. `structure-v7` identifies the predictive post-CHoCH entry lifecycle, 60-minute waiting limit, and automatic strategy measurement. Older version records remain available as legacy history; the persisted version-7 runtime timestamp defines the new measurement baseline.

The chart, server scanner, notification outcomes, and backtester all consume the same strategy implementation.

In production, an in-process Railway worker scans all application users sequentially every 60 seconds. The next cycle is scheduled only after the current cycle finishes, so a slow Bybit response cannot stack worker cycles. A per-user in-flight lock also makes a simultaneous dashboard refresh share the active scan instead of duplicating it. Browser-triggered scans remain available for an immediate refresh but are no longer required for lifecycle tracking. Vercel serves the frontend and reverse-proxies same-origin `/api/*` traffic to the Railway service.

## Notification decisions

The server scans 500 closed 15-minute candles and 1,000 closed 1-minute candles. Version-7 one-minute setups are processed chronologically through the same slot used by the chart and deduplicated in PostgreSQL. The dashboard separates waiting/active pullback predictions from finished history. After a filled setup reaches stop or target, the user may optionally record whether it was personally taken:

Finished history displays the setup detection time, midpoint entry-fill time, and resolution time. Wins identify the exit as a TP hit, losses as an SL hit, while unfilled missed and cancelled predictions retain their appropriate non-trade labels. All timestamps render in the browser's local timezone.

- **Check:** adds the result to `trades`, portfolio profit, R, and win rate, while retaining notification history.
- **Cross:** retains the setup in notification history but excludes it from portfolio performance.

The prediction is announced after CHoCH and FVG confirmation, and only a later candle can fill it at the midpoint. It is cancelled at `0R` after 60 eligible one-minute candles without a touch; a touch on candle 60 is still valid. After candle-based reconciliation, a database fallback closes stale legacy `waiting` records no earlier than the complete confirmation and one-hour entry window when their original setup can no longer be reconstructed. Filled trades have no timeout and remain active until TP or SL. An unfilled prediction that reaches TP first is recorded as missed/skipped at `0R`. Neither cancellation nor missed predictions enter the automatic strategy win-rate denominator.

## Performance definitions

- **Net profit:** Sum of `pnlUsd` for closed trades. Other currencies are display conversions only.
- **Strategy win rate:** All version-7 filled wins divided by filled wins plus losses, independent of user decisions; missed and cancelled predictions are excluded.
- **Overall win rate:** Accepted portfolio wins divided by wins plus losses; legacy cancellations and breakeven trades are excluded.
- **Today's win rate:** The same calculation restricted to decisive trades closed today in the user's local timezone.
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
