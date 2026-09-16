import { cn } from '@/lib/format'

export function ScoreRing({
  value,
  max = 100,
  size = 132,
  tone = 'ai',
  label = 'AI Score',
}: {
  value: number
  max?: number
  size?: number
  tone?: 'ai' | 'brand'
  label?: string
}) {
  const pct = Math.round((value / max) * 100)
  const r = size / 2 - 10
  const c = 2 * Math.PI * r
  const stroke = tone === 'ai' ? '#7549e3' : '#1c8168'
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e4ded2" strokeWidth={10} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * pct) / 100}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={cn('font-display text-3xl font-semibold', tone === 'ai' ? 'text-ai-700' : 'text-brand-700')}>{value}</span>
        <span className="text-xs text-ink-muted">/ {max}</span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{label}</span>
      </div>
    </div>
  )
}
