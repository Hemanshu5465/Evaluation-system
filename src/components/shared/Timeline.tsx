import { Check } from 'lucide-react'
import { cn } from '@/lib/format'

export interface TimelineStep {
  label: string
  state: 'done' | 'current' | 'todo'
}

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => (
        <li key={s.label} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold',
                s.state === 'done' && 'border-brand-600 bg-brand-600 text-white',
                s.state === 'current' && 'animate-pulse-ring border-ai-500 bg-ai-500 text-white',
                s.state === 'todo' && 'border-line bg-card text-ink-muted',
              )}
            >
              {s.state === 'done' ? <Check size={14} /> : s.state === 'current' ? '●' : i + 1}
            </span>
            {i < steps.length - 1 && (
              <span className={cn('my-1 w-0.5 flex-1', s.state === 'done' ? 'bg-brand-400' : 'bg-line')} style={{ minHeight: 24 }} />
            )}
          </div>
          <div className={cn('pb-6 pt-1 text-sm', s.state === 'todo' ? 'text-ink-muted' : 'font-medium text-ink')}>{s.label}</div>
        </li>
      ))}
    </ol>
  )
}
