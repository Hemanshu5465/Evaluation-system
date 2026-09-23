import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Info } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/ui/primitives'
import { AssessmentPanel } from '@/components/student/AssessmentPanel'
import { useAppState } from '@/store/store'
import { daysUntil, fmtDate } from '@/lib/format'
import { useAntiScreenshot } from '@/hooks/useAntiScreenshot'

export function AssessmentPage() {
  const { id } = useParams()
  const state = useAppState()
  const assessment = state.assessments.find((a) => a.id === id)
  const question = assessment ? state.questions.find((q) => q.id === assessment.questionId) : undefined

  // Activates anti-screenshot protection for the duration of this page.
  // The overlay is injected directly into the DOM (no React render lag).
  useAntiScreenshot()

  if (!id || !assessment || !question) {
    return <EmptyState icon={<Info size={20} />} title="Assessment unavailable" message="This assessment may not be published yet, or it hasn't been prepared." />
  }

  return (
    <div>
      <Link to="/student/assessments" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft size={15} /> My assessments
      </Link>
      <PageHeader
        title={assessment.title}
        subtitle={assessment.deadline ? `Deadline ${fmtDate(assessment.deadline)} · ${daysUntil(assessment.deadline)} days left` : 'Scenario-based assessment'}
      />
      <AssessmentPanel assessmentId={id} />
    </div>
  )
}

