import { useEffect, useRef, useState } from 'react'
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
  alignedSetupIds?: string[]
}

const chartCandle = (candle: Candle): CandlestickData<Time> => ({
  time: candle.time as Time,
  open: candle.open,
  high: candle.high,
  low: candle.low,
  close: candle.close,
})

const setupTimeLabel = (time: number) => new Date(time * 1000).toLocaleTimeString([], {
  hour: '2-digit',
  minute: '2-digit',
})

export function CandleChart({ candles, analysis, tradeSetups = [], alignedSetupIds }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const overlaySeriesRef = useRef<Array<ISeriesApi<'Line'> | ISeriesApi<'Baseline'>>>([])
  const markerPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const lastSeriesTimeRef = useRef<number | null>(null)
  const followLatestRef = useRef(true)
  const [isFollowingLatest, setIsFollowingLatest] = useState(true)
  const visibleSetups = tradeSetups.filter((setup) => setup.status === 'open' || setup.status === 'filled')
  const alignedSetupIdSet = new Set(alignedSetupIds ?? visibleSetups.map((setup) => setup.id))

  const showLatestCandles = () => {
    const chart = chartRef.current
    if (!chart || candles.length === 0) return
    followLatestRef.current = true
    setIsFollowingLatest(true)
    chart.priceScale('right').applyOptions({ autoScale: true })
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 140), to: candles.length + 4 })
  }

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 510,
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#b2b5be',
        fontFamily: 'Inter, ui-sans-serif, system-ui',
      },
      grid: {
        vertLines: { color: '#242832' },
        horzLines: { color: '#242832' },
      },
      crosshair: {
        vertLine: { color: '#5f6b82', labelBackgroundColor: '#252b37' },
        horzLine: { color: '#5f6b82', labelBackgroundColor: '#252b37' },
      },
      rightPriceScale: { borderColor: '#2a2e39', scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: { time: true, price: true },
      },
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
    })
    chartRef.current = chart
    seriesRef.current = series

    markerPluginRef.current = createSeriesMarkers(series, [])

    const handleVisibleRangeChange = () => {
      const followingLatest = chart.timeScale().scrollPosition() <= 0
      followLatestRef.current = followingLatest
      setIsFollowingLatest(followingLatest)
    }
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange)

    const observer = new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth }))
    observer.observe(container)

    return () => {
      observer.disconnect()
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange)
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      markerPluginRef.current = null
      overlaySeriesRef.current = []
      lastSeriesTimeRef.current = null
      followLatestRef.current = true
    }
  }, [])

  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return
    const latestCandle = candles.at(-1)!
    const lastSeriesTime = lastSeriesTimeRef.current
    const lastSeriesIndex = lastSeriesTime === null
      ? -1
      : candles.findIndex((candle) => candle.time === lastSeriesTime)

    if (lastSeriesTime === null || lastSeriesIndex === -1 || latestCandle.time < lastSeriesTime) {
      seriesRef.current.setData(candles.map(chartCandle))
      chartRef.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 140), to: candles.length + 4 })
    } else {
      candles.slice(lastSeriesIndex).forEach((candle) => seriesRef.current?.update(chartCandle(candle)))
      if (followLatestRef.current) chartRef.current?.timeScale().scrollToRealTime()
    }
    lastSeriesTimeRef.current = latestCandle.time
  }, [candles])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !analysis) return
    overlaySeriesRef.current.forEach((series) => chart.removeSeries(series))
    overlaySeriesRef.current = []

    const latestTime = candles.at(-1)?.time ?? 0
    const oneHourAgo = latestTime - 60 * 60
    const recentSwings = analysis.swings.slice(-8)
    ;(['high', 'low'] as const).forEach((type) => {
      const points = recentSwings.filter((swing) => swing.type === type)
      for (let index = 1; index < points.length; index += 1) {
        const line = chart.addSeries(LineSeries, {
          color: type === 'high' ? 'rgba(239, 83, 80, .72)' : 'rgba(41, 98, 255, .78)',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          title: index === points.length - 1 ? (type === 'high' ? 'Trend resistance' : 'Trend support') : '',
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
      [...recentGaps, ...visibleSetups].map((gap) => [gap.id, gap]),
    ).values()]
    displayedGaps.forEach((gap) => {
      const zoneColor = gap.direction === 'long' ? '38, 166, 154' : '239, 83, 80'
      const zone = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: gap.bottom },
        relativeGradient: true,
        topFillColor1: `rgba(${zoneColor}, .10)`,
        topFillColor2: `rgba(${zoneColor}, .03)`,
        topLineColor: `rgba(${zoneColor}, 0)`,
        bottomFillColor1: `rgba(${zoneColor}, .03)`,
        bottomFillColor2: `rgba(${zoneColor}, .10)`,
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
    })

    visibleSetups.forEach((activeSetup) => {
      const setupLabel = setupTimeLabel(activeSetup.choch.time)
      const bandStart = (activeSetup.entryTime ?? activeSetup.startTime) as Time
      const bandEnd = activeSetup.endTime as Time
      const rewardBand = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: activeSetup.midpoint },
        relativeGradient: true,
        topFillColor1: 'rgba(38, 166, 154, .24)',
        topFillColor2: 'rgba(38, 166, 154, .09)',
        topLineColor: 'rgba(57, 217, 138, 0)',
        bottomFillColor1: 'rgba(38, 166, 154, .09)',
        bottomFillColor2: 'rgba(38, 166, 154, .24)',
        bottomLineColor: 'rgba(57, 217, 138, 0)',
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
        autoscaleInfoProvider: () => null,
      })
      rewardBand.setData([
        { time: bandStart, value: activeSetup.targetPrice },
        { time: bandEnd, value: activeSetup.targetPrice },
      ])
      overlaySeriesRef.current.push(rewardBand)

      const riskBand = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: activeSetup.midpoint },
        relativeGradient: true,
        topFillColor1: 'rgba(239, 83, 80, .24)',
        topFillColor2: 'rgba(239, 83, 80, .09)',
        topLineColor: 'rgba(255, 92, 108, 0)',
        bottomFillColor1: 'rgba(239, 83, 80, .09)',
        bottomFillColor2: 'rgba(239, 83, 80, .24)',
        bottomLineColor: 'rgba(255, 92, 108, 0)',
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
        autoscaleInfoProvider: () => null,
      })
      riskBand.setData([
        { time: bandStart, value: activeSetup.stopPrice },
        { time: bandEnd, value: activeSetup.stopPrice },
      ])
      overlaySeriesRef.current.push(riskBand)

      const levels = [
        { price: activeSetup.midpoint, title: `${setupLabel} ENTRY`, color: '#dfbb74', style: LineStyle.Solid },
        { price: activeSetup.stopPrice, title: `${setupLabel} STOP · −1R`, color: '#ff5c6c', style: LineStyle.Solid },
        { price: activeSetup.targetPrice, title: `${setupLabel} TARGET · +4R`, color: '#39d98a', style: LineStyle.Solid },
      ]
      const levelHost = chart.addSeries(LineSeries, {
        color: 'rgba(0, 0, 0, 0)',
        lineVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        autoscaleInfoProvider: () => null,
      })
      overlaySeriesRef.current.push(levelHost)
      levels.forEach((level) => {
        levelHost.createPriceLine({
          price: level.price,
          color: level.color,
          lineWidth: 2,
          lineStyle: level.style,
          lineVisible: true,
          axisLabelVisible: true,
          title: level.title,
        })
      })
    })

    const recentChoch = analysis.chochEvents.filter((event) => event.time >= oneHourAgo)
    const displayedChoch = [...new Map(
      [...recentChoch, ...visibleSetups.map((setup) => setup.choch)].map((event) => [`${event.direction}-${event.time}`, event]),
    ).values()]
    displayedChoch.forEach((event) => {
      const breakLine = chart.addSeries(LineSeries, {
        color: '#ff9800',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        title: `CHoCH ${event.direction === 'long' ? '↑' : '↓'}`,
      })
      breakLine.setData([
        { time: event.brokenSwing.time as Time, value: event.brokenSwing.price },
        { time: event.time as Time, value: event.brokenSwing.price },
      ])
      overlaySeriesRef.current.push(breakLine)
    })
    const chochMarkers = displayedChoch.map((event) => ({
      time: event.time as Time,
      position: event.direction === 'long' ? 'belowBar' as const : 'aboveBar' as const,
      shape: event.direction === 'long' ? 'arrowUp' as const : 'arrowDown' as const,
      color: '#ff9800',
      text: 'CHoCH',
    }))
    const setupMarkers = visibleSetups.map((setup) => ({
      time: (setup.entryTime ?? setup.choch.time) as Time,
      position: setup.direction === 'long' ? 'belowBar' as const : 'aboveBar' as const,
      shape: 'square' as const,
      color: alignedSetupIdSet.has(setup.id) ? '#39d98a' : '#dfbb74',
      text: `${setupTimeLabel(setup.choch.time)} ${setup.direction.toUpperCase()} · ${setup.status === 'filled' ? 'ACTIVE' : 'WAITING'}`,
    }))
    markerPluginRef.current?.setMarkers([...chochMarkers, ...setupMarkers].sort((a, b) => Number(a.time) - Number(b.time)))
  }, [analysis, tradeSetups, alignedSetupIds])

  return (
    <div className="chart-wrap">
      <div className="chart-auto-label"><i />Automated strategy view</div>
      <div className="chart-navigation">
        <span>Wheel: zoom · Drag: move · Drag axes: scale · Double-click axes: reset</span>
        {visibleSetups.length > 0 && (
          <b className="chart-setup-state aligned">
            {visibleSetups.filter((setup) => setup.status === 'filled').length} active · {visibleSetups.filter((setup) => setup.status === 'open').length} waiting
          </b>
        )}
        {!isFollowingLatest && <button type="button" onClick={showLatestCandles}>Latest candles</button>}
      </div>
      <div className="chart-canvas" ref={containerRef} />
    </div>
  )
}
