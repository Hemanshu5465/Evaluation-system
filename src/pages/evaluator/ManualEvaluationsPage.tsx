import { useNavigate } from 'react-router-dom'
import { SquarePen } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Avatar, Button, Card, EmptyState } from '@/components/ui/primitives'
import { ManualStatusBadge } from '@/components/shared/StageBadges'
import { useEvaluator } from '@/hooks/useCurrentUser'
import { useAppState } from '@/store/store'
import { students } from '@/store/refs'
export function ManualEvaluationsPage() {
  const evaluator = useEvaluator()
  const state = useAppState()
  const navigate = useNavigate()

  const rows = state.submissions
    .filter((s) => evaluator.assignedStudentIds.includes(s.studentId))
    .map((s) => ({
      s,
      ai: state.aiEvaluations.find((a) => a.submissionId === s.id),
      manual: state.manualEvaluations.find((m) => m.submissionId === s.id),
    }))
    .filter((r) => r.ai?.status === 'completed')

  if (rows.length === 0) {
    return (
      <div>
        <PageHeader title="Manual Evaluations" />
        <EmptyState icon={<SquarePen size={20} />} title="Nothing to grade yet" message="Run AI evaluations first — manual grading unlocks after that." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Manual Evaluations" subtitle="Your private rubric grading. Not visible to students." />
      <div className="grid gap-3">
        {rows.map(({ s, manual }) => {
          const student = students.find((x) => x.id === s.studentId)!
          return (
            <Card key={s.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={student.name} color={student.avatarColor} />
                <div>
                  <p className="text-sm font-semibold text-ink">{student.name}</p>
                  <p className="text-xs text-ink-muted">
                    {manual?.status === 'completed' ? `${manual.total}/${manual.maxTotal}` : 'Not started'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ManualStatusBadge status={manual?.status} />
                <Button variant="ghost" icon={<SquarePen size={14} />} onClick={() => navigate(`/evaluator/manual/${s.id}`)}>
                  {manual?.status === 'completed' ? 'Review' : 'Evaluate'}
                </Button>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
