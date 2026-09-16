import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button, Card } from '@/components/ui/primitives'
import { pushToast, store } from '@/store/store'

export function SettingsPage() {
  const [publishAI, setPublishAI] = useState(true)
  const [publishEvaluator, setPublishEvaluator] = useState(false)
  const [aiDetector, setAiDetector] = useState(true)

  return (
    <div>
      <PageHeader title="Settings" subtitle="Platform-wide configuration for the assessment cycle." />
      <div className="grid gap-4">
        <Card>
          <h3 className="text-sm font-semibold text-ink">Result publishing</h3>
          <div className="mt-3 space-y-3">
            <Toggle label="Publish AI evaluation to students" desc="When an evaluator publishes, the student sees the AI score, test cases and recommendations." on={publishAI} onChange={setPublishAI} />
            <Toggle
              label="Publish evaluator private score to students"
              desc="Off by default. The evaluator's rubric marks and comments stay evaluator-only in this prototype."
              on={publishEvaluator}
              onChange={setPublishEvaluator}
            />
            <Toggle label="Show AI-generated content probability indicator" desc="Displays the probabilistic AI-content estimate with its disclaimer." on={aiDetector} onChange={setAiDetector} />
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-ink">Constraints</h3>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <Row k="Max subjects" v="3" />
            <Row k="Questions per assessment" v="1 (multi-part)" />
            <Row k="Allowed submission format" v=".zip" />
            <Row k="Max archive size" v="25 MB" />
          </dl>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-ink">Prototype data</h3>
          <p className="mt-1 text-sm text-ink-muted">Reset all mock data to its seeded state. You will be signed out.</p>
          <Button
            variant="danger"
            className="mt-3"
            icon={<RotateCcw size={14} />}
            onClick={() => {
              store.reset()
              pushToast({ kind: 'info', title: 'Prototype data reset' })
              window.location.href = '/login'
            }}
          >
            Reset prototype data
          </Button>
        </Card>
      </div>
    </div>
  )
}

function Toggle({ label, desc, on, onChange }: { label: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-line p-3">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        <p className="text-xs text-ink-muted">{desc}</p>
      </div>
      <button
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-brand-600' : 'bg-line'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between rounded-lg bg-paper px-3 py-2">
      <dt className="text-ink-muted">{k}</dt>
      <dd className="font-semibold text-ink">{v}</dd>
    </div>
  )
}
