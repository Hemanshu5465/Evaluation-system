import { Link } from 'react-router-dom'
import { FileStack } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge, Card, EmptyState } from '@/components/ui/primitives'
import { SubmissionStageBadge } from '@/components/shared/StageBadges'
import { useStudent } from '@/hooks/useCurrentUser'
import { useAppState } from '@/store/store'
import { fmtDateTime } from '@/lib/format'

export function StudentSubmissionsPage() {
  const student = useStudent()
  const state = useAppState()
  const subs = state.submissions.filter((s) => s.studentId === student.id && s.stage !== 'not_started')
  const psubs = state.projectSubmissions.filter((p) => p.studentId === student.id && p.stage !== 'not_started')

  const items = [
    ...subs.map((sub) => {
      const a = state.assessments.find((x) => x.id === sub.assessmentId)
      return {
        id: sub.id,
        kind: 'Assessment',
        title: a?.title ?? 'Scenario Assessment',
        file: sub.zipName,
        at: sub.submittedAt,
        stage: sub.stage,
        to: `/student/assessments/${sub.assessmentId}`,
      }
    }),
    ...psubs.map((psub) => {
      const p = state.projects.find((x) => x.id === psub.projectId)
      return {
        id: psub.id,
        kind: 'Project',
        title: p?.title ?? 'Project',
        file: psub.zipName,
        at: psub.submittedAt,
        stage: psub.stage,
        to: '/student/project',
      }
    }),
  ]

  if (items.length === 0) {
    return (
      <div>
        <PageHeader title="Submissions" />
        <EmptyState icon={<FileStack size={20} />} title="No submissions yet" message="Once you submit a solution or project it will appear here with its status." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Submissions" subtitle="Everything you've submitted and where it is in the pipeline." />
      <div className="grid gap-3">
        {items.map((it) => (
          <Link key={it.id} to={it.to} className="card flex items-center justify-between gap-3 p-4 hover:shadow-lift">
            <div>
              <div className="flex items-center gap-2">
                <Badge tone={it.kind === 'Project' ? 'ai' : 'brand'}>{it.kind}</Badge>
                <p className="text-sm font-semibold text-ink">{it.title}</p>
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                <span className="font-mono">{it.file}</span> · {fmtDateTime(it.at)}
              </p>
            </div>
            <SubmissionStageBadge stage={it.stage as never} />
          </Link>
        ))}
      </div>
    </div>
  )
}
