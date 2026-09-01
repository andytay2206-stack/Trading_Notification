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

The initial ledger contains clearly labeled demonstration trades. Currency conversions use indicative fixed rates until a live foreign-exchange provider is selected.

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open the local address printed by Vite (normally `http://localhost:5173`).

## Quality checks

```bash
npm run check
```

This executes unit tests for performance calculations and creates a production build.

## Documentation

- [Architecture and data flow](docs/ARCHITECTURE.md)
- [Product roadmap](docs/ROADMAP.md)

## Development workflow

- Each coherent extension receives its own Git commit after relevant checks pass.
- Secrets such as API keys, email credentials, phone numbers, and webhook tokens must never be committed.
- Local Codex continuity records live in `.codex-notes/` and are intentionally excluded from Git.
