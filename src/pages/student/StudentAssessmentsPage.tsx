import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge, Card } from '@/components/ui/primitives'
import { SubmissionStageBadge } from '@/components/shared/StageBadges'
import { useStudent } from '@/hooks/useCurrentUser'
import { useAppState } from '@/store/store'
import { scenarios } from '@/store/refs'
import { daysUntil, fmtDate } from '@/lib/format'

export function StudentAssessmentsPage() {
  const student = useStudent()
  const state = useAppState()
  const list = state.assessments.filter((a) => a.status === 'published')

  return (
    <div>
      <PageHeader title="My Assessments" subtitle="Scenario-based assessments assigned to you." />
      <div className="grid gap-4">
        {list.map((a) => {
          const submission = state.submissions.find((s) => s.assessmentId === a.id && s.studentId === student.id)
          const scenario = scenarios.find((s) => s.studentId === student.id && s.questionId === a.questionId)
          return (
            <Card key={a.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink">{a.title}</h3>
                <p className="mt-1 text-xs text-ink-muted">
                  Deadline {fmtDate(a.deadline)} · {daysUntil(a.deadline)} days left
                  {scenario && (
                    <>
                      {' '}
                      · Scenario <span className="font-mono">{scenario.scenarioCode}</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <SubmissionStageBadge stage={submission?.stage ?? 'not_started'} />
                <Link to={`/student/assessments/${a.id}`} className="btn-primary">
                  Open <ArrowRight size={15} />
                </Link>
              </div>
            </Card>
          )
        })}
        {list.length === 0 && <p className="text-sm text-ink-muted">No assessments assigned yet.</p>}
      </div>
    </div>
  )
}
