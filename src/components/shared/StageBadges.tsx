import type { AIEvaluationStatus, ManualEvaluationStatus, SubmissionStage } from '@/types'
import { Badge } from '@/components/ui/primitives'

export function SubmissionStageBadge({ stage }: { stage: SubmissionStage }) {
  const map: Record<SubmissionStage, [string, Parameters<typeof Badge>[0]['tone']]> = {
    not_started: ['Not Submitted', 'neutral'],
    uploaded: ['Uploaded', 'blue'],
    submitted: ['Submitted', 'blue'],
    sent_to_evaluator: ['With Evaluator', 'amber'],
    ai_evaluation: ['AI Evaluating', 'ai'],
    evaluator_review: ['Evaluator Review', 'amber'],
    published: ['Published', 'green'],
  }
  const [label, tone] = map[stage]
  return <Badge tone={tone}>{label}</Badge>
}

export function AIStatusBadge({ status }: { status: AIEvaluationStatus | undefined }) {
  const map: Record<AIEvaluationStatus, [string, Parameters<typeof Badge>[0]['tone']]> = {
    not_started: ['Not Started', 'neutral'],
    in_progress: ['In Progress', 'ai'],
    completed: ['Completed', 'green'],
    failed: ['Failed', 'rose'],
  }
  const [label, tone] = map[status ?? 'not_started']
  return <Badge tone={tone}>{label}</Badge>
}

export function ManualStatusBadge({ status }: { status: ManualEvaluationStatus | undefined }) {
  const map: Record<ManualEvaluationStatus, [string, Parameters<typeof Badge>[0]['tone']]> = {
    pending: ['Pending', 'neutral'],
    draft: ['Draft', 'amber'],
    completed: ['Completed', 'green'],
  }
  const [label, tone] = map[status ?? 'pending']
  return <Badge tone={tone}>{label}</Badge>
}

export function ProbabilityBadge({ value }: { value: number }) {
  const tone = value < 30 ? 'green' : value < 60 ? 'amber' : 'rose'
  const label = value < 30 ? 'Low Probability' : value < 60 ? 'Moderate Probability' : 'High Probability'
  return <Badge tone={tone}>{label}</Badge>
}
