import { PageHeader } from '@/components/shared/PageHeader'
import { Avatar, Badge, Card } from '@/components/ui/primitives'
import { useStudent } from '@/hooks/useCurrentUser'
import { useAppState } from '@/store/store'
import { evaluators, scenarios } from '@/store/refs'
export function ProfilePage() {
  const student = useStudent()
  const state = useAppState()
  const scenario = scenarios.find((s) => s.studentId === student.id)
  const evaluator = evaluators.find((e) => e.assignedStudentIds.includes(student.id))
  const results = state.submissions.filter((s) => s.studentId === student.id && s.published).length

  return (
    <div>
      <PageHeader title="Profile" />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="text-center">
          <div className="flex justify-center">
            <Avatar name={student.name} color={student.avatarColor} size={72} />
          </div>
          <h2 className="mt-3 text-lg font-semibold text-ink">{student.name}</h2>
          <p className="text-sm text-ink-muted">{student.email}</p>
          <Badge tone="brand" className="mt-2">
            {student.studentCode}
          </Badge>
        </Card>
        <div className="space-y-4">
          <Card>
            <p className="label">Academic</p>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <Row k="Enrollment number" v={student.studentCode} />
              {student.program && <Row k="Program" v={student.program} />}
              {student.year != null && <Row k="Year" v={String(student.year)} />}
              <Row k="Assigned scenario" v={scenario?.title ?? '—'} />
              <Row k="Scenario ID" v={scenario?.scenarioCode ?? '—'} />
              <Row k="Evaluator" v={evaluator?.name ?? 'Unassigned'} />
              <Row k="Published results" v={String(results)} />
            </dl>
          </Card>
          <Card>
            <p className="label">Privacy</p>
            <p className="text-sm text-ink-soft">
              You can see AI evaluations your evaluator publishes. Evaluator private rubric marks and comments are never shown in your
              account.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between rounded-lg bg-paper px-3 py-2">
      <dt className="text-ink-muted">{k}</dt>
      <dd className="font-semibold text-ink">{v}</dd>
    </div>
  )
}
