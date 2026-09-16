import { PageHeader } from '@/components/shared/PageHeader'
import { Avatar } from '@/components/ui/primitives'
import { DataTable } from '@/components/tables/DataTable'
import { AIStatusBadge, ManualStatusBadge, SubmissionStageBadge } from '@/components/shared/StageBadges'
import { students } from '@/store/refs'
import { useAppState } from '@/store/store'
import { fmtDate } from '@/lib/format'

export function AdminSubmissionsPage() {
  const state = useAppState()
  const rows = state.submissions.map((s) => {
    const student = students.find((x) => x.id === s.studentId)!
    return {
      id: s.id,
      student,
      subject: 'DBMS',
      stage: s.stage,
      submittedAt: s.submittedAt,
      ai: state.aiEvaluations.find((a) => a.submissionId === s.id)?.status,
      manual: state.manualEvaluations.find((m) => m.submissionId === s.id)?.status,
      published: s.published,
    }
  })

  return (
    <div>
      <PageHeader title="Submissions" subtitle="Every submission across the platform, read-only." />
      <DataTable
        rows={rows}
        searchKeys={(r) => `${r.student.name} ${r.student.studentCode}`}
        searchPlaceholder="Search by student…"
        filters={[
          {
            key: 'stage',
            label: 'Status',
            options: [
              { value: 'not_started', label: 'Not submitted' },
              { value: 'submitted', label: 'Submitted' },
              { value: 'ai_evaluation', label: 'AI evaluating' },
              { value: 'evaluator_review', label: 'Evaluator review' },
              { value: 'published', label: 'Published' },
            ],
          },
        ]}
        columns={[
          {
            key: 'student',
            header: 'Student',
            sortValue: (r) => r.student.name,
            render: (r) => (
              <div className="flex items-center gap-2.5">
                <Avatar name={r.student.name} color={r.student.avatarColor} size={30} />
                <div>
                  <p className="font-semibold text-ink">{r.student.name}</p>
                  <p className="text-xs text-ink-muted">{r.student.studentCode}</p>
                </div>
              </div>
            ),
          },
          { key: 'subject', header: 'Subject', render: () => 'DBMS Assessment' },
          { key: 'submittedAt', header: 'Submitted', sortValue: (r) => r.submittedAt ?? '', render: (r) => fmtDate(r.submittedAt) },
          { key: 'ai', header: 'AI', render: (r) => <AIStatusBadge status={r.ai} /> },
          { key: 'manual', header: 'Evaluator', render: (r) => <ManualStatusBadge status={r.manual} /> },
          { key: 'final', header: 'Final', render: (r) => <SubmissionStageBadge stage={r.stage} /> },
        ]}
      />
    </div>
  )
}
