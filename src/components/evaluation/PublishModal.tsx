import { useState } from 'react'
import { Check, EyeOff } from 'lucide-react'
import { Button, Modal } from '@/components/ui/primitives'
import { evaluationService } from '@/services/evaluationService'
import { pushToast } from '@/store/store'

export function PublishModal({
  open,
  onClose,
  submissionId,
  aiScore,
  evaluatorScore,
}: {
  open: boolean
  onClose: () => void
  submissionId: string
  aiScore: number
  evaluatorScore: number | null
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Publish Evaluation?"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true)
              await evaluationService.publishEvaluation(submissionId)
              setBusy(false)
              onClose()
              pushToast({ kind: 'success', title: 'Evaluation published', message: 'The student can now see the AI result.' })
            }}
          >
            Publish
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-ai-200 bg-ai-50 p-3 text-center">
            <p className="text-xs text-ink-muted">AI Evaluation</p>
            <p className="font-display text-2xl font-semibold text-ai-700">{aiScore}/100</p>
          </div>
          <div className="rounded-xl border border-line bg-paper p-3 text-center">
            <p className="text-xs text-ink-muted">Evaluator Evaluation</p>
            <p className="font-display text-2xl font-semibold text-brand-700">{evaluatorScore != null ? `${evaluatorScore}/100` : '—'}</p>
          </div>
        </div>

        <div>
          <p className="mb-1.5 font-semibold text-ink">The student will be able to view:</p>
          <ul className="space-y-1 text-ink-soft">
            {['AI score', 'AI explanation', 'Test cases', 'Passed / failed checks', 'Recommendations', 'AI-content probability indicator'].map((x) => (
              <li key={x} className="flex items-center gap-2">
                <Check size={14} className="text-emerald-600" /> {x}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl bg-paper p-3">
          <p className="flex items-center gap-1.5 font-semibold text-ink">
            <EyeOff size={14} /> Kept private
          </p>
          <p className="mt-1 text-xs text-ink-muted">Your rubric marks, comments, strengths and improvement notes remain evaluator-only and are never shown to the student.</p>
        </div>
      </div>
    </Modal>
  )
}
