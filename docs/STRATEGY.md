# Structural CHoCH and Fair Value Gap Strategy

This document is the executable interpretation currently shared by the automated chart, live scanner, notification tracker, and backtester.

## Timeframes

- `BTCUSDT` Bybit linear perpetual only.
- The 15-minute chart supplies directional context and alignment status.
- The 1-minute chart generates entries.
- Only closed candles create pivots, BOS, CHoCH, FVGs, or new predictions. Once a prediction exists, the live candle's current wick can fill entry or hit TP/SL immediately without waiting for close.
- Every setup stores the 15-minute bias already known at its timestamp. Future bias is never applied retroactively, but an opposing bias no longer hides or independently schedules a second trade.

## Swing structure

A swing uses a one-candle pivot by default:

- Swing high: its high exceeds both highs on each side.
- Swing low: its low is below both lows on each side.
- Higher high plus higher low establishes upward structure.
- Lower high plus lower low establishes downward structure.

The one-candle confirmation means a pivot is known after the next candle closes. This prevents BOS markers from appearing one candle late, as in the reviewed 05:55/05:56 example.

## Break of Structure (BOS) and trend lines

- Bullish structure is low → high → higher low → higher high. The higher high passing the preceding high confirms bullish BOS. Its trend line connects the bottom-most confirmed low of the move to the bullish reversal candle after the later higher-low pivot.
- Bearish structure is high → low → lower high → lower low. The lower low passing the preceding low confirms bearish BOS. Its trend line connects the top-most confirmed high of the move to the bearish reversal candle after the later lower-high pivot.
- A tiny wick excursion of less than `0.005%` beyond the structural level is treated as noise rather than BOS. This distinguishes the reviewed 05:43 probe from the 05:44 break while retaining the 05:48 and 05:55 breaks.
- When later BOS events offer another line from the same CHoCH anchor, the engine retains the lower projected boundary: the shallower bullish support or steeper bearish resistance. This preserves the reviewed bullish line from the 05:28 low to the 05:47 reversal instead of replacing it with the steeper internal 05:54 low.
- The chart shows only the latest confirmed bullish and latest confirmed bearish trend line for each timeframe, when available.
- The 15-minute trend line is higher-timeframe direction context. The 1-minute trend line creates the actionable structure; counter-trend 1-minute setups remain possible because retracements can oppose the larger trend temporarily.
- A BOS continuation searches the push from the second trend-line pivot through BOS for a matching FVG and predicts a return to its midpoint.

## Change of Character (CHoCH)

- Swing structure first establishes whether the move is upward or downward.
- During a downward structural leg, a higher-high reversal that closes through the active bearish trend line creates bullish CHoCH.
- During an upward structural leg, a lower-low reversal that closes through the active bullish trend line creates bearish CHoCH. The preceding upward candle identifies the high between the low and new lower low, avoiding repeated CHoCH markers during a continuing decline.
- A bullish CHoCH seeds its next bullish trend line from the lowest wick before the break. A bearish CHoCH seeds its next bearish line from the highest wick before the break. New BOS structure must form after the CHoCH before that seeded anchor can publish another setup.
- The latest confirmed opposing swing before CHoCH is the stop's invalidation extreme. Its wick supplies the lowest point for a bullish setup or highest point for a bearish setup.
- Pivots and lower-low/higher-high comparisons use candle wicks; CHoCH additionally requires the confirming candle to close through the projected trend line.

## Fair Value Gap (FVG)

The structural leg from the invalidation swing through BOS or CHoCH must contain a three-candle wick imbalance. A structural event without an FVG does not create an entry:

- Bullish FVG: the following candle's low is above the preceding candle's high.
- Bearish FVG: the following candle's high is below the preceding candle's low.
- Every finalized wick gap is detected independently from setup eligibility and may be shaded for context. The one-slot rule can prevent a valid FVG from becoming a second prediction while another setup is unresolved.
- An FVG established at least one full closed candle before CHoCH is preferred. If several qualify, the widest gap is the most relevant displacement zone and a tie uses the nearest gap. If none was already established, a valid CHoCH-centered FVG may be used after its third candle closes.
- The 50% midpoint between the two FVG boundaries becomes a predicted entry line only after both CHoCH and the complete three-candle FVG are confirmed.
- Entry occurs only when a later one-minute candle returns to and touches that midpoint. A candle used to form the structural event or FVG can never retroactively fill the trade; a still-forming later candle can fill it from its wick.
- No newer setup is considered while the selected setup is waiting for entry or active after entry.

