import { useState } from 'react'
import { ArrowLeft, BarChart3, FolderGit2, Lock } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge, Card, EmptyState } from '@/components/ui/primitives'
import { AIReport } from '@/components/evaluation/AIReport'
import { ProjectReport } from '@/components/evaluation/ProjectReport'
import { useStudent } from '@/hooks/useCurrentUser'
import { useAppState } from '@/store/store'
import { projects } from '@/store/refs'
import { fmtDate } from '@/lib/format'

type ResultItem =
  | { kind: 'assessment'; id: string; title: string; subtitle: string; date: string; score: number; max: number }
  | { kind: 'project'; id: string; title: string; subtitle: string; date: string; score: number; max: number }

export function ResultsPage() {
  const student = useStudent()
  const state = useAppState()
  const [openId, setOpenId] = useState<string | null>(null)

  const items: ResultItem[] = []

  for (const sub of state.submissions.filter((s) => s.studentId === student.id && s.published)) {
    const ai = state.aiEvaluations.find((a) => a.submissionId === sub.id)
    if (!ai) continue
    const assessment = state.assessments.find((a) => a.id === sub.assessmentId)
    items.push({
      kind: 'assessment',
      id: sub.id,
      title: assessment?.subjectName ?? sub.assessmentTitle ?? 'Assessment',
      subtitle: 'Scenario-based evaluation',
      date: ai.completedAt ?? sub.submittedAt ?? '',
      score: ai.score,
      max: ai.maxScore,
    })
  }

  for (const psub of state.projectSubmissions.filter((p) => p.studentId === student.id && p.published)) {
    const pe = state.projectEvaluations.find((e) => e.projectSubmissionId === psub.id)
    if (!pe) continue
    items.push({
      kind: 'project',
      id: psub.id,
      title: projects.find((p) => p.id === psub.projectId)?.title ?? 'Project',
      subtitle: 'Project evaluation',
      date: pe.completedAt ?? psub.submittedAt ?? '',
      score: pe.score,
      max: pe.maxScore,
    })
  }

  if (items.length === 0) {
    return (
      <div>
        <PageHeader title="Results" />
        <EmptyState
          icon={<BarChart3 size={20} />}
          title="No published results yet"
          message="Your evaluator reviews the AI evaluation before publishing. Once published, your result appears here as a card — click it to see the full report."
        />
      </div>
    )
  }

  const open = openId ? items.find((i) => i.id === openId) : null

  if (open) {
    const ai = open.kind === 'assessment' ? state.aiEvaluations.find((a) => a.submissionId === open.id) : undefined
    const pe = open.kind === 'project' ? state.projectEvaluations.find((e) => e.projectSubmissionId === open.id) : undefined
    return (
      <div className="space-y-4">
        <button
          onClick={() => setOpenId(null)}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
        >
          <ArrowLeft size={15} /> All results
        </button>
        <PageHeader
          title={open.title}
          subtitle={open.subtitle}
          action={<Badge tone="green">Published</Badge>}
        />

        <Card className="flex items-center gap-2 border-brand-200 bg-brand-50/40 py-3 text-xs text-ink-soft">
          <Lock size={14} className="text-brand-600" />
          This is the AI evaluation your evaluator chose to publish. Their private marks and comments are never shown here.
        </Card>

        {ai && (
          <Card>
            <div className="mb-4 grid gap-2 sm:grid-cols-4">
              {ai.rubric.map((r) => (
                <div key={r.name} className="rounded-xl bg-paper p-3 text-center">
                  <p className="font-display text-xl font-semibold text-ink">
                    {Math.round((r.score / r.maxScore) * 100)}%
                  </p>
                  <p className="text-[11px] text-ink-muted">{r.name}</p>
                </div>
              ))}
            </div>
            <div className="mb-4 flex gap-3 text-sm">
              <Badge tone="green">{ai.testCases.filter((t) => t.passed).length} Passed</Badge>
              <Badge tone="rose">{ai.testCases.filter((t) => !t.passed).length} Failed</Badge>
            </div>
            <AIReport evaluation={ai} />
          </Card>
        )}

        {pe && (
          <Card>
            <ProjectReport evaluation={pe} />
          </Card>
        )}
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Results" subtitle="Published evaluations. Click a result to see the full report." />
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => {
          const pct = item.max ? Math.round((item.score / item.max) * 100) : 0
          return (
            <button
              key={item.id}
              onClick={() => setOpenId(item.id)}
              className="card group flex flex-col gap-3 p-5 text-left transition-shadow hover:shadow-lift"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                  {item.kind === 'project' ? <FolderGit2 size={18} /> : <BarChart3 size={18} />}
                </span>
                <Badge tone="green">Published</Badge>
              </div>
              <div>
                <h3 className="text-base font-semibold text-ink">{item.title}</h3>
                <p className="mt-0.5 text-sm text-ink-muted">{item.subtitle}</p>
              </div>
              <div className="mt-auto flex items-end justify-between">
                <div>
                  <p className="font-display text-2xl font-semibold text-ink">
                    {Math.round(item.score)}
                    <span className="text-sm font-normal text-ink-muted">/{Math.round(item.max)}</span>
                  </p>
                  <p className="text-xs text-ink-muted">{item.date ? fmtDate(item.date) : '—'}</p>
                </div>
                <span className="text-sm font-semibold text-brand-700">{pct}%</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
