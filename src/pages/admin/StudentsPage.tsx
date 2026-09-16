import { PageHeader } from '@/components/shared/PageHeader'
import { Avatar, Badge } from '@/components/ui/primitives'
import { DataTable } from '@/components/tables/DataTable'
import { evaluators, students } from '@/store/refs'
import { useStore } from '@/store/store'
import { SubmissionStageBadge } from '@/components/shared/StageBadges'

export function StudentsPage() {
  const submissions = useStore((s) => s.submissions)
  const scenarios = useStore((s) => s.scenarios)
  const rows = students.map((s) => ({
    ...s,
    sub: submissions.find((x) => x.studentId === s.id),
    scenario: scenarios.find((x) => x.studentId === s.id),
    evaluator: evaluators.find((e) => e.assignedStudentIds.includes(s.id)),
  }))

  return (
    <div>
      <PageHeader title="Students" subtitle={`${students.length} students enrolled in the current cycle.`} />
      <DataTable
        rows={rows}
        searchKeys={(r) => `${r.name} ${r.studentCode} ${r.email}`}
        searchPlaceholder="Search students…"
        columns={[
          {
            key: 'name',
            header: 'Student',
            sortValue: (r) => r.name,
            render: (r) => (
              <div className="flex items-center gap-2.5">
                <Avatar name={r.name} color={r.avatarColor} size={32} />
                <div>
                  <p className="font-semibold text-ink">{r.name}</p>
                  <p className="text-xs text-ink-muted">{r.studentCode}</p>
                </div>
              </div>
            ),
          },
          { key: 'scenario', header: 'Assigned Scenario', render: (r) => (r.scenario ? <Badge tone="ai">{r.scenario.title}</Badge> : '—') },
          { key: 'evaluator', header: 'Evaluator', render: (r) => r.evaluator?.name ?? <span className="text-ink-muted">Unassigned</span> },
          { key: 'status', header: 'Submission', render: (r) => <SubmissionStageBadge stage={r.sub?.stage ?? 'not_started'} /> },
        ]}
      />
    </div>
  )
}
