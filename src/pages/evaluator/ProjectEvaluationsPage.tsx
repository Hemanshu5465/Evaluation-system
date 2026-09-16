import { useEffect, useRef, useState } from 'react'
import { FolderGit2, Sparkles, Upload } from 'lucide-react'
import type { ProjectSubmission } from '@/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { Avatar, Badge, Button, Card, EmptyState, Modal } from '@/components/ui/primitives'
import { AIStageRunner } from '@/components/evaluation/AIStageRunner'
import { ProjectReport } from '@/components/evaluation/ProjectReport'
import { PROJECT_AI_STAGES } from '@/data/mockData'
import { projectService } from '@/services/projectService'
import { pushToast, useAppState } from '@/store/store'
import { fmtDateTime } from '@/lib/format'

export function ProjectEvaluationsPage() {
  const state = useAppState()
  const [active, setActive] = useState<ProjectSubmission | null>(null)

  const rows = state.projectSubmissions.filter((p) => p.stage !== 'not_started')

  if (rows.length === 0) {
    return (
      <div>
        <PageHeader title="Project Evaluations" />
        <EmptyState icon={<FolderGit2 size={20} />} title="No project submissions yet" message="Submitted student projects will appear here for AI evaluation and review." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Project Evaluations" subtitle="A separate workflow from syllabus assessments — full project archives." />
      <div className="grid gap-3">
        {rows.map((p) => {
          const student = state.users.find((s) => s.id === p.studentId)
          const project = state.projects.find((x) => x.id === p.projectId)
          const evaluation = state.projectEvaluations.find((e) => e.projectSubmissionId === p.id)
          return (
            <Card key={p.id} className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={student?.name ?? '�'} color={student?.avatarColor} />
                <div>
                  <p className="text-sm font-semibold text-ink">{student?.name ?? 'Student'}</p>
                  <p className="text-xs text-ink-muted">
                    {project?.title ?? 'Project'} · {p.zipName} · {fmtDateTime(p.submittedAt)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={p.published ? 'green' : evaluation ? 'amber' : 'neutral'}>
                  {p.published ? 'Published' : evaluation ? 'Reviewed' : 'Awaiting AI'}
                </Badge>
                {evaluation && <Badge tone="ai">{evaluation.score}/100</Badge>}
                <Button variant="ai" icon={<Sparkles size={14} />} onClick={() => setActive(p)}>
                  {evaluation ? 'Open evaluation' : 'AI Evaluation'}
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      {active && <ProjectEvalModal submission={active} onClose={() => setActive(null)} />}
    </div>
  )
}

function ProjectEvalModal({ submission, onClose }: { submission: ProjectSubmission; onClose: () => void }) {
  const state = useAppState()
  const evaluation = state.projectEvaluations.find((e) => e.projectSubmissionId === submission.id)
  const student = useAppState().users.find((s) => s.id === submission.studentId)
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState(-1)
  const [pubBusy, setPubBusy] = useState(false)
  const startedRef = useRef(false)

  async function run() {
    if (startedRef.current) return
    startedRef.current = true
    setRunning(true)
    setStage(0)
    try {
      await projectService.evaluateProject(submission.id, (i) => setStage(i))
      pushToast({ kind: 'success', title: 'Project AI evaluation complete' })
    } catch {
      pushToast({ kind: 'error', title: 'Evaluation failed', message: 'The project AI evaluation could not be completed. Try again.' })
      startedRef.current = false
    } finally {
      setRunning(false)
    }
  }

  // One click: opening this modal starts the evaluation immediately.
  useEffect(() => {
    if (!evaluation && !running && !startedRef.current) run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      tone="ai"
      title={
        <span className="flex items-center gap-2">
          <FolderGit2 size={16} className="text-ai-600" /> Project AI Evaluation — {student?.name ?? 'Student'}
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {running && (
            <Button variant="ai" loading>
              Evaluating…
            </Button>
          )}
          {evaluation && !submission.published && (
            <Button
              icon={<Upload size={15} />}
              loading={pubBusy}
              onClick={async () => {
                setPubBusy(true)
                await projectService.publishProjectEvaluation(submission.id)
                setPubBusy(false)
                pushToast({ kind: 'success', title: 'Project evaluation published', message: 'The student can now view it.' })
                onClose()
              }}
            >
              Publish to Student
            </Button>
          )}
          {submission.published && <Badge tone="green">Published ✓</Badge>}
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="label mb-2">Detected project structure</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {submission.detectedStructure.map((e) => (
              <div key={e.path} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${e.present ? 'bg-paper text-ink-soft' : 'bg-rose-50 text-rose-600'}`}>
                {e.present ? '✓' : '✗'} <span className="font-mono">{e.path}</span>
              </div>
            ))}
          </div>
        </div>

        {(running || (!evaluation && startedRef.current)) && (
          <AIStageRunner stages={PROJECT_AI_STAGES} currentIndex={stage < 0 ? 0 : stage} />
        )}

        {!running && !evaluation && !startedRef.current && (
          <div className="rounded-xl border border-dashed border-ai-200 bg-ai-50/50 p-6 text-center">
            <Sparkles size={20} className="mx-auto mb-2 text-ai-500" />
            <p className="text-sm font-semibold text-ink">Starting project AI evaluation…</p>
          </div>
        )}

        {evaluation && !running && (
          <div className="animate-fade-up">
            <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">✓ Project AI Evaluation Complete</div>
            <ProjectReport evaluation={evaluation} />
          </div>
        )}
      </div>
    </Modal>
  )
}
