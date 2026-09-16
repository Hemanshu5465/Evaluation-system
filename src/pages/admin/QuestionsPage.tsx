import { useState } from 'react'
import { Eye, ListChecks, Trash2, Upload } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge, Button, Card, EmptyState, Modal } from '@/components/ui/primitives'
import { questionService } from '@/services/questionService'
import { pushToast, useStore } from '@/store/store'
import { fmtDate } from '@/lib/format'
import type { Question } from '@/types'

export function QuestionsPage() {
  const questions = useStore((s) => s.questions)
  const subjects = useStore((s) => s.subjects)
  const [view, setView] = useState<Question | null>(null)
  const [toDelete, setToDelete] = useState<Question | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    try {
      await questionService.deleteQuestion(toDelete.id)
      pushToast({ kind: 'success', title: 'Question deleted' })
      setToDelete(null)
    } catch (e) {
      pushToast({ kind: 'error', title: 'Delete failed', message: e instanceof Error ? e.message : 'Try again.' })
    } finally {
      setDeleting(false)
    }
  }

  if (questions.length === 0) {
    return (
      <div>
        <PageHeader title="Questions" />
        <EmptyState icon={<ListChecks size={20} />} title="No questions yet" message="Generate a scenario question from the Question Generator." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Questions" subtitle="Each question is one common prompt with multiple parts and a shared rubric." />
      <div className="grid gap-3">
        {questions.map((q) => {
          const subject = subjects.find((s) => s.id === q.subjectId)
          return (
            <Card key={q.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-ink">{q.title}</h3>
                  <Badge tone={q.status === 'published' ? 'green' : q.status === 'ready' ? 'amber' : 'neutral'}>{q.status}</Badge>
                  <Badge tone={q.difficulty === 'Advanced' ? 'rose' : 'ai'}>{q.difficulty}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {subject?.name} · {q.parts.length} parts · {q.rubric.reduce((a, r) => a + r.maxMarks, 0)} marks · created {fmtDate(q.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="ghost" icon={<Eye size={14} />} onClick={() => setView(q)}>
                  View
                </Button>
                {q.status !== 'published' && (
                  <Button
                    icon={<Upload size={14} />}
                    onClick={async () => {
                      await questionService.setStatus(q.id, 'published')
                      pushToast({ kind: 'success', title: 'Question published' })
                    }}
                  >
                    Publish
                  </Button>
                )}
                <Button variant="ghost" icon={<Trash2 size={14} />} onClick={() => setToDelete(q)}>
                  Delete
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete this question?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleting} icon={<Trash2 size={15} />} onClick={confirmDelete}>
              Delete question
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          <span className="font-semibold text-ink">{toDelete?.title}</span> and everything tied to it — its parts, rubric,
          every student's scenario{toDelete?.status === 'published' ? ', and any submissions and evaluations' : ''} — will be
          permanently removed. This cannot be undone.
        </p>
      </Modal>

      <Modal open={!!view} onClose={() => setView(null)} title={view?.title ?? ''} size="lg">
        {view && (
          <div className="space-y-4 text-sm">
            <Badge tone={view.difficulty === 'Advanced' ? 'rose' : 'ai'}>{view.difficulty}</Badge>
            <p className="rounded-xl bg-paper p-3 leading-relaxed text-ink-soft">{view.commonPrompt}</p>
            <div>
              <p className="label">Constraints</p>
              <ul className="list-inside list-disc text-ink-soft">
                {view.constraints.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
            {view.parts.map((p) => (
              <div key={p.id} className="rounded-xl border border-line p-3">
                <div className="flex justify-between">
                  <span className="font-semibold text-ink">{p.label}</span>
                  <span className="text-xs text-ink-muted">{p.marks} marks</span>
                </div>
                <p className="mt-1 text-ink-soft">{p.prompt}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
