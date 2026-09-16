import { PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/ui/primitives'
import { BarChart, DonutChart, LineChart } from '@/components/shared/Charts'
import { adminApi } from '@/api/endpoints'
import { useApiData } from '@/hooks/useApiData'

export function AnalyticsPage() {
  const { data: overview } = useApiData(() => adminApi.analyticsOverview())
  const { data: byDay } = useApiData(() => adminApi.analyticsSubmissions())
  const { data: scores } = useApiData(() => adminApi.analyticsScores())

  const o = (overview ?? {}) as Record<string, number | Record<string, number>>
  const scoreBySubject = (o.average_score_by_subject as Record<string, number>) ?? {}
  const trend = Object.entries(byDay?.by_day ?? {}).map(([d, v]) => ({ label: d.slice(5), value: v }))
  const rows = (scores?.rows ?? []).filter((r) => r.manual_score != null)
  const completed = (o.ai_evaluations_completed as number) ?? 0
  const manualDone = (o.manual_evaluations_completed as number) ?? 0
  const total = byDay?.total ?? 0

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Assessment cycle performance — computed server-side." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="text-sm font-semibold text-ink">Submissions per day</h3>
          {trend.length ? <LineChart data={trend} /> : <Empty />}
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-ink">Evaluation completion</h3>
          <div className="mt-4">
            <DonutChart
              segments={[
                { label: 'Published (AI)', value: completed, color: '#1c8168' },
                { label: 'Manual done', value: manualDone, color: '#7549e3' },
                { label: 'Awaiting', value: Math.max(0, total - completed), color: '#e4ded2' },
              ]}
            />
          </div>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-ink">Average AI score by subject</h3>
          {Object.keys(scoreBySubject).length ? (
            <BarChart
              data={Object.entries(scoreBySubject).map(([label, v]) => ({ label: label.slice(0, 12), value: Math.round(v) }))}
              suffix="%"
            />
          ) : (
            <Empty />
          )}
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-ink">AI score vs Evaluator score</h3>
          {rows.length ? (
            <>
              <BarChart
                tone="ai"
                data={rows.flatMap((r, i) => [
                  { label: `#${i + 1} AI`, value: Math.round(r.ai_score) },
                  { label: `#${i + 1} Ev`, value: Math.round(r.manual_score as number) },
                ])}
              />
              <p className="mt-2 text-xs text-ink-muted">
                Avg AI {avg(rows.map((r) => r.ai_score))} · Avg evaluator {avg(rows.map((r) => r.manual_score as number))}
              </p>
            </>
          ) : (
            <Empty label="No published results with a manual evaluation yet." />
          )}
        </Card>
      </div>
    </div>
  )
}

function avg(xs: number[]): number {
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0
}

function Empty({ label = 'No data yet.' }: { label?: string }) {
  return <p className="py-10 text-center text-sm text-ink-muted">{label}</p>
}
