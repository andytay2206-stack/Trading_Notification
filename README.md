# Northstar — Futures Trading Notifications

Production dashboard: <https://trading-notification.vercel.app>

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
- Automated BOS, CHoCH, FVG, and 1m/15m trend-line indicators on a navigable TradingView Lightweight Charts view, with one setup slot and a 60-minute pullback-entry window
- Timestamp-aligned 15-minute context alongside complete one-minute setup tracking
- Pullback prediction board, automatic strategy win rate, and separate accepted/skipped/finished history

Strategy win rate is calculated automatically from every filled version-8 setup that reaches TP or SL. Portfolio metrics remain separate and include only completed notifications that the user confirms were taken. Currency conversions use indicative fixed rates until a live foreign-exchange provider is selected.

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
- [Railway and Vercel deployment](docs/DEPLOYMENT.md)
- [Product roadmap](docs/ROADMAP.md)

## Backtesting status

The backtester uses the same structural strategy as the live scanner: timestamped 15-minute trend context, 1-minute BOS continuation or CHoCH reversal, and the most relevant wick-defined three-candle FVG midpoint prediction. Entry occurs only when a later candle returns to the midpoint; that live candle's wick can fill entry or hit TP/SL before it closes. New version-8 setups place the stop beyond the opposing swing with an 8% candle-range buffer and keep the target at 4R. Each run randomly selects 500, 800, or 1,000 historical candles plus structural warm-up data. Fees, funding, slippage, and spread are not included.

## Development workflow

- Each coherent extension receives its own Git commit after relevant checks pass.
- Secrets such as API keys, email credentials, phone numbers, and webhook tokens must never be committed.
- Local Codex continuity records live in `.codex-notes/` and are intentionally excluded from Git.
