import { PageHeader } from '@/components/shared/PageHeader'
import { Avatar, Badge, Card, EmptyState } from '@/components/ui/primitives'
import { BarChart3 } from 'lucide-react'
import { useEvaluator } from '@/hooks/useCurrentUser'
import { useAppState } from '@/store/store'
import { students } from '@/store/refs'
import { fmtDate } from '@/lib/format'

export function PublishedResultsPage() {
  const evaluator = useEvaluator()
  const state = useAppState()
  const rows = state.submissions
    .filter((s) => evaluator.assignedStudentIds.includes(s.studentId) && s.published)
    .map((s) => ({
      s,
      ai: state.aiEvaluations.find((a) => a.submissionId === s.id),
      manual: state.manualEvaluations.find((m) => m.submissionId === s.id),
    }))

  if (rows.length === 0) {
    return (
      <div>
        <PageHeader title="Published Results" />
        <EmptyState icon={<BarChart3 size={20} />} title="Nothing published yet" message="Once you publish an evaluation it appears here with both scores." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Published Results" subtitle="AI results released to students. Evaluator scores shown here for your reference only." />
      <div className="grid gap-3">
        {rows.map(({ s, ai, manual }) => {
          const student = students.find((x) => x.id === s.studentId)!
          return (
            <Card key={s.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={student.name} color={student.avatarColor} />
                <div>
                  <p className="text-sm font-semibold text-ink">{student.name}</p>
                  <p className="text-xs text-ink-muted">Published {fmtDate(s.submittedAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="ai">AI {ai?.score}/100</Badge>
                <Badge tone="brand">
                  Evaluator {manual ? `${manual.total}/${manual.maxTotal}` : '—'}
                </Badge>
                <Badge tone="green">Published ✓</Badge>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
