import { Check, X } from 'lucide-react'
import type { ProjectEvaluation } from '@/types'
import { ScoreRing } from '@/components/shared/ScoreRing'
import { Progress } from '@/components/ui/primitives'
import { AIContentIndicator } from './AIContentIndicator'
import { cn } from '@/lib/format'

export function ProjectReport({ evaluation }: { evaluation: ProjectEvaluation }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-6 rounded-xl border border-line bg-paper/50 p-5 sm:flex-row">
        <ScoreRing value={evaluation.score} tone="ai" label="AI Score" />
        <div className="w-full flex-1 space-y-2">
          {evaluation.rubric.map((r) => (
            <div key={r.name}>
              <div className="mb-0.5 flex justify-between text-xs">
                <span className="font-medium text-ink-soft">{r.name}</span>
                <span className="font-semibold text-ink">
                  {r.score} / {r.maxScore}
                </span>
              </div>
              <Progress value={(r.score / r.maxScore) * 100} tone="ai" />
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-ink">Automated checks</h4>
        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {evaluation.checks.map((c) => (
            <div key={c.name} className="flex items-start gap-3 px-3.5 py-2.5">
              <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white', c.passed ? 'bg-emerald-500' : 'bg-rose-500')}>
                {c.passed ? <Check size={12} /> : <X size={12} />}
              </span>
              <div>
                <p className="text-sm font-medium text-ink">{c.name}</p>
                <p className="text-xs text-ink-muted">{c.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AIContentIndicator probability={evaluation.aiContentProbability} classification={evaluation.aiContentClassification} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Block title="Strengths" items={evaluation.strengths} tone="bg-emerald-50" />
        <Block title="Issues" items={evaluation.issues} tone="bg-amber-50" />
        <Block title="Recommendations" items={evaluation.recommendations} tone="bg-ai-50" />
      </div>

      <div>
        <h4 className="mb-1.5 text-sm font-semibold text-ink">Evaluation Summary</h4>
        <p className="rounded-xl border border-line bg-card p-4 text-[13px] leading-relaxed text-ink-soft">{evaluation.summary}</p>
      </div>
    </div>
  )
}

function Block({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return (
    <div className={`rounded-xl border border-line ${tone} p-3.5`}>
      <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">{title}</h5>
      <ul className="space-y-1.5 text-[13px] text-ink-soft">
        {items.map((it, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-muted" />
            {it}
          </li>
        ))}
      </ul>
    </div>
  )
}
