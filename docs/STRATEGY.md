# Structural CHoCH and Fair Value Gap Strategy

This document is the executable interpretation currently shared by the automated chart, live scanner, notification tracker, and backtester.

## Timeframes

- `BTCUSDT` Bybit linear perpetual only.
- The 15-minute chart determines direction.
- The 1-minute chart generates entries.
- Only closed candles participate in structure and signal decisions.
- Every historical 1-minute setup uses the 15-minute bias that was already known at that timestamp. Future bias is never applied retroactively.

## Swing structure

A swing uses a two-candle pivot by default:

- Swing high: its high exceeds both highs on each side.
- Swing low: its low is below both lows on each side.
- Higher high plus higher low establishes upward structure.
- Lower high plus lower low establishes downward structure.

The two-candle confirmation means a pivot is known only after two later candles have closed.

## Change of Character (CHoCH)

- During downward structure, a candle close above the latest confirmed swing high creates bullish CHoCH.
- During upward structure, a candle close below the latest confirmed swing low creates bearish CHoCH.
- A wick through structure without a close does not qualify.

## Fair Value Gap (FVG)

The CHoCH candle is the middle displacement candle of a three-candle pattern:

- Bullish FVG: the following candle's low is above the preceding candle's high.
- Bearish FVG: the following candle's high is below the preceding candle's low.
- Entry is the 50% midpoint between the two FVG boundaries.
- Entry remains eligible for 120 one-minute candles.

This is the current precise interpretation of the requested gap inside the CHoCH move. It can be adjusted if a different wick/body definition is intended.

## Risk and outcome

- Bullish stop: below the CHoCH candle low by 5% of that candle's full high-low range.
- Bearish stop: above the CHoCH candle high by 5% of that candle's full high-low range.
- `1R` is the distance from FVG midpoint entry to that stop.
- Target is exactly `4R` from entry.
- If one candle contains both stop and target, the engine records the stop first (`−1R`) because candle data cannot reveal intrabar ordering.
- The USD value of `1R` defaults to `STRATEGY_RISK_USD=100` in `.env`.

## Direction filter

A 1-minute FVG setup is valid only when its direction matches the timestamp-aligned 15-minute structural bias. Neutral 15-minute structure produces no entry.

## Portfolio decision

The scanner tracks every valid setup virtually. When it resolves:

- Check means the user took the trade; the result enters portfolio statistics and history.
- Cross means the user did not take the trade; it remains in signal history but does not affect portfolio statistics.

## Chart display policy

To keep the automated chart readable, only the newest setup whose FVG is waiting for entry or whose virtual trade is active receives entry, stop, target, and risk/reward shading. Resolved and expired trade levels are removed. The reward area is translucent green from entry to target; the risk area is translucent red from entry to stop. Only a small recent set of swing segments and CHoCH context remains visible.

## Known limitations

- Fees, funding, spread, and slippage are excluded.
- The scanner currently runs when the dashboard requests a scan; an always-on background worker is still planned.
- A maximum of 1,000 one-minute candles is evaluated per scan due to the upstream endpoint limit.
- Strategy behavior should be reviewed visually against known examples before being treated as production trading guidance.
