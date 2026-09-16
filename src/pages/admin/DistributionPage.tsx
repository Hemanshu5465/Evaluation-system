import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, Layers, Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Avatar, Badge, Card, EmptyState, Modal } from '@/components/ui/primitives'
import { adminApi } from '@/api/endpoints'
import { adaptScenario } from '@/api/adapt'
import { useAppState } from '@/store/store'
import type { StudentScenario } from '@/types'

export function DistributionPage() {
  const state = useAppState()
  const published = useMemo(
    () => state.assessments.filter((a) => a.status === 'published'),
    [state.assessments],
  )
  const [assessmentId, setAssessmentId] = useState<string>('')
  const [scenarios, setScenarios] = useState<(StudentScenario & { studentName?: string })[]>([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<StudentScenario | null>(null)

  const activeId = assessmentId || published[0]?.id || ''
  const assessment = state.assessments.find((a) => a.id === activeId)
  const question = state.questions.find((q) => q.id === assessment?.questionId)
  const expected = assessment?.studentIds.length ?? 0

  useEffect(() => {
    if (!activeId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const load = async () => {
      setLoading(true)
      try {
        const list = await adminApi.listScenarios(activeId)
        if (cancelled) return
        setScenarios(
          list.map((dto) => ({
            ...adaptScenario(dto, { questionId: assessment?.questionId }),
            studentName: dto.student_name ?? undefined,
          })),
        )
        // scenarios generate in the background at publish time — keep polling until complete
        if (expected && list.length < expected) timer = setTimeout(load, 3000)
      } catch {
        if (!cancelled) setScenarios([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [activeId, assessment?.questionId, expected])

  if (published.length === 0) {
    return (
      <div>
        <PageHeader title="Question Distribution" subtitle="How one common question reaches every student with a personalized scenario." />
        <EmptyState
          icon={<Layers size={20} />}
          title="No published assessment yet"
          message="Generate a question in the Question Generator and publish it — scenarios are created per student at publish time."
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Question Distribution"
        subtitle="How one common question reaches every student with a personalized scenario."
        action={
          published.length > 1 ? (
            <select className="input w-auto" value={activeId} onChange={(e) => setAssessmentId(e.target.value)}>
              {published.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          ) : null
        }
      />

      {question && (
        <Card className="border-brand-200 bg-brand-50/50">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-brand-600" />
            <h3 className="text-sm font-semibold text-ink">Common Question</h3>
            <Badge tone="brand">
              {expected && scenarios.length < expected
                ? `Generating scenarios… ${scenarios.length}/${expected}`
                : `Same for all ${scenarios.length} students ✓`}
            </Badge>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">"{question.commonPrompt}"</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {question.rubric.map((r) => (
              <span key={r.id} className="rounded-lg bg-white px-2.5 py-1 text-xs text-ink-soft">
                {r.name} · {r.maxMarks}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">The conceptual task, parts and rubric above are identical for everyone.</p>
        </Card>
      )}

      <div className="my-5 flex flex-col items-center">
        <div className="rounded-xl border border-brand-300 bg-white px-4 py-2 text-xs font-semibold text-brand-800">Common Question</div>
        <ArrowDown size={18} className="my-1 text-ink-muted" />
        <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {scenarios.slice(0, 4).map((sc) => (
            <div key={sc.id} className="rounded-xl border border-ai-200 bg-ai-50/60 p-3 text-center">
              <Avatar name={sc.studentName ?? '—'} size={30} />
              <p className="mt-1.5 text-xs font-semibold text-ink">{(sc.studentName ?? '—').split(' ')[0]}</p>
              <p className="text-[11px] text-ai-700">{sc.title}</p>
            </div>
          ))}
        </div>
      </div>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={15} className="text-ai-600" />
          <h3 className="text-sm font-semibold text-ink">Student Scenarios</h3>
          <Badge tone="ai">Unique per student</Badge>
          {loading && <span className="text-xs text-ink-muted">loading…</span>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {scenarios.map((sc) => (
            <button
              key={sc.id}
              onClick={() => setDetail(sc)}
              className="flex items-center gap-3 rounded-xl border border-line p-3 text-left hover:border-ai-300 hover:bg-ai-50/40"
            >
              <Avatar name={sc.studentName ?? '—'} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{sc.studentName ?? 'Student'}</p>
                <p className="truncate text-xs text-ink-muted">
                  {sc.title} · <span className="font-mono">{sc.scenarioCode}</span>
                </p>
              </div>
              <Badge tone="neutral">{sc.domain}</Badge>
            </button>
          ))}
        </div>
      </Card>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? detail.title : ''} tone="ai" size="lg">
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="ai" className="font-mono">
                {detail.scenarioCode}
              </Badge>
              <Badge tone="neutral">{detail.domain}</Badge>
            </div>
            <p className="rounded-xl bg-paper p-3 leading-relaxed text-ink-soft">{detail.narrative}</p>
            <div>
              <p className="label">Scenario entities</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {detail.entities.map((e) => (
                  <div key={e.name} className="rounded-lg border border-line p-2.5">
                    <p className="font-mono text-xs font-semibold text-ai-700">{e.name}</p>
                    <ul className="mt-1 space-y-0.5 text-[11px] text-ink-muted">
                      {e.columns.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
            <p className="rounded-lg bg-ai-50 px-3 py-2 text-xs text-ink-soft">
              Same learning objectives, same rubric — only the domain, entities and sample records differ.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
