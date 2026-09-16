import { useState } from 'react'
import { CheckCircle2, FolderGit2, Send } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge, Button, Card, Modal } from '@/components/ui/primitives'
import { Timeline, type TimelineStep } from '@/components/shared/Timeline'
import { ZipDropzone } from '@/components/upload/ZipDropzone'
import { projectService } from '@/services/projectService'
import { useStudent } from '@/hooks/useCurrentUser'
import { pushToast, useAppState } from '@/store/store'
import type { ProjectStage } from '@/types'
import { daysUntil, fmtDate } from '@/lib/format'

const ORDER: ProjectStage[] = ['not_started', 'uploaded', 'submitted', 'ai_evaluation', 'evaluator_review', 'published']
const STEPS: { key: ProjectStage; label: string }[] = [
  { key: 'uploaded', label: 'Upload ZIP' },
  { key: 'submitted', label: 'Submit Project' },
  { key: 'ai_evaluation', label: 'AI Evaluation' },
  { key: 'evaluator_review', label: 'Evaluator Review' },
  { key: 'published', label: 'Published' },
]

export function StudentProjectPage() {
  const student = useStudent()
  const state = useAppState()
  const project = state.projects[0]
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!project) {
    return (
      <div>
        <PageHeader title="Project Evaluation" subtitle="A standalone workflow — separate from your syllabus assessment." />
        <Card className="text-sm text-ink-muted">No project has been assigned to you yet.</Card>
      </div>
    )
  }

  const submission = state.projectSubmissions.find((p) => p.studentId === student.id && p.projectId === project.id)

  const stage = submission?.stage ?? 'not_started'
  const stageIdx = ORDER.indexOf(stage)
  const hasUpload = stageIdx >= ORDER.indexOf('uploaded')
  const isSubmitted = stageIdx >= ORDER.indexOf('submitted')

  const steps: TimelineStep[] = STEPS.map((s) => {
    const idx = ORDER.indexOf(s.key)
    return { label: s.label, state: stageIdx > idx ? 'done' : stageIdx === idx ? 'current' : 'todo' }
  })

  return (
    <div>
      <PageHeader title="Project Evaluation" subtitle="A standalone workflow — separate from your syllabus assessment." action={<Badge tone="ai">Project</Badge>} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ai-100 text-ai-600">
                <FolderGit2 size={20} />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Project Evaluation 01</p>
                <h3 className="text-base font-semibold text-ink">{project.title}</h3>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">{project.brief}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <Badge tone={daysUntil(project.deadline) < 7 ? 'amber' : 'neutral'}>Deadline {fmtDate(project.deadline)}</Badge>
              <span>{daysUntil(project.deadline)} days left</span>
            </div>
            <div className="mt-3">
              <p className="label">Expected files</p>
              <div className="flex flex-wrap gap-1.5">
                {project.expectedFiles.map((f) => (
                  <span key={f} className="rounded-lg bg-paper px-2 py-1 font-mono text-xs text-ink-soft">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </Card>

          {!isSubmitted && (
            <Card>
              <p className="label">Upload project archive</p>
              {!hasUpload ? (
                <ZipDropzone
                  accent="ai"
                  hint="Only .zip files · include README, docs, database script and source"
                  onUpload={async (file, onProgress) => {
                    await projectService.uploadProjectZip(project.id, file, onProgress)
                  }}
                />
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-xl border border-line bg-paper p-3">
                    <FolderGit2 size={18} className="text-ai-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{submission!.zipName}</p>
                      <p className="text-xs text-ink-muted">{submission!.zipSizeMB} MB</p>
                    </div>
                    <Badge tone="green">✓ Extracted</Badge>
                  </div>
                  <div>
                    <p className="label">Detected structure</p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {submission!.detectedStructure.map((e) => (
                        <div
                          key={e.path}
                          className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs ${e.present ? 'bg-paper text-ink-soft' : 'bg-rose-50 text-rose-600'}`}
                        >
                          {e.present ? '✓' : '✗'} <span className="font-mono">{e.path}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button variant="ai" icon={<Send size={15} />} onClick={() => setConfirmOpen(true)}>
                    Submit Project
                  </Button>
                </div>
              )}
            </Card>
          )}

          {isSubmitted && (
            <Card className="border-emerald-200 bg-emerald-50/50">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-600" />
                <p className="text-sm font-semibold text-ink">Project submitted</p>
              </div>
              <p className="mt-1 text-xs text-ink-muted">Your evaluator will run the project AI evaluation and review it. The result appears in Results once published.</p>
            </Card>
          )}
        </div>

        <Card>
          <p className="label">Project workflow</p>
          <Timeline steps={steps} />
        </Card>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        tone="ai"
        title="Submit this project?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="ai"
              loading={busy}
              onClick={async () => {
                setBusy(true)
                await projectService.submitProject(submission!.id)
                setBusy(false)
                setConfirmOpen(false)
                pushToast({ kind: 'success', title: 'Project submitted', message: 'Your evaluator has been notified.' })
              }}
            >
              Confirm &amp; Submit
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          Submitting <span className="font-mono font-semibold text-ink">{submission?.zipName}</span> for {project.title}. You won't be able to
          change files afterwards.
        </p>
      </Modal>
    </div>
  )
}
