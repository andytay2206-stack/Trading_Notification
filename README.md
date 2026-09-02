# Northstar — Futures Trading Notifications

Northstar is a notification-first futures monitor. A React interface talks to a Node API that retrieves Bitcoin market data through `bybit-api` and stores application results in PostgreSQL.

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
- Login-protected workspace with an HTTP-only session cookie and sidebar logout
- PostgreSQL storage for users, trades, performance snapshots, and completed backtests
- Automated strategy indicators on a navigable TradingView Lightweight Charts view, with one setup slot and a 180-candle maximum lifecycle
- Timestamp-aligned 15-minute bias and 1-minute setup scanning
- Persistent notification board with portfolio acceptance and history-only dismissal

Portfolio metrics are calculated only from completed notifications that the user confirms were taken. Currency conversions use indicative fixed rates until a live foreign-exchange provider is selected.

## Run locally

Requirements: Node.js 20 or newer and PostgreSQL 15 or newer. A Docker Compose definition is included as the easiest database option.

```bash
npm install
docker compose up -d postgres
npm run dev
```

For a native Windows PostgreSQL installation, initialize the project database once from PowerShell:

```bash
npm run db:setup
npm run db:check
npm run dev
```

`db:setup` detects the newest PostgreSQL installation and securely prompts for the `postgres` administrator password chosen during installation. It creates the `northstar` role and database expected by `.env`; the password is not saved or printed. The API creates its application tables on first startup.

To clear trading history and begin strategy tracking from the current time while preserving users and schema:

```powershell
npm run db:reset-data
```

Open the local address printed by Vite (normally `http://localhost:5173`).

The API starts on port 3001 and the interface starts on port 5173. During local development, Vite proxies `/api` to Node. Node uses the `bybit-api` SDK for both REST candles and WebSocket events; the browser receives live events through a same-origin server-sent-event stream. A REST refresh every 10 seconds remains as a fallback.

The local `.env` file is intentionally ignored by Git. Copy `.env.example` when setting up another machine. Public candles do not need Bybit credentials; `BYBIT_API_KEY` and `BYBIT_API_SECRET` are placeholders for future account-specific features.

If the API reports that it cannot reach Bybit, first stop every existing development process with `Ctrl+C` and restart `npm run dev`. Vite now requires port 5173 instead of silently selecting a different port. If the default Bybit host is unavailable or redirected by the network provider, set `BYBIT_API_REGION=bytick` in `.env` and restart. This selects `api.bytick.com` and the matching `stream.bytick.com` WebSocket automatically; leave explicit URL overrides empty unless a supported regional endpoint is required.

## Temporary login

- Username: `admin`
- Password: `123admin`

The API hashes the configured password before storing the administrator in PostgreSQL. Change `ADMIN_PASSWORD` and `JWT_SECRET` in `.env` before any deployment.

## Quality checks

```bash
npm run check
```

This executes unit tests for performance calculations and creates a production build.

## Documentation

- [Architecture and data flow](docs/ARCHITECTURE.md)
- [Strategy rules and assumptions](docs/STRATEGY.md)
- [Product roadmap](docs/ROADMAP.md)

## Backtesting status

The backtester uses the same structural strategy as the live scanner: timestamp-aligned 15-minute direction, 1-minute CHoCH, the most relevant three-candle FVG midpoint entry, a stop near the opposite pre-CHoCH candle-body extreme with a 5% full-range buffer, and a 4R target. Each run randomly selects a historical endpoint between two days and two years ago and loads 500, 800, or 1,000 candles plus structural warm-up data. Select any completed journal trade to inspect its entry, stop, and target on the chart. Fees, funding, slippage, and spread are not included.

## Development workflow

- Each coherent extension receives its own Git commit after relevant checks pass.
- Secrets such as API keys, email credentials, phone numbers, and webhook tokens must never be committed.
- Local Codex continuity records live in `.codex-notes/` and are intentionally excluded from Git.
