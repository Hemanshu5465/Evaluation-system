import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { PageHeader, KpiCard } from '@/components/shared/PageHeader'
import { Avatar, Card } from '@/components/ui/primitives'
import { BarChart, DonutChart } from '@/components/shared/Charts'
import { SubmissionStageBadge } from '@/components/shared/StageBadges'
import { useEvaluator } from '@/hooks/useCurrentUser'
import { useAppState } from '@/store/store'
import { fmtDate } from '@/lib/format'

export function EvaluatorDashboard() {
  const evaluator = useEvaluator()
  const state = useAppState()
  const mine = state.submissions.filter((s) => evaluator.assignedStudentIds.includes(s.studentId))
  const pending = mine.filter((s) => ['sent_to_evaluator', 'submitted'].includes(s.stage)).length
  const aiDone = mine.filter((s) => s.aiScore != null || ['evaluator_review', 'published'].includes(s.stage)).length
  const manualDone = mine.filter((s) => s.manualStatus === 'completed').length
  const published = mine.filter((s) => s.published).length
  const scored = mine.filter((s) => s.aiScore != null).map((s) => s.aiScore as number)
  const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : 0

  const queue = mine.filter((s) => s.stage !== 'not_started').slice(0, 6)
  const perStudent = mine
    .filter((s) => s.aiScore != null)
    .slice(0, 6)
    .map((s) => ({ label: (s.studentName ?? 'Student').split(' ')[0], value: Math.round(s.aiScore as number) }))

  return (
    <div>
      <PageHeader title="Evaluator Dashboard" subtitle={`${evaluator.name} · ${evaluator.department}`} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Assigned Students" value={evaluator.assignedStudentIds.length} />
        <KpiCard label="Pending Reviews" value={pending} tone="amber" />
        <KpiCard label="AI Evaluations" value={aiDone} tone="ai" />
        <KpiCard label="Manual Reviews" value={manualDone} />
        <KpiCard label="Published Results" value={published} tone="brand" />
        <KpiCard label="Average AI Score" value={avg || '—'} hint="/ 100" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Review queue</h3>
            <Link to="/evaluator/submissions" className="text-xs font-semibold text-brand-700 hover:underline">
              All submissions
            </Link>
          </div>
          {queue.length ? (
            <ul className="divide-y divide-line">
              {queue.map((s) => (
                <li key={s.id}>
                  <Link to={`/evaluator/submissions/${s.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                    <Avatar name={s.studentName ?? 'Student'} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{s.studentName ?? 'Student'}</p>
                      <p className="text-xs text-ink-muted">
                        {s.assessmentTitle ?? 'Assessment'} · submitted {fmtDate(s.submittedAt)}
                      </p>
                    </div>
                    <SubmissionStageBadge stage={s.stage} />
                    <ArrowUpRight size={14} className="text-ink-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-ink-muted">No submissions from your assigned students yet.</p>
          )}
        </Card>
        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-semibold text-ink">Pending vs completed</h3>
            <div className="mt-3">
              <DonutChart
                segments={[
                  { label: 'Published', value: published, color: '#1c8168' },
                  { label: 'In review', value: Math.max(0, mine.length - published - pending), color: '#f59e0b' },
                  { label: 'Awaiting', value: pending, color: '#e4ded2' },
                ]}
                size={120}
              />
            </div>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-ink">AI score by student</h3>
            {perStudent.length ? (
              <BarChart data={perStudent} suffix="%" height={110} />
            ) : (
              <p className="py-8 text-center text-xs text-ink-muted">No AI-evaluated submissions yet.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
