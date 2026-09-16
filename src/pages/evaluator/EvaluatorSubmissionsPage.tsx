import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, Sparkles, SquarePen } from 'lucide-react'
import type { Submission } from '@/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { Avatar, Button } from '@/components/ui/primitives'
import { DataTable } from '@/components/tables/DataTable'
import { AIStatusBadge, ManualStatusBadge, SubmissionStageBadge } from '@/components/shared/StageBadges'
import { AIEvaluationModal } from '@/components/evaluation/AIEvaluationModal'
import { useEvaluator } from '@/hooks/useCurrentUser'
import { useAppState } from '@/store/store'
import { students } from '@/store/refs'
import { fmtDate } from '@/lib/format'

export function EvaluatorSubmissionsPage() {
  const evaluator = useEvaluator()
  const state = useAppState()
  const navigate = useNavigate()
  const [aiModal, setAiModal] = useState<Submission | null>(null)

  const rows = state.submissions
    .filter((s) => evaluator.assignedStudentIds.includes(s.studentId))
    .map((s) => {
      const student = students.find((x) => x.id === s.studentId)!
      return {
        id: s.id,
        submission: s,
        student,
        stage: s.stage,
        submittedAt: s.submittedAt,
        ai: state.aiEvaluations.find((a) => a.submissionId === s.id)?.status,
        manual: state.manualEvaluations.find((m) => m.submissionId === s.id)?.status,
      }
    })

  return (
    <div>
      <PageHeader title="Student Submissions" subtitle="Submissions from your assigned students." />

      <DataTable
        rows={rows}
        onRowClick={(r) => navigate(`/evaluator/submissions/${r.id}`)}
        searchKeys={(r) => `${r.student.name} ${r.student.studentCode}`}
        searchPlaceholder="Search student or ID…"
        filters={[
          {
            key: 'stage',
            label: 'Status',
            options: [
              { value: 'sent_to_evaluator', label: 'With evaluator' },
              { value: 'submitted', label: 'Submitted' },
              { value: 'ai_evaluation', label: 'AI evaluating' },
              { value: 'evaluator_review', label: 'Evaluator review' },
              { value: 'published', label: 'Published' },
              { value: 'not_started', label: 'Not submitted' },
            ],
          },
        ]}
        columns={[
          {
            key: 'student',
            header: 'Student',
            sortValue: (r) => r.student.name,
            render: (r) => (
              <div className="flex items-center gap-2.5">
                <Avatar name={r.student.name} color={r.student.avatarColor} size={30} />
                <div>
                  <p className="font-semibold text-ink">{r.student.name}</p>
                  <p className="text-xs text-ink-muted">{r.student.studentCode}</p>
                </div>
              </div>
            ),
          },
          { key: 'assessment', header: 'Assessment', render: (r) => <span className="text-ink-soft">{r.submission.assessmentTitle ?? 'Assessment'}</span> },
          { key: 'submittedAt', header: 'Submitted', sortValue: (r) => r.submittedAt ?? '', render: (r) => fmtDate(r.submittedAt) },
          { key: 'ai', header: 'AI Status', render: (r) => <AIStatusBadge status={r.ai} /> },
          { key: 'manual', header: 'Evaluator', render: (r) => <ManualStatusBadge status={r.manual} /> },
          { key: 'final', header: 'Final', render: (r) => <SubmissionStageBadge stage={r.stage} /> },
          {
            key: 'actions',
            header: 'Actions',
            render: (r) => (
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <button className="rounded-lg border border-line p-1.5 text-ink-soft hover:bg-paper" title="View" onClick={() => navigate(`/evaluator/submissions/${r.id}`)}>
                  <Eye size={14} />
                </button>
                <button
                  className="rounded-lg border border-line p-1.5 text-ai-600 hover:bg-ai-50 disabled:opacity-40"
                  title="AI Evaluation"
                  disabled={r.stage === 'not_started'}
                  onClick={() => setAiModal(r.submission)}
                >
                  <Sparkles size={14} />
                </button>
                <button
                  className="rounded-lg border border-line p-1.5 text-brand-600 hover:bg-brand-50 disabled:opacity-40"
                  title="Evaluate"
                  disabled={!r.ai || r.ai !== 'completed'}
                  onClick={() => navigate(`/evaluator/manual/${r.id}`)}
                >
                  <SquarePen size={14} />
                </button>
              </div>
            ),
          },
        ]}
      />

      {aiModal && <AIEvaluationModal submission={aiModal} open onClose={() => setAiModal(null)} />}
    </div>
  )
}
