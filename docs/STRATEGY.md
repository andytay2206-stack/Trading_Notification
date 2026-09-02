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

- Swing structure first establishes whether the move is upward or downward.
- During a downward structural leg, a new candle closing above the preceding confirmed swing high creates bullish CHoCH.
- During an upward structural leg, a new candle closing below the preceding confirmed swing low creates bearish CHoCH.
- The opposite swing formed after the broken level is the setup's invalidation extreme. For example, after a swing low at 01:17 and a new swing high at 01:25, the 01:27 close below the 01:17 low is bearish CHoCH and the 01:25 high is the invalidation extreme.
- A wick through the structural swing without a close beyond it does not qualify.

## Fair Value Gap (FVG)

The CHoCH candle must also be the middle displacement candle of a three-candle pattern. CHoCH without FVG does not create an entry:

- Bullish FVG: the following candle's low is above the preceding candle's high.
- Bearish FVG: the following candle's high is below the preceding candle's low.
- Entry is the 50% midpoint between the two FVG boundaries.
- Entry remains eligible for 120 one-minute candles.

This is the current precise interpretation of the requested gap inside the CHoCH move. It can be adjusted if a different wick/body definition is intended.

## Risk and outcome

- Bullish stop: below the structural invalidation swing low by 5% of that swing candle's full high-low range.
- Bearish stop: above the structural invalidation swing high by 5% of that swing candle's full high-low range.
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

To keep the automated chart readable, only the newest setup whose FVG is waiting for entry or whose virtual trade is active receives entry, stop, target, and risk/reward shading. Resolved and expired trade levels are removed. The reward area is translucent green from entry to target; the risk area is translucent red from entry to stop.

CHoCH is drawn as an orange dashed break line and marker. Up to three direction-colored FVG zones remain visible for the latest one-hour window. Compact labeled trend lines connect the latest swing highs and swing lows. An active setup remains visible even if its originating CHoCH has just moved outside that one-hour context window. Colors and annotation hierarchy follow TradingView's dark-chart conventions.

The automated indicators do not prevent chart navigation. Use the mouse wheel to zoom, drag the chart to move through candle history, drag the time or price axis to rescale, and double-click an axis to reset it. Navigating away pauses automatic real-time following; **Latest candles** returns to the live edge.

## Known limitations

- Fees, funding, spread, and slippage are excluded.
- The scanner currently runs when the dashboard requests a scan; an always-on background worker is still planned.
- A maximum of 1,000 one-minute candles is evaluated per scan due to the upstream endpoint limit.
- Strategy behavior should be reviewed visually against known examples before being treated as production trading guidance.
