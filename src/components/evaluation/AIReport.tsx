import { CheckCircle2, Lightbulb, TriangleAlert } from 'lucide-react'
import type { AIEvaluation } from '@/types'
import { ScoreRing } from '@/components/shared/ScoreRing'
import { Progress } from '@/components/ui/primitives'
import { TestCaseList } from './TestCaseList'
import { AIContentIndicator } from './AIContentIndicator'

export function AIReport({ evaluation, showTestCases = true }: { evaluation: AIEvaluation; showTestCases?: boolean }) {
  return (
    <div className="space-y-6">
      {/* score */}
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
          <div className="flex gap-4 pt-2 text-xs text-ink-muted">
            <span>
              Confidence <span className="font-semibold text-ink-soft">{evaluation.confidence}%</span>
            </span>
          </div>
        </div>
      </div>

      {showTestCases && <TestCaseList cases={evaluation.testCases} />}

      <AIContentIndicator probability={evaluation.aiContentProbability} classification={evaluation.aiContentClassification} />

      <div className="grid gap-3 sm:grid-cols-3">
        <ListBlock title="Strengths" icon={<CheckCircle2 size={15} className="text-emerald-600" />} items={evaluation.strengths} tone="bg-emerald-50" />
        <ListBlock title="Issues" icon={<TriangleAlert size={15} className="text-amber-600" />} items={evaluation.issues} tone="bg-amber-50" />
        <ListBlock title="Recommendations" icon={<Lightbulb size={15} className="text-ai-600" />} items={evaluation.recommendations} tone="bg-ai-50" />
      </div>

      <div>
        <h4 className="mb-1.5 text-sm font-semibold text-ink">Evaluation Summary</h4>
        <p className="rounded-xl border border-line bg-card p-4 text-[13px] leading-relaxed text-ink-soft">{evaluation.summary}</p>
      </div>
    </div>
  )
}

function ListBlock({ title, icon, items, tone }: { title: string; icon: React.ReactNode; items: string[]; tone: string }) {
  return (
    <div className={`rounded-xl border border-line ${tone} p-3.5`}>
      <div className="mb-2 flex items-center gap-1.5">
        {icon}
        <h5 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{title}</h5>
      </div>
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
