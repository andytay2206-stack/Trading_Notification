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
- During a downward structural leg, a new candle closing above the body edge of the preceding confirmed swing high creates bullish CHoCH.
- During an upward structural leg, a new candle closing below the body edge of the preceding confirmed swing low creates bearish CHoCH.
- The latest confirmed opposing swing before CHoCH is the stop's invalidation extreme. Its wick supplies the lowest point for a bullish setup or highest point for a bearish setup.
- Pivots are still found from candle wicks, but the break level is the swing candle's body edge. A wick through that level without a close beyond it does not qualify.

## Fair Value Gap (FVG)

The structural leg from the invalidation swing through the CHoCH must contain a three-candle imbalance. CHoCH without an FVG in that move does not create an entry:

- Bullish FVG: the following candle's low is above the preceding candle's high.
- Bearish FVG: the following candle's high is below the preceding candle's low.
- An FVG established at least one full closed candle before CHoCH is preferred. If several qualify, the widest gap is the most relevant displacement zone and a tie uses the nearest gap. If none was already established, a valid CHoCH-centered FVG may be used after its third candle closes.
- Entry is the 50% midpoint between the two FVG boundaries.
- A selected setup has a total lifetime of 180 one-minute candles from its CHoCH candle.
- No newer setup is considered while the selected setup is waiting, filled, or active.

In the 06:39 long example, the preferred established FVG is 06:34/06:35/06:36. Its boundaries are 77,490.6 and 77,500.0, giving a midpoint entry of 77,495.3. The 06:34 invalidation wick is 77,408.3 and the buffered stop is 77,404.2. The earlier 01:27 example remains valid when no earlier established FVG exists and the CHoCH candle itself is the middle displacement candle.

This is the current precise interpretation of the requested gap inside the CHoCH move. It can be adjusted if a different wick/body definition is intended.

## Risk and outcome

- Bullish stop: near and below the latest confirmed opposing swing wick before CHoCH, buffered by 5% of that candle's full high-low range.
- Bearish stop: near and above the latest confirmed opposing swing wick before CHoCH, buffered by 5% of that candle's full high-low range.
- `1R` is the distance from FVG midpoint entry to that stop.
- Target is exactly `4R` from entry.
- If one candle contains both stop and target, the engine records the stop first (`−1R`) because candle data cannot reveal intrabar ordering.
- If an unfilled setup reaches 180 candles, it is cancelled automatically at `0R`.
- If a filled trade reaches 180 candles without stop or target, it is cancelled at that candle's close. Its fractional R is the directional entry-to-close move divided by initial risk, and USD P/L is fractional R multiplied by configured risk USD.
- The USD value of `1R` defaults to `STRATEGY_RISK_USD=100` in `.env`.

## Direction filter

A 1-minute FVG setup is valid only when its direction matches the timestamp-aligned 15-minute structural bias. Neutral 15-minute structure produces no entry.

The chart still displays the selected one-minute setup when it is counter to the 15-minute bias, using the gold possible-trade style. Only an aligned setup receives the green style and is eligible for a persisted notification.

Aligned setups are processed chronologically through one trade slot. A later signal is ignored until the selected setup wins, loses, or is cancelled. After a database reset, live scanning and charting ignore all setups detected before the persisted reset timestamp.

## Portfolio decision

The scanner tracks the selected setup virtually. When it resolves:

- Check means the user took the trade; the result enters portfolio statistics and history.
- Cross means the user did not take the trade; it remains in signal history but does not affect portfolio statistics.
- A filled cancellation also receives Check/Cross and carries its actual partial R and P/L. An unfilled cancellation is recorded automatically at `0R` without a portfolio decision.

## Chart display policy

The single selected live setup retains its entry, stop, target, and risk/reward shading while waiting or active. Won, lost, and cancelled live levels are removed immediately. In backtesting, selecting a completed journal row restores that trade's entry, stop, target, and shading for review. Entry, stop, and target use viewport-wide price lines so they remain visible while navigating left or right. The reward area is translucent green from entry to target; the risk area is translucent red from entry to stop.

When a setup first appears, the price scale automatically fits its FVG, entry, stop, and target. The chart toolbar repeats all four numeric levels and provides **Fit setup** to restore the complete risk/reward view after manual vertical navigation. The selected FVG uses stronger shading than contextual gaps.

The setup receives a time-stamped candle tag. A short tag sits above its entry or CHoCH candle; a long tag sits below it.

CHoCH is drawn as an orange dashed break line and marker. Three recent softly shaded, direction-colored FVG zones remain visible for context, along with the selected setup if its originating CHoCH has moved outside the one-hour window. Compact labeled trend lines connect the latest swing highs and swing lows. Colors and annotation hierarchy follow TradingView's dark-chart conventions.

The automated indicators do not prevent chart navigation. Use the mouse wheel to zoom, drag the chart to move through candle history, drag the time or price axis to rescale, and double-click an axis to reset it. Navigating away pauses automatic real-time following; **Latest candles** returns to the live edge.

## Known limitations

- Fees, funding, spread, and slippage are excluded.
- The scanner currently runs when the dashboard requests a scan; an always-on background worker is still planned.
- A maximum of 1,000 one-minute candles is evaluated per scan due to the upstream endpoint limit.
- Each backtest randomly selects a historical endpoint between two days and two years ago, then loads the chosen 500, 800, or 1,000-candle sample plus a 12-hour structural warm-up.
- Strategy behavior should be reviewed visually against known examples before being treated as production trading guidance.
