import { useEffect, useRef, useState } from 'react'
import { FileText, Sparkles } from 'lucide-react'
import type { Submission } from '@/types'
import { AI_STAGES } from '@/data/mockData'
import { evaluationService } from '@/services/evaluationService'
import { pushToast, useStore } from '@/store/store'
import { Button, Modal } from '@/components/ui/primitives'
import { Avatar } from '@/components/ui/primitives'
import { AIStageRunner } from './AIStageRunner'
import { AIReport } from './AIReport'
import { students } from '@/store/refs'
export function AIEvaluationModal({ submission, open, onClose }: { submission: Submission; open: boolean; onClose: () => void }) {
  const evaluation = useStore((s) => s.aiEvaluations.find((a) => a.submissionId === submission.id))
  const [running, setRunning] = useState(false)
  const [stageIndex, setStageIndex] = useState(-1)
  const startedRef = useRef(false)
  const student = students.find((s) => s.id === submission.studentId)!

  const isComplete = evaluation?.status === 'completed'

  async function run() {
    if (startedRef.current) return
    startedRef.current = true
    setRunning(true)
    setStageIndex(0)
    try {
      await evaluationService.startAIEvaluation(submission.id, (i) => setStageIndex(i))
      pushToast({ kind: 'success', title: 'AI evaluation complete', message: 'The full report is ready to review.' })
    } catch {
      pushToast({ kind: 'error', title: 'Evaluation failed', message: 'The AI evaluation could not be completed. Try again.' })
      startedRef.current = false // allow a retry
    } finally {
      setRunning(false)
    }
  }

  // One click: opening the modal starts the evaluation immediately.
  useEffect(() => {
    if (open && !isComplete && !running && !startedRef.current) run()
    if (!open) {
      startedRef.current = isComplete
      setStageIndex(-1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isComplete])

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      tone="ai"
      title={
        <span className="flex items-center gap-2">
          <Sparkles size={16} className="text-ai-600" />
          AI Evaluation
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
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper/60 p-3">
          <Avatar name={student.name} color={student.avatarColor} />
          <div>
            <p className="text-sm font-semibold text-ink">{student.name}</p>
            <p className="text-xs text-ink-muted">
              {student.studentCode} · {submission.zipName}
            </p>
          </div>
        </div>

        <div>
          <p className="label mb-2">Files in archive</p>
          <div className="flex flex-wrap gap-2">
            {submission.files.map((f) => (
              <span key={f.name} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-ink-soft">
                <FileText size={13} className="text-ink-muted" />
                {f.name}
                <span className="text-ink-muted">{f.sizeKB} KB</span>
              </span>
            ))}
          </div>
        </div>

        {(running || (!isComplete && startedRef.current)) && (
          <AIStageRunner stages={AI_STAGES} currentIndex={stageIndex < 0 ? 0 : stageIndex} />
        )}

        {!running && !isComplete && !startedRef.current && (
          <div className="rounded-xl border border-dashed border-ai-200 bg-ai-50/50 p-6 text-center">
            <Sparkles size={22} className="mx-auto mb-2 text-ai-500" />
            <p className="text-sm font-semibold text-ink">Starting AI evaluation…</p>
          </div>
        )}

        {isComplete && evaluation && (
          <div className="animate-fade-up">
            <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">✓ AI Evaluation Complete</div>
            <AIReport evaluation={evaluation} />
          </div>
        )}
      </div>
    </Modal>
  )
}
