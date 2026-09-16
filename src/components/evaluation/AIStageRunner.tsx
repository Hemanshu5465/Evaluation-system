import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/format'

export function AIStageRunner({ stages, currentIndex }: { stages: string[]; currentIndex: number }) {
  return (
    <div className="rounded-xl border border-ai-200 bg-gradient-to-b from-ai-50/70 to-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ai-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ai-500" />
        </span>
        <p className="text-sm font-semibold text-ai-800">AI Evaluation in Progress</p>
      </div>
      <ol className="space-y-1">
        {stages.map((s, i) => {
          const done = i < currentIndex
          const active = i === currentIndex
          return (
            <li
              key={s}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active && 'bg-ai-100/70 font-semibold text-ai-900',
                done && 'text-ink-soft',
                !done && !active && 'text-ink-muted',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]',
                  done && 'border-emerald-500 bg-emerald-500 text-white',
                  active && 'border-ai-500 bg-ai-500 text-white',
                  !done && !active && 'border-line',
                )}
              >
                {done ? <Check size={11} /> : active ? <Loader2 size={11} className="animate-spin" /> : i + 1}
              </span>
              {s}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
