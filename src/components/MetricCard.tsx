interface MetricCardProps {
  eyebrow: string
  value: string
  detail: string
  tone?: 'positive' | 'negative' | 'neutral'
  featured?: boolean
}

export function MetricCard({ eyebrow, value, detail, tone = 'neutral', featured }: MetricCardProps) {
  return (
    <article className={`metric-card ${featured ? 'featured' : ''}`}>
      <div className="metric-eyebrow">{eyebrow}</div>
      <div className={`metric-value ${tone}`}>{value}</div>
      <div className="metric-detail">{detail}</div>
    </article>
  )
}
