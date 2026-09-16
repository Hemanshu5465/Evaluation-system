import { Link } from 'react-router-dom'
import { Activity, ArrowUpRight, FileStack, GraduationCap, Sparkles, UserCog } from 'lucide-react'
import { PageHeader, KpiCard } from '@/components/shared/PageHeader'
import { Card, EmptyState } from '@/components/ui/primitives'
import { BarChart, DonutChart, LineChart } from '@/components/shared/Charts'
import { adminApi } from '@/api/endpoints'
import { useApiData } from '@/hooks/useApiData'
import { useAppState } from '@/store/store'
import { students, evaluators } from '@/store/refs'
import { relativeTime } from '@/lib/format'

const ACTION_ICON: Record<string, typeof Activity> = {
  SUBMISSION_CREATED: FileStack,
  SUBMISSION_SUBMITTED: FileStack,
  AI_EVALUATION_STARTED: Sparkles,
  AI_EVALUATION_COMPLETED: Sparkles,
  RESULT_PUBLISHED: ArrowUpRight,
  PROJECT_RESULT_PUBLISHED: ArrowUpRight,
  PROJECT_SUBMITTED: FileStack,
  ASSESSMENT_PUBLISHED: ArrowUpRight,
  ASSESSMENT_CREATED: Sparkles,
  SYLLABUS_UPLOAD: GraduationCap,
}

function actionLabel(a: string): string {
  return a
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function AdminDashboard() {
  const s = useAppState()
  const { data: dash } = useApiData(() => adminApi.dashboard())
  const { data: overview } = useApiData(() => adminApi.analyticsOverview())
  const { data: byDay } = useApiData(() => adminApi.analyticsSubmissions())
  const { data: scores } = useApiData(() => adminApi.analyticsScores())

  const kpi = (dash ?? {}) as Record<string, number>
  const activity = ((dash?.recent_activity as { action: string; entity_type: string; at: string }[]) ?? [])
  const scoreBySubject = (overview?.average_score_by_subject as Record<string, number>) ?? {}
  const trend = Object.entries(byDay?.by_day ?? {})
    .slice(-7)
    .map(([d, v]) => ({ label: d.slice(5), value: v }))
  const rows = scores?.rows ?? []
  const completed = kpi.completed_evaluations ?? 0
  const pending = kpi.pending_evaluations ?? 0
  const totalSubs = s.submissions.length || rows.length

  return (
    <div>
      <PageHeader title="Admin Dashboard" subtitle="Platform overview for the current assessment cycle." />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Total Students" value={kpi.total_students ?? students.length} />
        <KpiCard label="Total Evaluators" value={kpi.total_evaluators ?? evaluators.length} />
        <KpiCard label="Active Subjects" value={kpi.active_subjects ?? 0} hint="of 3 slots" />
        <KpiCard label="Active Questions" value={kpi.active_questions ?? 0} tone="ai" />
        <KpiCard label="Pending Evaluations" value={pending} tone="amber" />
        <KpiCard label="Completed" value={completed} tone="brand" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-ink">Submissions per day</h3>
          {trend.length ? (
            <LineChart data={trend} />
          ) : (
            <p className="py-10 text-center text-sm text-ink-muted">No submissions yet.</p>
          )}
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-ink">Evaluation completion</h3>
          <div className="mt-4">
            <DonutChart
              segments={[
                { label: 'Published', value: completed, color: '#1c8168' },
                { label: 'In review', value: pending, color: '#f59e0b' },
                { label: 'Not started', value: Math.max(0, totalSubs - completed - pending), color: '#e4ded2' },
              ]}
            />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Recent activity</h3>
            <Link to="/admin/submissions" className="text-xs font-semibold text-brand-700 hover:underline">
              View submissions
            </Link>
          </div>
          {activity.length ? (
            <ul className="divide-y divide-line">
              {activity.map((a, i) => {
                const Icon = ACTION_ICON[a.action] ?? Activity
                return (
                  <li key={i} className="flex items-center gap-3 py-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-paper text-ink-soft">
                      <Icon size={15} />
                    </span>
                    <span className="flex-1 text-sm text-ink-soft">{actionLabel(a.action)}</span>
                    <span className="text-xs text-ink-muted">{relativeTime(a.at)}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-ink-muted">No activity yet.</p>
          )}
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-ink">Average AI score by subject</h3>
          {Object.keys(scoreBySubject).length ? (
            <div className="mt-4">
              <BarChart
                data={Object.entries(scoreBySubject).map(([label, value]) => ({ label: label.slice(0, 10), value: Math.round(value) }))}
                suffix="%"
              />
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-ink-muted">No published results yet.</p>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <QuickLink to="/admin" icon={Sparkles} title="Workspace" desc="Upload syllabus, generate & publish a question" />
        <QuickLink to="/admin/questions" icon={GraduationCap} title="Questions" desc="Published scenario questions" />
        <QuickLink to="/admin/evaluators" icon={UserCog} title="Evaluators" desc="Manage evaluator assignments" />
      </div>
    </div>
  )
}

function QuickLink({ to, icon: Icon, title, desc }: { to: string; icon: typeof Activity; title: string; desc: string }) {
  return (
    <Link to={to} className="card flex items-center gap-3 p-4 transition-shadow hover:shadow-lift">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
        <Icon size={18} />
      </span>
      <span>
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs text-ink-muted">{desc}</span>
      </span>
      <ArrowUpRight size={15} className="ml-auto text-ink-muted" />
    </Link>
  )
}
