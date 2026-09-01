# Architecture

## Current system

Northstar is currently a client-side React and TypeScript application built with Vite.

```text
Bybit public REST API ── historical candles ─┐
                                            ├── Live Market page
Bybit public WebSocket ── candle updates ───┘

Trade ledger ── performance calculator ─────── Dashboard
```

The REST request loads the latest 300 `BTCUSDT` linear perpetual candles. A public WebSocket subscription then replaces the active candle as price changes and appends a new candle when the next interval starts. A 10-second REST poll provides a fallback when WebSocket access is restricted. Vite proxies REST calls in local development.

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

- Demonstration trades are in memory and reset on reload.
- IDR and MYR use labeled indicative rates, not a live FX feed.
- The browser consumes Bybit's public endpoints without exchange authentication.
- No signal rules, persistence backend, notification provider, or user account exists yet.
- Backtest results exclude fees, spread, funding, and slippage and must not be interpreted as live strategy evidence.

## Safety boundary

The app is notification-only. A future exchange connection should begin as read-only. Automated order execution is outside the current scope and must not be introduced implicitly.

## Next architecture slice

Once the strategy parameters are supplied, the next slice will add a deterministic signal engine with versioned rules, candle-close/intrabar evaluation semantics, signal deduplication, a persisted virtual trade lifecycle, and tests covering each entry and exit condition. Notification delivery should consume signal events rather than duplicate strategy logic.
