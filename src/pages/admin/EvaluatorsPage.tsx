import { PageHeader } from '@/components/shared/PageHeader'
import { Avatar, Badge, Card } from '@/components/ui/primitives'
import { evaluators, students } from '@/store/refs'
import { useStore } from '@/store/store'

export function EvaluatorsPage() {
  const submissions = useStore((s) => s.submissions)
  return (
    <div>
      <PageHeader title="Evaluators" subtitle={`${evaluators.length} evaluators. Assignments determine which submissions each one reviews.`} />
      <div className="grid gap-4 md:grid-cols-3">
        {evaluators.map((e) => {
          const assigned = students.filter((s) => e.assignedStudentIds.includes(s.id))
          const pending = submissions.filter(
            (s) => e.assignedStudentIds.includes(s.studentId) && ['sent_to_evaluator', 'ai_evaluation', 'evaluator_review'].includes(s.stage),
          ).length
          const done = submissions.filter((s) => e.assignedStudentIds.includes(s.studentId) && s.stage === 'published').length
          return (
            <Card key={e.id}>
              <div className="flex items-center gap-3">
                <Avatar name={e.name} color={e.avatarColor} />
                <div>
                  <p className="text-sm font-semibold text-ink">{e.name}</p>
                  <p className="text-xs text-ink-muted">{e.department}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Stat label="Assigned" value={assigned.length} />
                <Stat label="Pending" value={pending} tone="amber" />
                <Stat label="Published" value={done} tone="green" />
              </div>
              <div className="mt-4">
                <p className="label">Assigned students</p>
                <div className="flex flex-wrap gap-1.5">
                  {assigned.length === 0 && <span className="text-xs text-ink-muted">None assigned</span>}
                  {assigned.map((s) => (
                    <Badge key={s.id} tone="neutral">
                      {s.name.split(' ')[0]}
                    </Badge>
                  ))}
                </div>
              </div>
            </Card>
          )
        })}
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
