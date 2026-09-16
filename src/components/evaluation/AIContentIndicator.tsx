import { ShieldQuestion } from 'lucide-react'
import { Progress } from '@/components/ui/primitives'
import { InfoTip } from '@/components/ui/primitives'
import { ProbabilityBadge } from '@/components/shared/StageBadges'

export function AIContentIndicator({ probability, classification }: { probability: number; classification: string }) {
  return (
    <div className="rounded-xl border border-ai-200 bg-ai-50/60 p-4">
      <div className="mb-2 flex items-center gap-2">
        <ShieldQuestion size={16} className="text-ai-600" />
        <h4 className="text-sm font-semibold text-ink">Estimated AI-Generated Content Probability</h4>
        <InfoTip text="This is an automated, probabilistic indicator derived from stylistic and structural signals. It is not definitive proof that any part of the submission was AI-generated and should never be used as the sole basis for an academic-integrity decision." />
      </div>
      <div className="flex items-end gap-3">
        <span className="font-display text-3xl font-semibold text-ai-700">{probability}%</span>
        <ProbabilityBadge value={probability} />
      </div>
      <Progress value={probability} tone="ai" className="mt-2" />
      <p className="mt-2 text-xs leading-relaxed text-ink-muted">
        Classification: <span className="font-semibold text-ink-soft">{classification}</span>. This indicator is probabilistic and
        should not be treated as definitive proof.
      </p>
    </div>
  )
}
