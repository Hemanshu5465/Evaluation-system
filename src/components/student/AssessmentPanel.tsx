import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, FileArchive, Info, Loader2, Send } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Modal } from '@/components/ui/primitives'
import { Timeline, type TimelineStep } from '@/components/shared/Timeline'
import { AntiAIGuard } from '@/components/shared/AntiAIGuard'
import { NoCopy } from '@/components/shared/NoCopy'
import { ZipDropzone } from '@/components/upload/ZipDropzone'
import { submissionService } from '@/services/submissionService'
import { studentApi } from '@/api/endpoints'
import { adaptScenario } from '@/api/adapt'
import { useStudent } from '@/hooks/useCurrentUser'
import { pushToast, useAppState } from '@/store/store'
import { storeUpdate } from '@/store/bootstrap'
import type { SubmissionStage } from '@/types'

const STAGE_STEPS: { key: SubmissionStage; label: string }[] = [
  { key: 'uploaded', label: 'Uploaded' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'sent_to_evaluator', label: 'Sent to Evaluator' },
  { key: 'ai_evaluation', label: 'AI Evaluation' },
  { key: 'evaluator_review', label: 'Evaluator Review' },
  { key: 'published', label: 'Published' },
]
const ORDER: SubmissionStage[] = ['not_started', 'uploaded', 'submitted', 'sent_to_evaluator', 'ai_evaluation', 'evaluator_review', 'published']

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function AssessmentPanel({ assessmentId }: { assessmentId: string }) {
  const student = useStudent()
  const state = useAppState()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const assessment = state.assessments.find((a) => a.id === assessmentId)
  const question = assessment ? state.questions.find((q) => q.id === assessment.questionId) : undefined
  const submission = state.submissions.find((s) => s.assessmentId === assessmentId && s.studentId === student.id)
  const stage = submission?.stage ?? 'not_started'
  const stageIdx = ORDER.indexOf(stage)
  const isSubmitted = stageIdx >= ORDER.indexOf('sent_to_evaluator')
  const scenario =
    state.scenarios.find((s) => s.studentId === student.id && s.questionId === assessment?.questionId) ??
    state.scenarios.find((s) => s.studentId === student.id && !s.questionId) ??
    (submission ? state.scenarios.find((s) => s.id === submission.scenarioId) : undefined)

  const fetchingScenario = useRef(false)
  useEffect(() => {
    if (!assessmentId || scenario || !assessment || fetchingScenario.current) return
    fetchingScenario.current = true
    studentApi
      .getScenario(assessmentId, true)
      .then((dto) =>
        storeUpdate.upsertScenarios([
          adaptScenario(dto, { questionId: assessment.questionId, studentId: student.id }),
        ]),
      )
      .catch(() => {})
      .finally(() => {
        fetchingScenario.current = false
      })
  }, [assessmentId, scenario, assessment, student.id])

  // Per-question timer (optional — set by the admin at publish time). Starts this
  // student's personal clock the moment they open the question.
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const startingTimer = useRef(false)
  const autoSubmitFired = useRef(false)

  useEffect(() => {
    if (!assessmentId || startingTimer.current) return
    startingTimer.current = true
    studentApi
      .startAssessment(assessmentId)
      .then((dto) => {
        if (dto.expires_at) setExpiresAtMs(new Date(dto.expires_at).getTime())
      })
      .catch(() => {
        /* no time limit configured, or already past — non-fatal either way */
      })
  }, [assessmentId])

  useEffect(() => {
    // Stop the clock the moment the student submits — no need to keep ticking
    // (or, later, to auto-submit) something that's already been turned in.
    if (expiresAtMs == null || isSubmitted) return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [expiresAtMs, isSubmitted])

  const remainingMs = expiresAtMs != null ? expiresAtMs - nowMs : null
  const timedOut = remainingMs != null && remainingMs <= 0

  useEffect(() => {
    if (!timedOut || autoSubmitFired.current) return
    autoSubmitFired.current = true
    if (submission && submission.stage === 'uploaded') {
      submissionService
        .submitSubmission(submission.id)
        .then(() =>
          pushToast({ kind: 'info', title: "Time's up", message: 'Your uploaded solution was submitted automatically.' }),
        )
        .catch((e) =>
          pushToast({ kind: 'error', title: 'Auto-submit failed', message: e instanceof Error ? e.message : 'Please try submitting manually.' }),
        )
    }
  }, [timedOut, submission])

  if (!assessment || !question) {
    return <EmptyState icon={<Info size={20} />} title="Assessment unavailable" message="This assessment hasn't been published yet, or it's still being prepared." />
  }

  const hasUpload = !!submission && submission.files.length > 0 && submission.stage === 'uploaded'

  const steps: TimelineStep[] = STAGE_STEPS.map((s) => {
    const idx = ORDER.indexOf(s.key)
    return { label: s.label, state: stageIdx > idx ? 'done' : stageIdx === idx ? 'current' : 'todo' }
  })

  const files = submission?.files ?? []
  const requiredPresent = question.expectedFiles.map((f) => ({ name: f, present: files.some((x) => x.name === f) }))

  async function doSubmit() {
    if (!submission) return
    setSubmitting(true)
    try {
      await submissionService.submitSubmission(submission.id)
      pushToast({ kind: 'success', title: 'Solution submitted', message: 'Your evaluator has been notified.' })
    } catch (e) {
      pushToast({ kind: 'error', title: 'Submit failed', message: e instanceof Error ? e.message : 'Try again.' })
    } finally {
      setSubmitting(false)
      setConfirmOpen(false)
    }
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* Hide the countdown once submitted early — nothing left to time. Keep it
              showing when time ran out first, so the auto-submit confirmation is seen. */}
          {expiresAtMs != null && !(isSubmitted && !timedOut) && (
            <Card
              className={
                timedOut
                  ? 'border-rose-300 bg-rose-50'
                  : remainingMs! < 60_000
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-line'
              }
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">{timedOut ? "Time's up" : 'Time remaining'}</span>
                {!timedOut && <span className="font-mono text-lg font-bold text-ink">{formatRemaining(remainingMs!)}</span>}
              </div>
              {timedOut && (
                <p className="mt-1 text-xs text-ink-muted">
                  {hasUpload || isSubmitted
                    ? 'Your uploaded solution has been submitted automatically.'
                    : "No file was uploaded before time ran out, so there's nothing to submit."}
                </p>
              )}
            </Card>
          )}

          <NoCopy className="space-y-4">
          <Card className="border-brand-200 bg-brand-50/40">
            <p className="label text-brand-700">Common Question — identical for every student</p>
            <p className="text-sm leading-relaxed text-ink-soft">
              {question.commonPrompt}
              <AntiAIGuard />
            </p>
          </Card>

          {scenario ? (
            <Card className="border-ai-200 bg-ai-50/40">
              <div className="mb-1 flex items-center gap-2">
                <p className="label mb-0 text-ai-700">Your Scenario</p>
                <Badge tone="ai" className="font-mono">
                  {scenario.scenarioCode}
                </Badge>
              </div>
              <p className="mb-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-ink-muted">
                This scenario is personalized for you. The core question and evaluation criteria are identical for all students.
              </p>
              <p className="text-sm leading-relaxed text-ink-soft">
                {scenario.narrative}
                <AntiAIGuard />
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {scenario.entities.map((e) => (
                  <div key={e.name} className="rounded-lg border border-ai-200 bg-white/60 p-2.5">
                    <p className="font-mono text-xs font-semibold text-ai-700">{e.name}</p>
                    <ul className="mt-1 space-y-0.5 text-[11px] text-ink-muted">
                      {e.columns.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="flex items-center gap-2 border-ai-200 bg-ai-50/40 text-sm text-ink-muted">
              <Loader2 size={15} className="animate-spin text-ai-600" />
              Generating your personalized scenario…
            </Card>
          )}

          <Card>
            <p className="label">Question parts</p>
            <div className="space-y-2">
              {question.parts.map((p) => (
                <div key={p.id} className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">{p.label}</span>
                    <span className="text-xs text-ink-muted">{p.marks} marks</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">
                    {p.prompt}
                    <AntiAIGuard />
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="label">Instructions</p>
                <ul className="space-y-1 text-xs text-ink-soft">
                  {question.instructions.map((i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ink-muted" /> {i}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="label">Constraints</p>
                <ul className="space-y-1 text-xs text-ink-soft">
                  {question.constraints.map((i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ink-muted" /> {i}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-4">
              <p className="label">Your ZIP must contain</p>
              <ul className="flex flex-wrap gap-1.5">
                {question.expectedFiles.map((f) => (
                  <li key={f} className="flex items-center gap-1.5 rounded-lg border border-line bg-paper px-2 py-1 text-xs">
                    <FileArchive size={12} className="text-brand-600" />
                    <span className="font-mono text-ink-soft">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
          </NoCopy>

          {!isSubmitted && (
            <Card>
              <p className="label">Submit your solution</p>
              <p className="mb-3 text-xs text-ink-muted">Allowed format: {question.allowedFormat} · Required files below.</p>
              {!hasUpload ? (
                timedOut ? (
                  <div className="rounded-2xl border-2 border-dashed border-rose-300 bg-rose-50/50 px-6 py-10 text-center text-sm font-medium text-rose-700">
                    Time's up — you can no longer upload a solution for this question.
                  </div>
                ) : (
                  <ZipDropzone
                    onUpload={async (file, onProgress) => {
                      const v = submissionService.validateZip({ name: file.name, sizeMB: file.size / 1024 / 1024 })
                      if (!v.ok) throw new Error(v.error)
                      await submissionService.uploadSubmission(assessment.id, file, onProgress)
                    }}
                  />
                )
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-xl border border-line bg-paper p-3">
                    <FileArchive size={18} className="text-brand-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{submission!.zipName}</p>
                      <p className="text-xs text-ink-muted">
                        {submission!.zipSizeMB} MB · {files.length} files
                      </p>
                    </div>
                    <Badge tone="green">✓ Valid ZIP</Badge>
                  </div>
                  <div>
                    <p className="label">Required file checks</p>
                    <ul className="grid gap-1 sm:grid-cols-2">
                      {requiredPresent.map((r) => (
                        <li key={r.name} className={`flex items-center gap-1.5 text-xs ${r.present ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {r.present ? '✓' : '✗'} <span className="font-mono">{r.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {timedOut ? (
                    <p className="text-xs font-medium text-rose-700">Time's up — submitting your solution automatically…</p>
                  ) : (
                    <Button icon={<Send size={15} />} onClick={() => setConfirmOpen(true)}>
                      Submit Solution
                    </Button>
                  )}
                </div>
              )}
            </Card>
          )}

          {isSubmitted && (
            <Card className="border-emerald-200 bg-emerald-50/50">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-600" />
                <p className="text-sm font-semibold text-ink">Solution submitted</p>
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                Your file <span className="font-mono">{submission?.zipName}</span> is with your evaluator. Track progress on the right.
                Results appear under{' '}
                <Link to="/student/results" className="font-semibold text-brand-700 underline">
                  Results
                </Link>{' '}
                once published.
              </p>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <p className="label">Submission requirements</p>
            <ul className="space-y-1.5 text-sm text-ink-soft">
              {question.expectedFiles.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className={files.some((x) => x.name === f) ? 'text-emerald-600' : 'text-ink-muted'}>
                    {files.some((x) => x.name === f) ? '✓' : '○'}
                  </span>
                  <span className="font-mono text-xs">{f}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <p className="label">Submission status</p>
            {submission ? <Timeline steps={steps} /> : <p className="text-xs text-ink-muted">Not started — upload your solution to begin.</p>}
          </Card>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Submit your solution?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button loading={submitting} icon={<Send size={15} />} onClick={doSubmit}>
              Confirm &amp; Submit
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-ink-soft">
          <p>
            You're about to submit <span className="font-mono font-semibold text-ink">{submission?.zipName}</span> ({submission?.zipSizeMB} MB) for this
            scenario assessment.
          </p>
          <p className="rounded-lg bg-paper px-3 py-2 text-xs">
            After submitting you won't be able to change your files. Your evaluator will run the AI evaluation and review it before any
            result is published to you.
          </p>
        </div>
      </Modal>
    </>
  )
}
