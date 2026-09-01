# Northstar — Futures Trading Notifications

Northstar is a notification-first futures monitor. The current application provides a performance dashboard and a live Bitcoin perpetual chart powered by Bybit public market data.

> The application currently monitors public data only. It does not connect to an exchange account or place orders.

## Available now

- Dashboard profit display in USD, IDR, or MYR
- Overall and daily win rates calculated from closed trades
- Net result measured in `R`, where `1R` is the initial amount risked
- Recent trade outcome journal
- Live `BTCUSDT` linear perpetual candlestick chart from Bybit
- Candle intervals: 1m, 3m, 5m, 15m, 30m, 1h, 4h, and 1d
- Real-time updates to the open candle through Bybit WebSocket data
- Responsive desktop and mobile layouts
- Persistent sidebar navigation with Overview, Live Market, and Backtesting pages
- Random historical-window backtesting with win rate, profit, net R, and drawdown results

The initial ledger contains clearly labeled demonstration trades. Currency conversions use indicative fixed rates until a live foreign-exchange provider is selected.

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open the local address printed by Vite (normally `http://localhost:5173`).

During local development, Vite proxies candle REST requests to Bybit to avoid browser cross-origin restrictions. WebSocket updates are supplemented by a REST refresh every 10 seconds, so the chart can remain live if the socket is unavailable.

## Quality checks

```bash
npm run check
```

This executes unit tests for performance calculations and creates a production build.

## Documentation

- [Architecture and data flow](docs/ARCHITECTURE.md)
- [Product roadmap](docs/ROADMAP.md)

## Backtesting status

The page currently runs a clearly labeled demonstration strategy: EMA 9/21 crossover, one ATR of initial risk, and a configurable reward target. Each run selects a random endpoint between two days and two years ago and requests up to 1,000 historical Bybit candles. Fees, funding, slippage, and spread are not included. The demo rules will be replaced when the owner's strategy parameters are supplied.

## Development workflow

- Each coherent extension receives its own Git commit after relevant checks pass.
- Secrets such as API keys, email credentials, phone numbers, and webhook tokens must never be committed.
- Local Codex continuity records live in `.codex-notes/` and are intentionally excluded from Git.
