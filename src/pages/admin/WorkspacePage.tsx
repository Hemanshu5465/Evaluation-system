import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  Rocket,
  Shuffle,
  Sparkles,
  UploadCloud,
} from 'lucide-react'
import type { Question } from '@/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge, Button, Card } from '@/components/ui/primitives'
import { adminApi, pollJob } from '@/api/endpoints'
import type { ScenarioDTO, SyllabusAnalysisDTO } from '@/api/dto'
import { questionService } from '@/services/questionService'
import { store, pushToast } from '@/store/store'
import { refreshWorkspace } from '@/store/bootstrap'

const DIFF_MAP: Record<SyllabusAnalysisDTO['difficulty'], Question['difficulty']> = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
}
const ACCEPT = '.pdf,.docx,.txt'

export function WorkspacePage() {
  const inputRef = useRef<HTMLInputElement>(null)

  const [uploading, setUploading] = useState(false)
  const [analysis, setAnalysis] = useState<SyllabusAnalysisDTO | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [semester, setSemester] = useState('')
  const [fileName, setFileName] = useState('')

  const [difficulty, setDifficulty] = useState<Question['difficulty']>('Medium')
  const [classCoverage, setClassCoverage] = useState('')
  const [generating, setGenerating] = useState(false)
  const [stage, setStage] = useState('')
  const [question, setQuestion] = useState<Question | null>(null)
  const [assessmentId, setAssessmentId] = useState('')

  const [durationMinutes, setDurationMinutes] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishedCount, setPublishedCount] = useState<number | null>(null)

  const [papers, setPapers] = useState<ScenarioDTO[]>([])
  const [buildingPapers, setBuildingPapers] = useState(false)

  const loadPapers = useCallback(async (id: string) => {
    try {
      setPapers(await adminApi.listScenarios(id))
    } catch {
      /* ignore — none yet */
    }
  }, [])

  // once published, keep refreshing the paper list until every student has one
  useEffect(() => {
    if (publishedCount == null || !assessmentId) return
    if (papers.length >= publishedCount) return
    const t = setTimeout(() => loadPapers(assessmentId), 3000)
    return () => clearTimeout(t)
  }, [publishedCount, assessmentId, papers.length, loadPapers])

  async function generateAllPapers() {
    if (!assessmentId) return
    setBuildingPapers(true)
    try {
      const job = await adminApi.generateScenarios(assessmentId)
      pushToast({ kind: 'info', title: 'Building student papers', message: 'One unique scenario per student — this runs in the background.' })
      await pollJob(job.id, undefined, 1500, 600_000)
      await loadPapers(assessmentId)
      pushToast({ kind: 'success', title: 'Student papers ready' })
    } catch (e) {
      pushToast({ kind: 'error', title: 'Could not build all papers', message: e instanceof Error ? e.message : 'Some may still generate when students open the assessment.' })
      await loadPapers(assessmentId)
    } finally {
      setBuildingPapers(false)
    }
  }

  async function handleFile(file: File) {
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase()
    if (!ACCEPT.includes(ext)) {
      pushToast({ kind: 'error', title: 'Unsupported file', message: 'Upload a PDF, DOCX or TXT syllabus.' })
      return
    }
    setUploading(true)
    setQuestion(null)
    setPublishedCount(null)
    try {
      const res = await adminApi.workspaceSyllabus(file)
      setAnalysis(res)
      setName(res.subject_name)
      setCode(res.subject_code)
      setSemester(res.semester ?? '')
      setDifficulty(DIFF_MAP[res.difficulty] ?? 'Medium')
      setFileName(file.name)
      pushToast({ kind: 'success', title: 'Syllabus analyzed', message: `Detected ${res.subject_name} (${res.subject_code}).` })
    } catch (e) {
      pushToast({ kind: 'error', title: 'Analysis failed', message: e instanceof Error ? e.message : 'Try again.' })
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function generate() {
    if (!analysis) return
    setGenerating(true)
    setQuestion(null)
    setPublishedCount(null)
    try {
      if (
        name.trim() !== analysis.subject_name ||
        code.trim() !== analysis.subject_code ||
        semester.trim() !== (analysis.semester ?? '')
      ) {
        await adminApi.updateSubject(analysis.subject_id, {
          name: name.trim(),
          code: code.trim(),
          semester: semester.trim(),
        })
      }
      const q = await questionService.generateQuestion(
        {
          subjectId: analysis.subject_id,
          difficulty,
          topics: analysis.topics,
          subQuestions: 4,
          evaluationRules: '',
          classCoverage,
        },
        setStage,
      )
      setQuestion(q)
      setAssessmentId(store.get().assessments.find((a) => a.questionId === q.id)?.id ?? '')
      pushToast({ kind: 'success', title: 'Question generated', message: 'Review it, then publish to students.' })
    } catch (e) {
      pushToast({ kind: 'error', title: 'Generation failed', message: e instanceof Error ? e.message : 'Try again.' })
    } finally {
      setGenerating(false)
      setStage('')
    }
  }

  async function publish() {
    if (!assessmentId) return
    setPublishing(true)
    try {
      const minutes = durationMinutes.trim() ? Number(durationMinutes) : undefined
      const dto = await adminApi.publish(assessmentId, minutes)
      setPublishedCount(dto.student_ids.length)
      await refreshWorkspace()
      loadPapers(assessmentId)
      pushToast({
        kind: 'success',
        title: 'Published to students',
        message: `Live on ${dto.student_ids.length} student dashboard${dto.student_ids.length === 1 ? '' : 's'}.`,
      })
    } catch (e) {
      pushToast({ kind: 'error', title: 'Publish failed', message: e instanceof Error ? e.message : 'Try again.' })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Assessment Workspace"
        subtitle="Upload a syllabus, generate the common question, and publish it to every student — all on this screen."
      />

      <div className="space-y-4">
        {/* Step 1 — syllabus */}
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <StepDot n={1} done={!!analysis} />
            <h3 className="text-sm font-semibold text-ink">Add syllabus</h3>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />

          {!analysis ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line px-6 py-10 text-center transition-colors hover:border-ink-muted hover:bg-paper disabled:opacity-60"
            >
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
                {uploading ? <Loader2 size={22} className="animate-spin" /> : <UploadCloud size={22} />}
              </span>
              <span className="text-sm font-semibold text-ink">
                {uploading ? 'Analyzing syllabus…' : 'Upload syllabus (PDF, DOCX or TXT)'}
              </span>
              <span className="mt-1 text-xs text-ink-muted">
                The system reads it and extracts the subject name and code automatically.
              </span>
            </button>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink-soft">
                <FileText size={15} className="text-brand-600" />
                <span className="truncate">{fileName}</span>
                <button
                  onClick={() => inputRef.current?.click()}
                  className="ml-auto shrink-0 text-xs font-semibold text-brand-700 hover:underline"
                >
                  Replace
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="ws-name">Subject name</label>
                  <input
                    id="ws-name"
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="ws-code">Subject code</label>
                    <input
                      id="ws-code"
                      className="input font-mono"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="ws-sem">Semester</label>
                    <input
                      id="ws-sem"
                      className="input"
                      placeholder="—"
                      value={semester}
                      onChange={(e) => setSemester(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {analysis.topics.length > 0 && (
                <div>
                  <p className="label">Detected topics</p>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.topics.map((t) => (
                      <span key={t} className="rounded-lg bg-paper px-2 py-1 text-xs text-ink-soft">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Step 2 — generate */}
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <StepDot n={2} done={!!question} />
            <h3 className="text-sm font-semibold text-ink">Generate question from the syllabus</h3>
          </div>

          {!generating && (
            <div className="mb-4">
              <label className="label">Difficulty level</label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['Easy', 'Medium', 'Hard', 'Advanced'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={!analysis}
                    onClick={() => setDifficulty(d)}
                    className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      difficulty === d
                        ? d === 'Advanced'
                          ? 'border-rose-500 bg-rose-50 text-rose-800'
                          : 'border-brand-500 bg-brand-50 text-brand-800'
                        : 'border-line text-ink-muted hover:border-ink-muted'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-ink-muted">
                Chooses how challenging the generated question is. Students never see this level.
                {difficulty === 'Advanced' && ' "Advanced" deliberately produces a harder, more twisted question that combines concepts and edge cases — students will need to think it through carefully.'}
              </p>

              <div className="mt-4">
                <label className="label" htmlFor="ws-coverage">Class coverage (optional) — keep the paper solvable</label>
                <textarea
                  id="ws-coverage"
                  className="input min-h-24"
                  placeholder={
                    'Paste the topics or example questions you actually taught in class, e.g.\n' +
                    '- Normalization up to 3NF\n- Basic SELECT/JOIN/GROUP BY queries\n- Primary & foreign keys'
                  }
                  value={classCoverage}
                  onChange={(e) => setClassCoverage(e.target.value)}
                  disabled={!analysis}
                />
                <p className="mt-1.5 text-[11px] text-ink-muted">
                  {classCoverage.trim()
                    ? 'The question will be generated only from this — not the wider syllabus — so every student can do it.'
                    : 'Leave blank to generate from the whole syllabus (may be harder than what was actually taught).'}
                </p>
              </div>
            </div>
          )}

          {!question && !generating && (
            <Button variant="ai" icon={<Sparkles size={15} />} disabled={!analysis} onClick={generate}>
              Generate question based on the given syllabus
            </Button>
          )}

          {generating && (
            <div className="flex items-center gap-3 rounded-xl border border-ai-200 bg-ai-50/50 px-4 py-4 text-sm text-ink-soft">
              <Loader2 size={16} className="animate-spin text-ai-600" />
              <span>{stage || 'Generating the common question…'}</span>
            </div>
          )}

          {question && !generating && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h4 className="text-base font-semibold text-ink">{question.title}</h4>
                <Badge tone={question.difficulty === 'Advanced' ? 'rose' : 'ai'}>{question.difficulty}</Badge>
              </div>
              <p className="rounded-xl bg-paper p-3 text-sm leading-relaxed text-ink-soft">{question.commonPrompt}</p>
              <div className="space-y-2">
                {question.parts.map((p) => (
                  <div key={p.id} className="rounded-xl border border-line p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-ink">{p.label}</span>
                      <span className="text-xs text-ink-muted">{p.marks} marks</span>
                    </div>
                    <p className="mt-1 text-sm text-ink-soft">{p.prompt}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {question.rubric.map((r) => (
                  <span key={r.id} className="rounded-lg bg-paper px-2.5 py-1 text-xs text-ink-soft">
                    {r.name} · {r.maxMarks}
                  </span>
                ))}
              </div>
              <Button variant="subtle" icon={<RefreshCw size={14} />} onClick={generate}>
                Regenerate
              </Button>
            </div>
          )}
        </Card>

        {/* Step 3 — publish */}
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <StepDot n={3} done={publishedCount != null} />
            <h3 className="text-sm font-semibold text-ink">Publish question to students</h3>
          </div>

          {publishedCount == null ? (
            <>
              <p className="mb-3 text-xs text-ink-muted">
                Publishing sends this question to every student. It appears on their dashboard where they submit their ZIP directly.
              </p>

              <div className="mb-3 max-w-[220px]">
                <label className="label" htmlFor="ws-duration">Time limit (minutes, optional)</label>
                <input
                  id="ws-duration"
                  type="number"
                  min={1}
                  max={600}
                  className="input"
                  placeholder="No time limit"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                />
                <p className="mt-1.5 text-[11px] text-ink-muted">
                  {durationMinutes.trim()
                    ? `Each student's clock starts the moment they open the question and auto-submits their ZIP after ${durationMinutes} minute${durationMinutes === '1' ? '' : 's'}.`
                    : 'Leave blank for no time limit — students can submit whenever, as today.'}
                </p>
              </div>

              <Button
                icon={<Rocket size={15} />}
                disabled={!question}
                loading={publishing}
                onClick={publish}
              >
                Publish question to students
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm font-medium text-emerald-800">
              <CheckCircle2 size={16} />
              Published — live on {publishedCount} student dashboard{publishedCount === 1 ? '' : 's'}.
            </div>
          )}
        </Card>

        {/* Step 4 — unique paper per student */}
        {publishedCount != null && (
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <StepDot n={4} done={papers.length >= (publishedCount || 1)} />
              <h3 className="text-sm font-semibold text-ink">Student papers</h3>
              <Badge tone="ai">Unique per student</Badge>
            </div>

            <p className="mb-3 text-xs text-ink-muted">
              Every student answers the <span className="font-semibold text-ink">same question and rubric</span>, but against
              their own scenario — a different domain, entities and data. Papers are created automatically when a student first
              opens the assessment, or build them all now:
            </p>

            <div className="mb-3 flex flex-wrap items-center gap-3">
              <Button variant="subtle" icon={<Shuffle size={14} />} loading={buildingPapers} onClick={generateAllPapers}>
                Build all {publishedCount} papers now
              </Button>
              <span className="text-xs text-ink-muted">
                {papers.length} / {publishedCount} generated
                {buildingPapers && papers.length < publishedCount ? ' …' : ''}
              </span>
            </div>

            {papers.length > 0 && (
              <div className="max-h-80 space-y-1.5 overflow-y-auto">
                {papers.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                    <span className="font-mono text-xs text-ai-700">{p.scenario_code}</span>
                    <span className="min-w-0 flex-1 truncate text-ink">
                      {p.student_name ?? '—'}
                      <span className="text-ink-muted"> · {p.title}</span>
                    </span>
                    <Badge tone="neutral">{p.domain}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}

function StepDot({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      className={
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ' +
        (done ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-100 text-brand-700')
      }
    >
      {done ? '✓' : n}
    </span>
  )
}
