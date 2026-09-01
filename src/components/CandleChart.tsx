import { useEffect, useRef } from 'react'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts'
import type { Candle } from '../types'

interface CandleChartProps {
  candles: Candle[]
}

const chartCandle = (candle: Candle): CandlestickData<Time> => ({
  time: candle.time as Time,
  open: candle.open,
  high: candle.high,
  low: candle.low,
  close: candle.close,
})

export function CandleChart({ candles }: CandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

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

    const observer = new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth }))
    observer.observe(container)

    return () => {
      observer.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return
    seriesRef.current.setData(candles.map(chartCandle))
    chartRef.current?.timeScale().fitContent()
  }, [candles])

  return <div className="chart-canvas" ref={containerRef} />
}
