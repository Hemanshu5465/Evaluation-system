import { cn } from '@/lib/format'

export function BarChart({ data, tone = 'brand', height = 160, suffix = '' }: { data: { label: string; value: number }[]; tone?: 'brand' | 'ai'; height?: number; suffix?: string }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const fill = tone === 'ai' ? 'bg-ai-400' : 'bg-brand-400'
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="group flex flex-1 flex-col items-center gap-1.5">
          <span className="text-[10px] font-semibold text-ink-muted opacity-0 transition-opacity group-hover:opacity-100">
            {d.value}
            {suffix}
          </span>
          <div className="flex w-full flex-1 items-end">
            <div className={cn('w-full rounded-t-md transition-all', fill)} style={{ height: `${(d.value / max) * 100}%`, minHeight: 4 }} />
          </div>
          <span className="truncate text-[10px] text-ink-muted">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

export function LineChart({ data, tone = 'brand', height = 160 }: { data: { label: string; value: number }[]; tone?: 'brand' | 'ai'; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  const min = Math.min(...data.map((d) => d.value), 0)
  const w = 100
  const stroke = tone === 'ai' ? '#7549e3' : '#1c8168'
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w
    const y = 100 - ((d.value - min) / (max - min || 1)) * 100
    return [x, y]
  })
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ')
  const area = `${path} L${w},100 L0,100 Z`
  return (
    <div style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <path d={area} fill={stroke} opacity={0.1} />
        <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={1.6} fill={stroke} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-ink-muted">
        {data.map((d) => (
          <span key={d.label}>{d.label}</span>
        ))}
      </div>
    </div>
  )
}

export function DonutChart({ segments, size = 140 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1
  const r = size / 2 - 10
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="-rotate-90 shrink-0">
        {segments.map((s) => {
          const len = (s.value / total) * c
          const el = (
            <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={12} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />
          )
          offset += len
          return el
        })}
      </svg>
      <ul className="space-y-1.5 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-ink-soft">{s.label}</span>
            <span className="font-semibold text-ink">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
