import { useState } from 'react'
import { CheckCircle2, Send } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Avatar, Badge, Button, Card } from '@/components/ui/primitives'
import { evaluators, students } from '@/store/refs'
import { pushToast, store, useStore } from '@/store/store'
import { fmtDate } from '@/lib/format'

export function AssignmentsPage() {
  const assessments = useStore((s) => s.assessments)
  const subjects = useStore((s) => s.subjects)

  return (
    <div>
      <PageHeader title="Assignments" subtitle="Bind a published question to students and an evaluator, then publish the assessment." />
      <div className="space-y-4">
        {assessments.map((a) => {
          const subject = subjects.find((s) => s.id === a.subjectId)
          const evaluator = evaluators.find((e) => e.id === a.assignedEvaluatorId)
          return (
            <Card key={a.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink">{a.title}</h3>
                    <Badge tone={a.status === 'published' ? 'green' : 'amber'}>{a.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {subject?.name} · {a.studentIds.length} students · deadline {fmtDate(a.deadline)}
                  </p>
                </div>
                <PublishBtn id={a.id} status={a.status} />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="label">Assigned evaluator</p>
                  {evaluator && (
                    <div className="flex items-center gap-2">
                      <Avatar name={evaluator.name} color={evaluator.avatarColor} size={28} />
                      <span className="text-sm text-ink-soft">{evaluator.name}</span>
                    </div>
                  )}
                </div>
                <div>
                  <p className="label">Students ({a.studentIds.length})</p>
                  <div className="flex flex-wrap gap-1">
                    {a.studentIds.map((id) => {
                      const s = students.find((x) => x.id === id)!
                      return (
                        <Badge key={id} tone="neutral">
                          {s.name.split(' ')[0]}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function PublishBtn({ id, status }: { id: string; status: string }) {
  const [busy, setBusy] = useState(false)
  if (status === 'published')
    return (
      <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
        <CheckCircle2 size={16} /> Published
      </span>
    )
  return (
    <Button
      loading={busy}
      icon={<Send size={14} />}
      onClick={async () => {
        setBusy(true)
        await new Promise((r) => setTimeout(r, 700))
        store.set((d) => {
          const a = d.assessments.find((x) => x.id === id)
          if (a) a.status = 'published'
        })
        setBusy(false)
        pushToast({ kind: 'success', title: 'Assessment published', message: 'Students can now start it.' })
      }}
    >
      Publish assessment
    </Button>
  )
}
