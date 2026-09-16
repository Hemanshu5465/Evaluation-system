import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { Submission } from '@/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { Avatar, Badge, Button, Card, EmptyState } from '@/components/ui/primitives'
import { AIStatusBadge } from '@/components/shared/StageBadges'
import { AIEvaluationModal } from '@/components/evaluation/AIEvaluationModal'
import { useEvaluator } from '@/hooks/useCurrentUser'
import { useAppState } from '@/store/store'
import { students } from '@/store/refs'
export function AIEvaluationsPage() {
  const evaluator = useEvaluator()
  const state = useAppState()
  const [modal, setModal] = useState<Submission | null>(null)

  const rows = state.submissions
    .filter((s) => evaluator.assignedStudentIds.includes(s.studentId) && s.stage !== 'not_started')
    .map((s) => ({ s, ai: state.aiEvaluations.find((a) => a.submissionId === s.id) }))

  if (rows.length === 0) {
    return (
      <div>
        <PageHeader title="AI Evaluations" />
        <EmptyState icon={<Sparkles size={20} />} title="No submissions to evaluate" message="AI evaluations appear here once your students submit." />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="AI Evaluations" subtitle="Run and review automated evaluations for your assigned submissions." />
      <div className="grid gap-3">
        {rows.map(({ s, ai }) => {
          const student = students.find((x) => x.id === s.studentId)!
          return (
            <Card key={s.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={student.name} color={student.avatarColor} />
                <div>
                  <p className="text-sm font-semibold text-ink">{student.name}</p>
                  <p className="text-xs text-ink-muted">{s.zipName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <AIStatusBadge status={ai?.status} />
                {ai?.status === 'completed' && <Badge tone="ai">{ai.score}/100</Badge>}
                <Button variant="ai" icon={<Sparkles size={14} />} onClick={() => setModal(s)}>
                  {ai?.status === 'completed' ? 'View' : 'Run AI Evaluation'}
                </Button>
              </div>
            </Card>
          )
        })}
      </div>
      {modal && <AIEvaluationModal submission={modal} open onClose={() => setModal(null)} />}
    </div>
  )
}
