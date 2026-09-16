import { useEffect, useState } from 'react'
import { Eye, Pencil, RefreshCw, Save, Sparkles, Upload } from 'lucide-react'
import type { Question } from '@/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge, Button, Card, EmptyState, Modal } from '@/components/ui/primitives'
import { questionService } from '@/services/questionService'
import { pushToast, useStore } from '@/store/store'

export function QuestionGeneratorPage() {
  const subjects = useStore((s) => s.subjects).filter((s) => s.syllabus?.status === 'ready')
  const [subjectId, setSubjectId] = useState('')

  useEffect(() => {
    if (!subjectId && subjects.length) setSubjectId(subjects[0].id)
  }, [subjects, subjectId])
  const difficulty: Question['difficulty'] = 'Medium'
  const [subQuestions, setSubQuestions] = useState(4)
  const [rules, setRules] = useState('Weight correctness heaviest. Penalise normalization violations. Reward documented assumptions.')
  const [topics, setTopics] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [stage, setStage] = useState('')
  const [result, setResult] = useState<Question | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const subject = subjects.find((s) => s.id === subjectId)

  async function generate() {
    if (!subjectId) {
      pushToast({ kind: 'warning', title: 'Select a subject with a processed syllabus first' })
      return
    }
    setGenerating(true)
    setResult(null)
    try {
      const q = await questionService.generateQuestion({ subjectId, difficulty, topics, subQuestions, evaluationRules: rules }, setStage)
      setResult(q)
      pushToast({ kind: 'success', title: 'Question generated', message: 'Review, edit and publish below.' })
    } catch (e) {
      pushToast({ kind: 'error', title: 'Generation failed', message: e instanceof Error ? e.message : 'Try again.' })
    } finally {
      setGenerating(false)
      setStage('')
    }
  }

  return (
    <div>
      <PageHeader title="Question Generator" subtitle="Generates exactly one common question with multiple parts. Every student answers this same question against a different scenario." />

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card>
          <h3 className="text-sm font-semibold text-ink">Generation settings</h3>
          <div className="mt-4 space-y-4">
            <div>
              <label className="label">Subject</label>
              <select className="input" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setTopics([]) }}>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Topics ({topics.length} selected)</label>
              <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                {subject?.syllabus?.topics.map((t) => {
                  const on = topics.includes(t)
                  return (
                    <button key={t} onClick={() => setTopics((p) => (on ? p.filter((x) => x !== t) : [...p, t]))} className={`rounded-lg px-2 py-1 text-xs ${on ? 'bg-brand-600 text-white' : 'bg-paper text-ink-soft'}`}>
                      {t}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="label">Question type</label>
              <select className="input" defaultValue="scenario">
                <option value="scenario">Scenario-based design + implementation</option>
                <option value="analysis">Analysis &amp; proof</option>
              </select>
            </div>
            <div>
              <label className="label">Number of sub-questions: {subQuestions}</label>
              <input type="range" min={2} max={5} value={subQuestions} onChange={(e) => setSubQuestions(Number(e.target.value))} className="w-full accent-brand-600" />
            </div>
            <div>
              <label className="label">Evaluation rules</label>
              <textarea className="input min-h-24" value={rules} onChange={(e) => setRules(e.target.value)} />
            </div>
            <Button className="w-full" variant="ai" icon={<Sparkles size={15} />} loading={generating} onClick={generate}>
              Generate Scenario Question
            </Button>
          </div>
        </Card>

        <div>
          {generating && (
            <Card className="flex flex-col items-center justify-center py-16 text-center">
              <div className="relative mb-4 flex h-14 w-14 items-center justify-center">
                <span className="absolute h-full w-full animate-ping rounded-full bg-ai-200" />
                <Sparkles size={24} className="relative text-ai-600" />
              </div>
              <p className="text-sm font-semibold text-ink">Generating the common question…</p>
              <p className="mt-1 text-xs text-ink-muted">{stage}</p>
            </Card>
          )}

          {!generating && !result && (
            <Card className="flex flex-col items-center justify-center border-dashed py-16 text-center">
              <Sparkles size={22} className="mb-2 text-ink-muted" />
              <p className="text-sm font-semibold text-ink">No question generated yet</p>
              <p className="mt-1 max-w-sm text-xs text-ink-muted">Configure the settings and generate. You'll get one main question with {subQuestions} parts and an aligned rubric.</p>
            </Card>
          )}

          {result && !generating && (
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-base font-semibold text-ink">{result.title}</h3>
                <Badge tone={result.status === 'published' ? 'green' : 'amber'}>{result.status}</Badge>
              </div>

              <p className="label">Common scenario prompt</p>
              <p className="rounded-xl bg-paper p-3 text-sm leading-relaxed text-ink-soft">{result.commonPrompt}</p>

              <p className="label mt-4">Parts</p>
              <div className="space-y-2">
                {result.parts.map((p) => (
                  <div key={p.id} className="rounded-xl border border-line p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-ink">{p.label}</span>
                      <span className="text-xs text-ink-muted">{p.marks} marks</span>
                    </div>
                    <p className="mt-1 text-sm text-ink-soft">{p.prompt}</p>
                  </div>
                ))}
              </div>

              <p className="label mt-4">Evaluation rubric</p>
              <div className="flex flex-wrap gap-1.5">
                {result.rubric.map((r) => (
                  <span key={r.id} className="rounded-lg bg-paper px-2.5 py-1 text-xs text-ink-soft">
                    {r.name} · {r.maxMarks}
                  </span>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="subtle" icon={<RefreshCw size={14} />} onClick={generate}>
                  Regenerate
                </Button>
                <Button variant="subtle" icon={<Pencil size={14} />} onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
                <Button variant="subtle" icon={<Eye size={14} />} onClick={() => setPreviewOpen(true)}>
                  Preview student version
                </Button>
                <Button
                  variant="ghost"
                  icon={<Save size={14} />}
                  onClick={async () => {
                    await questionService.setStatus(result.id, 'ready')
                    pushToast({ kind: 'success', title: 'Saved to Questions' })
                  }}
                >
                  Save
                </Button>
                <Button
                  icon={<Upload size={14} />}
                  onClick={async () => {
                    await questionService.setStatus(result.id, 'published')
                    setResult({ ...result, status: 'published' })
                    pushToast({ kind: 'success', title: 'Question published', message: 'Build an assessment from Assignments.' })
                  }}
                >
                  Publish
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {result && (
        <EditQuestionModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          question={result}
          onSave={(patch) => {
            questionService.updateQuestion(result.id, patch)
            setResult({ ...result, ...patch })
            pushToast({ kind: 'success', title: 'Question updated' })
          }}
        />
      )}

      {result && (
        <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Student preview" size="lg">
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-paper p-4">
              <p className="label">Common Question — identical for every student</p>
              <p className="text-sm leading-relaxed text-ink-soft">{result.commonPrompt}</p>
            </div>
            <div className="rounded-xl border border-ai-200 bg-ai-50 p-4">
              <p className="label text-ai-700">Your Scenario — personalized</p>
              <p className="text-sm text-ink-soft">
                Each student receives a unique scenario generated from this question when it is published. The
                conceptual task and the rubric are identical for every student.
              </p>
            </div>
            {result.parts.map((p) => (
              <div key={p.id}>
                <p className="text-sm font-semibold text-ink">{p.label}</p>
                <p className="text-sm text-ink-soft">{p.prompt}</p>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

function EditQuestionModal({ open, onClose, question, onSave }: { open: boolean; onClose: () => void; question: Question; onSave: (patch: Partial<Question>) => void }) {
  const [prompt, setPrompt] = useState(question.commonPrompt)
  const [parts, setParts] = useState(question.parts)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit question"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave({ commonPrompt: prompt, parts })
              onClose()
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Common scenario prompt</label>
          <textarea className="input min-h-28" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </div>
        {parts.map((p, i) => (
          <div key={p.id}>
            <label className="label">{p.label}</label>
            <textarea
              className="input min-h-20"
              value={p.prompt}
              onChange={(e) => setParts((prev) => prev.map((x, j) => (j === i ? { ...x, prompt: e.target.value } : x)))}
            />
          </div>
        ))}
      </div>
    </Modal>
  )
}
