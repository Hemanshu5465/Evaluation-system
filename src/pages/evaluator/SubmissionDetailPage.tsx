import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, Sparkles, SquarePen, Upload } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Avatar, Badge, Button, Card, EmptyState } from '@/components/ui/primitives'
import { AIStatusBadge, ManualStatusBadge, SubmissionStageBadge } from '@/components/shared/StageBadges'
import { AIEvaluationModal } from '@/components/evaluation/AIEvaluationModal'
import { AIReport } from '@/components/evaluation/AIReport'
import { FileViewerModal } from '@/components/evaluation/FileViewerModal'
import { evaluationService } from '@/services/evaluationService'
import { pushToast, useAppState } from '@/store/store'
import { scenarios, students } from '@/store/refs'
import { fmtDateTime } from '@/lib/format'

export function SubmissionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const state = useAppState()
  const submission = state.submissions.find((s) => s.id === id)
  const [aiOpen, setAiOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [viewFile, setViewFile] = useState<{ name: string; path: string } | null>(null)

  if (!submission) return <EmptyState icon={<FileText size={20} />} title="Submission not found" message="It may have been removed." />

  const student = students.find((s) => s.id === submission.studentId)!
  const scenario = scenarios.find((s) => s.id === submission.scenarioId)
  const assessment = state.assessments.find((a) => a.id === submission.assessmentId)
  const question = assessment ? state.questions.find((q) => q.id === assessment.questionId) : undefined
  const ai = state.aiEvaluations.find((a) => a.submissionId === submission.id)
  const manual = state.manualEvaluations.find((m) => m.submissionId === submission.id)
  const notSubmitted = submission.stage === 'not_started'

  return (
    <div>
      <Link to="/evaluator/submissions" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={15} /> Back to submissions
      </Link>
      <PageHeader
        title={`${student.name} — ${assessment?.subjectName ?? 'Assessment'}`}
        subtitle={notSubmitted ? 'This student has not submitted yet.' : `Submitted ${fmtDateTime(submission.submittedAt)}`}
        action={<SubmissionStageBadge stage={submission.stage} />}
      />

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-3">
              <Avatar name={student.name} color={student.avatarColor} />
              <div>
                <p className="text-sm font-semibold text-ink">{student.name}</p>
                <p className="text-xs text-ink-muted">{student.studentCode}</p>
              </div>
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row k="Email" v={student.email} />
              <Row k="Enrollment" v={student.studentCode} />
              <Row k="Scenario" v={scenario?.title ?? '—'} />
              <Row k="Scenario ID" v={scenario?.scenarioCode ?? '—'} />
            </dl>
          </Card>

          <Card>
            <p className="label">Evaluation status</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-muted">AI evaluation</span>
                <AIStatusBadge status={ai?.status} />
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Manual evaluation</span>
                <ManualStatusBadge status={manual?.status} />
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Publication</span>
                <Badge tone={submission.published ? 'green' : 'neutral'}>{submission.published ? 'Published' : 'Not published'}</Badge>
              </div>
            </div>
          </Card>

          {!notSubmitted && (
            <Card>
              <p className="label">Archive contents · {submission.zipName}</p>
              <p className="mb-2 text-xs text-ink-muted">Click a file to view its contents.</p>
              <ul className="space-y-0.5">
                {submission.files.map((f) => (
                  <li key={f.path || f.name}>
                    <button
                      type="button"
                      onClick={() => setViewFile({ name: f.name, path: f.path || f.name })}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-ink-soft hover:bg-paper hover:text-ink"
                    >
                      <FileText size={14} className="text-ink-muted" />
                      <span className="font-mono text-xs">{f.name}</span>
                      <span className="ml-auto text-xs text-ink-muted">{f.sizeKB} KB</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="border-brand-200 bg-brand-50/40">
            <p className="label text-brand-700">Common question — identical for all students</p>
            <p className="text-sm leading-relaxed text-ink-soft">
              {question?.commonPrompt ?? 'The common question for this assessment is not available.'}
            </p>
          </Card>
          {scenario && (
            <Card className="border-ai-200 bg-ai-50/40">
              <p className="label text-ai-700">This student's scenario — {scenario.scenarioCode}</p>
              <p className="text-sm leading-relaxed text-ink-soft">{scenario.narrative}</p>
            </Card>
          )}

          {notSubmitted ? (
            <EmptyState icon={<Upload size={20} />} title="Nothing to evaluate yet" message="Actions unlock once the student submits their solution ZIP." />
          ) : (
            <Card>
              <div className="flex flex-wrap gap-2">
                <Button variant="ai" icon={<Sparkles size={15} />} onClick={() => setAiOpen(true)}>
                  {ai?.status === 'completed' ? 'View AI Evaluation' : 'Run AI Evaluation'}
                </Button>
                <Button
                  variant="ghost"
                  icon={<SquarePen size={15} />}
                  disabled={ai?.status !== 'completed'}
                  onClick={() => navigate(`/evaluator/manual/${submission.id}`)}
                >
                  Evaluate manually
                </Button>
                <Button
                  icon={<Upload size={15} />}
                  loading={publishing}
                  disabled={ai?.status !== 'completed' || submission.published}
                  onClick={async () => {
                    setPublishing(true)
                    try {
                      await evaluationService.publishEvaluation(submission.id)
                      pushToast({ kind: 'success', title: 'Evaluation published', message: 'The student can now see the AI result.' })
                    } catch (e) {
                      pushToast({ kind: 'error', title: 'Publish failed', message: e instanceof Error ? e.message : 'Try again.' })
                    } finally {
                      setPublishing(false)
                    }
                  }}
                >
                  {submission.published ? 'Published' : 'Publish AI Result to Student'}
                </Button>
              </div>
              {ai?.status !== 'completed' && <p className="mt-2 text-xs text-ink-muted">Run the AI evaluation first to unlock manual evaluation and publishing.</p>}
            </Card>
          )}

          {ai?.status === 'completed' && (
            <Card>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <Sparkles size={15} className="text-ai-600" /> AI Evaluation Report
              </h3>
              <AIReport evaluation={ai} />
            </Card>
          )}
        </div>
      </div>

      <AIEvaluationModal submission={submission} open={aiOpen} onClose={() => setAiOpen(false)} />
      <FileViewerModal submissionId={submission.id} file={viewFile} onClose={() => setViewFile(null)} />
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-ink-muted">{k}</dt>
      <dd className="text-right font-medium text-ink">{v}</dd>
    </div>
  )
}
