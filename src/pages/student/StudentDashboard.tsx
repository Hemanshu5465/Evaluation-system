import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, CalendarDays, FolderGit2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge, Card, EmptyState } from '@/components/ui/primitives'
import { SubmissionStageBadge } from '@/components/shared/StageBadges'
import { useStudent } from '@/hooks/useCurrentUser'
import { useAppState } from '@/store/store'
import { daysUntil, fmtDate } from '@/lib/format'

export function StudentDashboard() {
  const student = useStudent()
  const state = useAppState()

  const assessments = state.assessments
    .filter((a) => a.status === 'published')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const project = state.projects[0] ?? null
  const publishedResults = state.submissions.filter((s) => s.studentId === student.id && s.published).length

  return (
    <div>
      <PageHeader title={`Welcome back, ${student.name.split(' ')[0]}`} subtitle={`Enrollment ${student.studentCode}`} />

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">Your assessments</h2>

      {assessments.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {assessments.map((a) => {
            const submission = state.submissions.find((s) => s.assessmentId === a.id && s.studentId === student.id)
            const scenario = state.scenarios.find(
              (s) => s.studentId === student.id && (s.questionId === a.questionId || !s.questionId),
            )
            const deadlineSoon = a.deadline && daysUntil(a.deadline) < 5
            return (
              <Link
                key={a.id}
                to={`/student/assessments/${a.id}`}
                className="card group flex flex-col gap-3 p-5 transition-shadow hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                    <BookOpen size={18} />
                  </span>
                  <SubmissionStageBadge stage={submission?.stage ?? 'not_started'} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-ink">{a.subjectName}</h3>
                  <p className="mt-0.5 text-sm text-ink-muted">{a.title}</p>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  {a.deadline && (
                    <Badge tone={deadlineSoon ? 'amber' : 'neutral'}>
                      <CalendarDays size={12} className="mr-1" />
                      {fmtDate(a.deadline)}
                    </Badge>
                  )}
                  {scenario && <span className="font-mono">{scenario.scenarioCode}</span>}
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 group-hover:gap-1.5">
                  {submission && submission.stage !== 'not_started' ? 'View question' : 'Open question'}
                  <ArrowRight size={15} />
                </span>
              </Link>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={<CalendarDays size={20} />}
          title="No active assessment"
          message="Your assessment will appear here as a card once an admin publishes it. Click the card to see the question and submit your solution."
        />
      )}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {project ? (
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Project Evaluation</p>
                <h3 className="mt-1 text-base font-semibold text-ink">{project.title}</h3>
              </div>
              <FolderGit2 size={18} className="text-ink-muted" />
            </div>
            <div className="mt-4 flex items-center gap-2 text-sm text-ink-soft">
              <CalendarDays size={15} className="text-ink-muted" />
              Deadline {fmtDate(project.deadline)}
            </div>
            <Link to="/student/project" className="btn-ghost mt-4 w-full">
              Open Project Evaluation
              <ArrowRight size={15} />
            </Link>
          </Card>
        ) : (
          <EmptyState icon={<FolderGit2 size={20} />} title="No project assigned" message="Project evaluations you're assigned to will show up here." />
        )}

        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Results available</p>
          <p className="mt-1 font-display text-xl font-semibold text-ink">{publishedResults}</p>
          <Link to="/student/results" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
            View results <ArrowRight size={13} />
          </Link>
        </Card>
      </div>
    </div>
  )
}
