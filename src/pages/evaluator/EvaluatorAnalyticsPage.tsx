import { PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/ui/primitives'
import { BarChart, DonutChart } from '@/components/shared/Charts'
import { useEvaluator } from '@/hooks/useCurrentUser'
import { useAppState } from '@/store/store'

export function EvaluatorAnalyticsPage() {
  const evaluator = useEvaluator()
  const state = useAppState()
  const mine = state.submissions.filter((s) => evaluator.assignedStudentIds.includes(s.studentId))
  const published = mine.filter((s) => s.published).length
  const pending = mine.filter((s) =>
    ['sent_to_evaluator', 'submitted', 'ai_evaluation', 'evaluator_review'].includes(s.stage),
  ).length

  const scored = mine.filter((s) => s.aiScore != null)
  const withManual = scored
    .map((s) => ({ sub: s, manual: state.manualEvaluations.find((m) => m.submissionId === s.id) }))
    .filter((x) => x.manual?.status === 'completed')

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Your evaluation workload and outcomes." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="text-sm font-semibold text-ink">Pending vs completed</h3>
          <div className="mt-4">
            <DonutChart
              segments={[
                { label: 'Published', value: published, color: '#1c8168' },
                { label: 'Pending', value: pending, color: '#f59e0b' },
                { label: 'Not submitted', value: Math.max(0, mine.length - published - pending), color: '#e4ded2' },
              ]}
            />
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-ink">AI vs Evaluator score</h3>
          {withManual.length ? (
            <BarChart
              tone="ai"
              data={withManual.flatMap((x) => {
                const name = (x.sub.studentName ?? 'Student').split(' ')[0]
                return [
                  { label: `${name} AI`, value: Math.round(x.sub.aiScore as number) },
                  { label: `${name} Ev`, value: Math.round((x.manual!.total / x.manual!.maxTotal) * 100) },
                ]
              })}
            />
          ) : (
            <p className="py-10 text-center text-sm text-ink-muted">No submissions with both AI + manual evaluation yet.</p>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-ink">AI score by student</h3>
          {scored.length ? (
            <BarChart
              data={scored.map((s) => ({
                label: (s.studentName ?? 'Student').split(' ')[0],
                value: Math.round(s.aiScore as number),
              }))}
              suffix="%"
            />
          ) : (
            <p className="py-10 text-center text-sm text-ink-muted">No AI-evaluated submissions yet.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
