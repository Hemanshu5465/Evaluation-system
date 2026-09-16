import { useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import type { AITestCase } from '@/types'
import { cn } from '@/lib/format'

export function TestCaseList({ cases }: { cases: AITestCase[] }) {
  const [open, setOpen] = useState<string | null>(cases.find((c) => !c.passed)?.id ?? null)
  const passed = cases.filter((c) => c.passed).length

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-ink">Test Cases</h4>
        <span className="text-xs text-ink-muted">
          {passed} passed · {cases.length - passed} failed
        </span>
      </div>
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {cases.map((tc, i) => {
          const isOpen = open === tc.id
          return (
            <div key={tc.id}>
              <button
                onClick={() => setOpen(isOpen ? null : tc.id)}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-paper"
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white',
                    tc.passed ? 'bg-emerald-500' : 'bg-rose-500',
                  )}
                >
                  {tc.passed ? <Check size={13} /> : <X size={13} />}
                </span>
                <span className="w-14 shrink-0 font-mono text-xs text-ink-muted">TC-{String(i + 1).padStart(3, '0')}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{tc.name}</span>
                <span className="shrink-0 text-xs font-semibold text-ink-soft">
                  {tc.score}/{tc.maxScore}
                </span>
                <span className={cn('shrink-0 text-xs font-semibold', tc.passed ? 'text-emerald-600' : 'text-rose-600')}>
                  {tc.passed ? 'Passed' : 'Failed'}
                </span>
                <ChevronDown size={15} className={cn('shrink-0 text-ink-muted transition-transform', isOpen && 'rotate-180')} />
              </button>
              {isOpen && (
                <div className="animate-fade-up space-y-3 border-t border-line bg-paper/60 px-3.5 py-3.5 text-sm">
                  <p className="text-ink-soft">{tc.description}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Expected result" value={tc.expected} />
                    <Field label="Student result" value={tc.actual} tone={tc.passed ? 'ok' : 'bad'} />
                  </div>
                  <div>
                    <p className="label mb-1 text-ai-700">AI explanation</p>
                    <p className="rounded-lg bg-ai-50 px-3 py-2 text-[13px] leading-relaxed text-ink-soft">{tc.explanation}</p>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Field({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  return (
    <div>
      <p className="label mb-1">{label}</p>
      <p
        className={cn(
          'rounded-lg border px-3 py-2 text-[13px]',
          tone === 'ok' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
          tone === 'bad' && 'border-rose-200 bg-rose-50 text-rose-700',
          !tone && 'border-line bg-card text-ink-soft',
        )}
      >
        {value}
      </p>
    </div>
  )
}