In the 06:39 long example, the preferred established FVG is 06:34/06:35/06:36. Its boundaries are 77,490.6 and 77,500.0, giving a midpoint entry of 77,495.3. The 06:34 invalidation wick is 77,408.3 and the buffered stop is 77,404.2. The earlier 01:27 example remains valid when no earlier established FVG exists and the CHoCH candle itself is the middle displacement candle.

In the reviewed 03:33/03:34/03:35 bearish example, the outer wicks leave a gap from 77,677.0 to 77,692.6, whose exact midpoint is 77,684.8 (the visually estimated 77,684.3). It remains a valid contextual FVG even if an older active trade prevents a second pullback prediction.

This is the current precise interpretation of the requested gap inside the CHoCH move. It can be adjusted if a different wick/body definition is intended.

## Risk and outcome

- Bullish stop: near and below the latest confirmed opposing swing wick before the structural break, buffered by 8% of that candle's full high-low range.
- Bearish stop: near and above the latest confirmed opposing swing wick before the structural break, buffered by 8% of that candle's full high-low range.
- `1R` is the distance from FVG midpoint entry to that stop.
- Target is exactly `4R` from entry.
- If one candle contains both stop and target, the engine records the stop first (`−1R`) because candle data cannot reveal intrabar ordering.
- A filled trade has no candle timeout. It remains active until its stop or target is reached.
- An unfilled prediction remains valid for 60 subsequent one-minute candles. A touch on the 60th candle is accepted; if that candle also misses, the prediction is cancelled at `0R` and the setup slot becomes available.
- If price reaches the target before returning to the midpoint entry, the prediction is closed as `missed`/`skipped` at `0R`. It is not counted as a trade, win, or loss because no post-CHoCH entry occurred.
- The USD value of `1R` defaults to `STRATEGY_RISK_USD=100` in `.env`.

## Direction filter

Every 1-minute setup is processed chronologically through the same persisted trade slot. The 15-minute direction is recorded as context: aligned setups are green and counter-bias setups are gold. Both use the same slot, preventing the chart and PostgreSQL scanner from selecting different overlapping trades. A later signal is ignored until the selected prediction is missed or its filled trade wins or loses.

## Portfolio decision

The notification board contains only waiting pullback predictions and active entries. Finished results move automatically into history. When a filled setup resolves:

- Check means the user took the trade; the result enters portfolio statistics and history.
- Cross means the user did not take the trade; it remains in signal history but does not affect portfolio statistics.
- The automatic strategy win rate counts the result even when neither button is used. Check/Cross affects only the personal portfolio statistics.
- Version-8 waiting predictions that expire are shown in history as cancelled at `0R`; they do not affect strategy or portfolio win rate. Unresolved version-7 setups are reconciled before a new version-8 slot can start.

## Chart display policy

The single selected live setup shows its FVG and midpoint entry while waiting for a pullback. Stop, target, and risk/reward shading remain hidden until a later candle fills the midpoint and the trade becomes open. At that point, entry/stop/target use viewport-wide price lines, the reward area is translucent green, and the risk area is translucent red. Won, lost, and missed live levels are removed immediately. In backtesting, selecting a completed journal row restores all trade levels and shading for review.

When a prediction first appears, the price scale fits its FVG and entry. Once entry fills, it refits to include stop and target. The toolbar explicitly says **Waiting for pullback** or **Trade open**, repeats only the currently applicable levels, and provides **Fit setup** after manual vertical navigation. The selected FVG uses stronger shading than contextual gaps.

The setup receives a time-stamped candle tag. A short tag sits above its entry or CHoCH candle; a long tag sits below it.

CHoCH and BOS are shown as compact labeled arrow/circle markers attached to their confirming candles. They do not add break lines or labels to the right-side price scale. The active-setup tag shows time, direction, and lifecycle without repeating the structure type. Confirmed 1-minute trend lines connect the structural lows or highs and the latest 15-minute line is overlaid in violet as higher-timeframe context. Three recent softly shaded FVG zones remain visible alongside the selected setup.

The automated indicators do not prevent chart navigation. Use the mouse wheel to zoom, drag the chart to move through candle history, drag the time or price axis to rescale, and double-click an axis to reset it. Navigating away pauses automatic real-time following; **Latest candles** returns to the live edge.

## Known limitations

- Fees, funding, spread, and slippage are excluded.
- Railway runs the scanner in a sequential 60-second background loop; the browser also supports a manual scan.
- A maximum of 1,000 one-minute candles is evaluated per scan due to the upstream endpoint limit.
- Each backtest randomly selects a historical endpoint between two days and two years ago, then loads the chosen 500, 800, or 1,000-candle sample plus a 12-hour structural warm-up.
- Strategy behavior should be reviewed visually against known examples before being treated as production trading guidance.
