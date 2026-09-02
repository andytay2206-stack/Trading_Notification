# Railway and Vercel Deployment

## Current production endpoints

- Dashboard: `https://trading-notification.vercel.app`
- Railway API: `https://tradingnotification-production.up.railway.app`
- Public healthcheck: `https://trading-notification.vercel.app/api/health`

The production deployment was verified on 2026-09-02 for frontend delivery, Railway proxying, PostgreSQL connectivity, authentication cookies, live Bybit candle access, and persisted strategy state.

The production layout keeps the browser and authentication same-origin while allowing the scanner to run continuously:

- Vercel builds and serves the Vite/React frontend.
- Vercel rewrites `/api/*` to the Railway service without exposing a second origin to browser code.
- Railway runs the Express API and one-minute strategy worker in one always-on container.
- Railway PostgreSQL stores users, predictions, outcomes, portfolio decisions, and backtests.

## 1. Railway API and PostgreSQL

Create a Railway project from this GitHub repository, then add a PostgreSQL service. On the application service, configure:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
NODE_ENV=production
JWT_SECRET=<long-random-secret>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong-password>
STRATEGY_RISK_USD=100
STRATEGY_WORKER_ENABLED=true
STRATEGY_WORKER_INTERVAL_SECONDS=60
BYBIT_TESTNET=false
BYBIT_API_REGION=default
```

Public Bybit candles do not require `BYBIT_API_KEY` or `BYBIT_API_SECRET`. Add those only when private account functionality is implemented.

The repository Dockerfile builds and starts the API. Generate an HTTPS domain for the application service, configure `/api/health` as its deploy healthcheck, use one replica, and leave Railway Serverless disabled so the worker remains available. The worker scans every user sequentially and waits until a scan completes before scheduling the next cycle.

Verify the generated domain:

```text
https://<railway-domain>/api/health
```

It must return `{"status":"ok","database":"connected"}`.

Opening the Railway domain without a path returns a small API status response and points to `/api/health`. Railway hosts the backend here; the full dashboard is served from the Vercel domain.

## 2. Vercel frontend

Import the same GitHub repository into Vercel as a Vite project. Add this variable to Production and Preview:

```text
RAILWAY_API_URL=https://<railway-domain>
```

Do not include `/api` or a trailing path. `vercel.mjs` validates the HTTPS URL, proxies `/api/*` to Railway, and sends other routes to the SPA entry point. Deploy after the variable is saved.

Verify the production Vercel URL in this order:

1. Open `/api/health` and confirm the Railway database is connected.
2. Log in with the Railway `ADMIN_USERNAME` and `ADMIN_PASSWORD` values.
3. Open Live Market and confirm candles load.
4. Close the browser for several minutes, reopen it, and confirm the strategy state and notification history continued updating.

## Operational notes

- Railway is the persistent process. Vercel serves the frontend and proxies requests; it is not the background worker.
- Keep Railway Serverless disabled and one API replica active. Multiple replicas would perform redundant market scans.
- The worker persists predictions and outcomes, but email/phone delivery is not active until notification-provider credentials and message rules are implemented.
- The current Vercel external rewrite has a finite proxy duration. The market `EventSource` reconnects automatically, and the existing ten-second REST polling remains the chart fallback.
- Production refuses to start without `JWT_SECRET`, `ADMIN_PASSWORD`, and `DATABASE_URL`.
- Railway creates a separate production database. Local PostgreSQL data is not uploaded or deleted automatically.

## Automatic redeployment

After both services are connected to the GitHub repository, pushes to `main` can deploy both platforms automatically. Review Railway and Vercel build logs after strategy or schema changes.
