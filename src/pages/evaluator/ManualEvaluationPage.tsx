import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, EyeOff, Save, Send, Upload } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Avatar, Badge, Button, Card, EmptyState } from '@/components/ui/primitives'
import { ScoreRing } from '@/components/shared/ScoreRing'
import { AIReport } from '@/components/evaluation/AIReport'
import { PublishModal } from '@/components/evaluation/PublishModal'
import { evaluationService } from '@/services/evaluationService'
import { useEvaluator } from '@/hooks/useCurrentUser'
import { pushToast, useAppState } from '@/store/store'
export function ManualEvaluationPage() {
  const { id } = useParams()
  const evaluator = useEvaluator()
  const state = useAppState()
  const submission = state.submissions.find((s) => s.id === id)
  const assessment = submission ? state.assessments.find((a) => a.id === submission.assessmentId) : undefined
  const question =
    (assessment ? state.questions.find((q) => q.id === assessment.questionId) : undefined) ?? state.questions[0]
  const ai = state.aiEvaluations.find((a) => a.submissionId === id)
  const existing = state.manualEvaluations.find((m) => m.submissionId === id)
  const rubric = question?.rubric ?? []

  const [scores, setScores] = useState<Record<string, number>>(
    () => existing?.scores ?? Object.fromEntries(rubric.map((r) => [r.id, 0])),
  )
  const [comments, setComments] = useState(existing?.comments ?? '')
  const [strengths, setStrengths] = useState(existing?.strengths ?? '')
  const [improvements, setImprovements] = useState(existing?.improvements ?? '')
  const [busy, setBusy] = useState<'draft' | 'submit' | null>(null)
  const [pubOpen, setPubOpen] = useState(false)

  const maxTotal = rubric.reduce((a, r) => a + r.maxMarks, 0)
  const total = useMemo(() => Object.values(scores).reduce((a, b) => a + (Number(b) || 0), 0), [scores])

  if (!submission || !ai || !question) {
    return <EmptyState icon={<Save size={20} />} title="Not ready for manual evaluation" message="Run the AI evaluation for this submission first." />
  }

  const student = state.users.find((s) => s.id === submission.studentId)
  const scenario = state.scenarios.find((s) => s.id === submission.scenarioId)

  async function save(status: 'draft' | 'completed') {
    setBusy(status === 'draft' ? 'draft' : 'submit')
    await evaluationService.saveManualEvaluation(submission!.id, evaluator.id, { scores, comments, strengths, improvements }, status)
    setBusy(null)
    pushToast({
      kind: 'success',
      title: status === 'draft' ? 'Draft saved' : 'Evaluation submitted',
      message: 'Your assessment stays private until you publish the AI result.',
    })
  }

  return (
    <div>
      <Link to={`/evaluator/submissions/${submission.id}`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={15} /> Back to submission
      </Link>
      <PageHeader title="Manual Evaluation" subtitle="Private to you. Never shown to the student in this prototype." action={<Badge tone="amber">Evaluator-only</Badge>} />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card>
            <p className="label">Student information</p>
            <div className="flex items-center gap-3">
              <Avatar name={student?.name ?? '—'} color={student?.avatarColor} />
              <div className="text-sm">
                <p className="font-semibold text-ink">{student?.name ?? 'Student'}</p>
                <p className="text-ink-muted">
                  {(student as { studentCode?: string })?.studentCode ?? ''} · {student?.email ?? ''}
                </p>
                <p className="text-ink-muted">
                  {assessment?.title ?? 'Assessment'}
                  {scenario ? ` · Scenario ${scenario.scenarioCode} (${scenario.domain})` : ''}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <details open>
              <summary className="cursor-pointer text-sm font-semibold text-ink">AI Evaluation Summary (reference)</summary>
              <div className="mt-4">
                <AIReport evaluation={ai} showTestCases={false} />
              </div>
            </details>
          </Card>

          <Card>
            <p className="label">Evaluator rubric</p>
            <div className="space-y-3">
              {rubric.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-ink-soft">{r.name}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={r.maxMarks}
                      value={scores[r.id] ?? 0}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(r.maxMarks, Number(e.target.value)))
                        setScores((p) => ({ ...p, [r.id]: v }))
                      }}
                      className="input w-20 text-center"
                    />
                    <span className="w-10 text-sm text-ink-muted">/ {r.maxMarks}</span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-line pt-3">
                <span className="text-sm font-semibold text-ink">Total</span>
                <span className="font-display text-xl font-semibold text-brand-700">
                  {total} / {maxTotal}
                </span>
              </div>
            </div>
          </Card>

          <Card className="space-y-4">
            <div>
              <label className="label">Evaluator comments</label>
              <textarea className="input min-h-24" value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Overall assessment…" />
            </div>
            <div>
              <label className="label">Strengths</label>
              <textarea className="input min-h-20" value={strengths} onChange={(e) => setStrengths(e.target.value)} />
            </div>
            <div>
              <label className="label">Areas for improvement</label>
              <textarea className="input min-h-20" value={improvements} onChange={(e) => setImprovements(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" icon={<Save size={14} />} loading={busy === 'draft'} onClick={() => save('draft')}>
                Save Draft
              </Button>
              <Button icon={<Send size={14} />} loading={busy === 'submit'} onClick={() => save('completed')}>
                Submit Evaluation
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="text-center">
            <p className="label">Evaluator score</p>
            <ScoreRing value={total} max={maxTotal} tone="brand" label="Evaluator" />
          </Card>
          <Card>
            <p className="label">Publication</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-muted">AI evaluation</span>
                <span className="font-semibold text-ai-700">{ai.score}/100</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Evaluator evaluation</span>
                <span className="font-semibold text-brand-700">
                  {total}/{maxTotal}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Status</span>
                <Badge tone={submission.published ? 'green' : 'neutral'}>{submission.published ? 'Published' : 'Not published'}</Badge>
              </div>
            </div>
            <Button
              className="mt-3 w-full"
              icon={<Upload size={14} />}
              disabled={submission.published}
              onClick={() => setPubOpen(true)}
            >
              Publish AI Result to Student
            </Button>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-muted">
              <EyeOff size={13} className="mt-0.5 shrink-0" />
              Publishing releases only the AI evaluation. Your rubric marks and comments stay private.
            </p>
          </Card>
        </div>
      </div>

      <PublishModal
        open={pubOpen}
        onClose={() => setPubOpen(false)}
        submissionId={submission.id}
        aiScore={ai.score}
        evaluatorScore={Math.round((total / maxTotal) * 100)}
      />
    </div>
  )
}
