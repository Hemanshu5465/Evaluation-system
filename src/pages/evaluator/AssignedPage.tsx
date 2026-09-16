import { PageHeader } from '@/components/shared/PageHeader'
import { Badge, Card } from '@/components/ui/primitives'
import { useEvaluator } from '@/hooks/useCurrentUser'
import { useAppState } from '@/store/store'
import { fmtDate } from '@/lib/format'

export function AssignedPage() {
  const evaluator = useEvaluator()
  const state = useAppState()
  const assessments = state.assessments.filter((a) => a.assignedEvaluatorId === evaluator.id)

  return (
    <div>
      <PageHeader title="Assigned Assessments" subtitle="Assessments you are responsible for evaluating." />
      <div className="grid gap-4">
        {assessments.map((a) => {
          const mine = a.studentIds.filter((id) => evaluator.assignedStudentIds.includes(id))
          const subs = state.submissions.filter((s) => s.assessmentId === a.id && mine.includes(s.studentId))
          const submitted = subs.filter((s) => s.stage !== 'not_started').length
          const done = subs.filter((s) => s.published).length
          return (
            <Card key={a.id}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">{a.title}</h3>
                <Badge tone={a.status === 'published' ? 'green' : 'amber'}>{a.status}</Badge>
              </div>
              <p className="mt-1 text-xs text-ink-muted">Deadline {fmtDate(a.deadline)} · {mine.length} assigned students</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label="Assigned" value={mine.length} />
                <Stat label="Submitted" value={submitted} tone="amber" />
                <Stat label="Published" value={done} tone="green" />
              </div>
            </Card>
          )
        })}
        {assessments.length === 0 && <p className="text-sm text-ink-muted">No assessments assigned to you.</p>}
      </div>
    </div>
  )
}

function Stat({ label, value, tone = 'brand' }: { label: string; value: number; tone?: 'brand' | 'amber' | 'green' }) {
  const c = { brand: 'text-brand-700', amber: 'text-amber-700', green: 'text-emerald-700' }[tone]
  return (
    <div className="rounded-lg bg-paper py-2">
      <p className={`font-display text-xl font-semibold ${c}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</p>
    </div>
  )
}
