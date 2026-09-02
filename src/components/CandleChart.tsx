import { useEffect, useRef } from 'react'
import {
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  createSeriesMarkers,
  createChart,
  LineSeries,
  LineStyle,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
} from 'lightweight-charts'
import type { FairValueGap, StructureAnalysis } from '../lib/structureStrategy'
import type { Candle } from '../types'

interface CandleChartProps {
  candles: Candle[]
  analysis?: StructureAnalysis
  tradeSetups?: FairValueGap[]
}

const chartCandle = (candle: Candle): CandlestickData<Time> => ({
  time: candle.time as Time,
  open: candle.open,
  high: candle.high,
  low: candle.low,
  close: candle.close,
})

export function CandleChart({ candles, analysis, tradeSetups = [] }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const overlaySeriesRef = useRef<Array<ISeriesApi<'Line'> | ISeriesApi<'Baseline'>>>([])
  const markerPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const firstTimeRef = useRef<number | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 510,
      layout: {
        background: { type: ColorType.Solid, color: '#0e1118' },
        textColor: '#7f8798',
        fontFamily: 'Inter, ui-sans-serif, system-ui',
      },
      grid: {
        vertLines: { color: '#1b202a' },
        horzLines: { color: '#1b202a' },
      },
      crosshair: {
        vertLine: { color: '#5f6b82', labelBackgroundColor: '#252b37' },
        horzLine: { color: '#5f6b82', labelBackgroundColor: '#252b37' },
      },
      rightPriceScale: { borderColor: '#252b37', scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: '#252b37', timeVisible: true, secondsVisible: false },
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#39d98a',
      downColor: '#ff5c6c',
      borderVisible: false,
      wickUpColor: '#39d98a',
      wickDownColor: '#ff5c6c',
      priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
    })
    chartRef.current = chart
    seriesRef.current = series

    chart.applyOptions({ handleScroll: false, handleScale: false })
    markerPluginRef.current = createSeriesMarkers(series, [])

    const observer = new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth }))
    observer.observe(container)

    return () => {
      observer.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      markerPluginRef.current = null
      overlaySeriesRef.current = []
      firstTimeRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return
    const firstTime = candles[0].time
    if (firstTimeRef.current !== firstTime) {
      seriesRef.current.setData(candles.map(chartCandle))
      chartRef.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 140), to: candles.length + 4 })
      firstTimeRef.current = firstTime
    } else {
      seriesRef.current.update(chartCandle(candles.at(-1)!))
      chartRef.current?.timeScale().scrollToRealTime()
    }
  }, [candles])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !analysis) return
    overlaySeriesRef.current.forEach((series) => chart.removeSeries(series))
    overlaySeriesRef.current = []

    const activeSetup = tradeSetups.filter((setup) => setup.status === 'open' || setup.status === 'filled').at(-1)
    const latestTime = candles.at(-1)?.time ?? 0
    const oneHourAgo = latestTime - 60 * 60
    const recentSwings = analysis.swings.slice(-8)
    ;(['high', 'low'] as const).forEach((type) => {
      const points = recentSwings.filter((swing) => swing.type === type)
      for (let index = 1; index < points.length; index += 1) {
        const line = chart.addSeries(LineSeries, {
          color: type === 'high' ? 'rgba(255, 92, 108, .55)' : 'rgba(57, 217, 138, .55)',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          title: index === points.length - 1 ? (type === 'high' ? 'Swing-high trend' : 'Swing-low trend') : '',
        })
        line.setData([
          { time: points[index - 1].time as Time, value: points[index - 1].price },
          { time: points[index].time as Time, value: points[index].price },
        ])
        overlaySeriesRef.current.push(line)
      }
    })

    const recentGaps = analysis.fairValueGaps.filter((gap) => gap.choch.time >= oneHourAgo).slice(-3)
    const displayedGaps = [...new Map(
      [...recentGaps, ...(activeSetup ? [activeSetup] : [])].map((gap) => [gap.id, gap]),
    ).values()].slice(-3)
    displayedGaps.forEach((gap) => {
      const zoneColor = gap.direction === 'long' ? '57, 217, 138' : '255, 92, 108'
      const zone = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: gap.bottom },
        relativeGradient: true,
        topFillColor1: `rgba(${zoneColor}, .12)`,
        topFillColor2: `rgba(${zoneColor}, .04)`,
        topLineColor: `rgba(${zoneColor}, 0)`,
        bottomFillColor1: `rgba(${zoneColor}, .04)`,
        bottomFillColor2: `rgba(${zoneColor}, .12)`,
        bottomLineColor: `rgba(${zoneColor}, 0)`,
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      zone.setData([
        { time: gap.startTime as Time, value: gap.top },
        { time: gap.endTime as Time, value: gap.top },
      ])
      overlaySeriesRef.current.push(zone)

      ;[gap.top, gap.bottom].forEach((price, boundaryIndex) => {
        const line = chart.addSeries(LineSeries, {
          color: gap.direction === 'long' ? 'rgba(57, 217, 138, .7)' : 'rgba(255, 92, 108, .7)',
          lineWidth: boundaryIndex === 0 ? 2 : 1,
          lineStyle: LineStyle.Dashed,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          title: boundaryIndex === 0 ? `${gap.direction === 'long' ? 'Bull' : 'Bear'} FVG` : '',
        })
        line.setData([
          { time: gap.startTime as Time, value: price },
          { time: gap.endTime as Time, value: price },
        ])
        overlaySeriesRef.current.push(line)
      })
    })

    if (activeSetup) {
      const bandStart = (activeSetup.entryTime ?? activeSetup.startTime) as Time
      const bandEnd = activeSetup.endTime as Time
      const rewardBand = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: activeSetup.midpoint },
        relativeGradient: true,
        topFillColor1: 'rgba(57, 217, 138, .18)',
        topFillColor2: 'rgba(57, 217, 138, .06)',
        topLineColor: 'rgba(57, 217, 138, 0)',
        bottomFillColor1: 'rgba(57, 217, 138, .06)',
        bottomFillColor2: 'rgba(57, 217, 138, .18)',
        bottomLineColor: 'rgba(57, 217, 138, 0)',
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      rewardBand.setData([
        { time: bandStart, value: activeSetup.targetPrice },
        { time: bandEnd, value: activeSetup.targetPrice },
      ])
      overlaySeriesRef.current.push(rewardBand)

      const riskBand = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: activeSetup.midpoint },
        relativeGradient: true,
        topFillColor1: 'rgba(255, 92, 108, .18)',
        topFillColor2: 'rgba(255, 92, 108, .06)',
        topLineColor: 'rgba(255, 92, 108, 0)',
        bottomFillColor1: 'rgba(255, 92, 108, .06)',
        bottomFillColor2: 'rgba(255, 92, 108, .18)',
        bottomLineColor: 'rgba(255, 92, 108, 0)',
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      riskBand.setData([
        { time: bandStart, value: activeSetup.stopPrice },
        { time: bandEnd, value: activeSetup.stopPrice },
      ])
      overlaySeriesRef.current.push(riskBand)

      const levels = [
        { price: activeSetup.midpoint, title: 'ENTRY', color: '#dfbb74', style: LineStyle.Solid },
        { price: activeSetup.stopPrice, title: 'STOP · −1R', color: '#ff5c6c', style: LineStyle.Solid },
        { price: activeSetup.targetPrice, title: 'TARGET · +4R', color: '#39d98a', style: LineStyle.Solid },
      ]
      levels.forEach((level) => {
        const line = chart.addSeries(LineSeries, {
          color: level.color,
          lineWidth: 2,
          lineStyle: level.style,
          lastValueVisible: true,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          title: level.title,
        })
        line.setData([
          { time: activeSetup.startTime as Time, value: level.price },
          { time: activeSetup.endTime as Time, value: level.price },
        ])
        overlaySeriesRef.current.push(line)
      })
    }

    const recentChoch = analysis.chochEvents.filter((event) => event.time >= oneHourAgo)
    const displayedChoch = [...new Map(
      [...recentChoch, ...(activeSetup ? [activeSetup.choch] : [])].map((event) => [`${event.direction}-${event.time}`, event]),
    ).values()]
    markerPluginRef.current?.setMarkers(displayedChoch.map((event) => ({
      time: event.time as Time,
      position: event.direction === 'long' ? 'belowBar' as const : 'aboveBar' as const,
      shape: event.direction === 'long' ? 'arrowUp' as const : 'arrowDown' as const,
      color: event.direction === 'long' ? '#39d98a' : '#ff5c6c',
      text: 'CHoCH',
    })))
  }, [analysis, tradeSetups])

  return (
    <div className="chart-wrap">
      <div className="chart-auto-label"><i />Automated strategy view</div>
      <div className="chart-canvas" ref={containerRef} />
    </div>
  )
}
