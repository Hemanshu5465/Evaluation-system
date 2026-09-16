import { useRef, useState } from 'react'
import { BookOpen, FileUp, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { Subject } from '@/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge, Button, Card, EmptyState, Modal, Progress } from '@/components/ui/primitives'
import { syllabusService } from '@/services/syllabusService'
import { pushToast, useStore } from '@/store/store'

export function SubjectsPage() {
  const subjects = useStore((s) => s.subjects)
  const [addOpen, setAddOpen] = useState(false)
  const [viewSubject, setViewSubject] = useState<Subject | null>(null)

  const slots: (Subject | null)[] = [1, 2, 3].map((n) => subjects.find((s) => s.slot === n) ?? null)

  return (
    <div>
      <PageHeader
        title="Subjects & Syllabus"
        subtitle="Configure up to 3 subjects. Each syllabus drives scenario question generation."
        action={
          <Button icon={<Plus size={16} />} onClick={() => setAddOpen(true)} disabled={subjects.length >= 3}>
            Add Subject
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        {slots.map((subject, i) => (
          <SubjectSlot key={i} slot={(i + 1) as 1 | 2 | 3} subject={subject} onView={() => subject && setViewSubject(subject)} onAdd={() => setAddOpen(true)} />
        ))}
      </div>

      <AddSubjectModal open={addOpen} onClose={() => setAddOpen(false)} />

      <Modal open={!!viewSubject} onClose={() => setViewSubject(null)} title={viewSubject ? `${viewSubject.name} — Syllabus` : ''} size="lg">
        {viewSubject?.syllabus && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              <Badge tone="brand">{viewSubject.code}</Badge>
              <span>{viewSubject.syllabus.fileName}</span>
              <span>· {viewSubject.syllabus.sizeMB} MB</span>
              <span>· {viewSubject.syllabus.fileType}</span>
            </div>
            <div>
              <p className="label">Extracted topics ({viewSubject.syllabus.topics.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {viewSubject.syllabus.topics.map((t) => (
                  <span key={t} className="rounded-lg bg-paper px-2.5 py-1 text-xs text-ink-soft">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="label">Learning outcomes</p>
              <ul className="space-y-1.5 text-sm text-ink-soft">
                {viewSubject.syllabus.learningOutcomes.map((o) => (
                  <li key={o} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function SubjectSlot({ slot, subject, onView, onAdd }: { slot: 1 | 2 | 3; subject: Subject | null; onView: () => void; onAdd: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState('')

  if (!subject) {
    return (
      <Card className="flex flex-col items-center justify-center border-dashed py-12 text-center">
        <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-paper text-ink-muted">
          <BookOpen size={18} />
        </span>
        <p className="text-sm font-semibold text-ink">Subject {slot}</p>
        <p className="mb-3 mt-0.5 text-xs text-ink-muted">Not configured</p>
        <Button variant="ghost" icon={<Plus size={15} />} onClick={onAdd}>
          Add subject
        </Button>
      </Card>
    )
  }

  async function upload(file: File) {
    setUploading(true)
    setProgress(0)
    try {
      await syllabusService.uploadSyllabus(subject!.id, file, (pct, ph) => {
        setProgress(pct)
        setPhase(ph)
      })
      pushToast({ kind: 'success', title: 'Syllabus processed', message: `${subject!.name} is ready for question generation.` })
    } catch (e) {
      pushToast({ kind: 'error', title: 'Upload failed', message: e instanceof Error ? e.message : 'Try again.' })
    } finally {
      setUploading(false)
    }
  }

  const syl = subject.syllabus

  return (
    <Card className="flex flex-col">
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.txt"
        className="sr-only"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Subject {slot}</p>
          <h3 className="mt-1 text-base font-semibold text-ink">{subject.name}</h3>
          <p className="text-xs text-ink-muted">{subject.code}</p>
        </div>
        {syl?.status === 'ready' && <Badge tone="green">Ready</Badge>}
        {syl?.status === 'processing' && <Badge tone="amber">Processing</Badge>}
        {!syl && <Badge tone="neutral">No syllabus</Badge>}
      </div>

      <p className="mt-3 flex-1 text-sm text-ink-muted">{subject.description}</p>

      {uploading || syl?.status === 'processing' ? (
        <div className="mt-4">
          <Progress value={progress || syl?.progress || 0} tone="amber" />
          <p className="mt-1.5 text-xs text-ink-muted">{phase || 'Processing…'} {progress || syl?.progress || 0}%</p>
        </div>
      ) : syl?.status === 'ready' ? (
        <>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-paper px-3 py-2 text-xs text-ink-soft">
            <FileUp size={14} className="text-ink-muted" />
            <span className="truncate">{syl.fileName}</span>
            <span className="ml-auto shrink-0 font-semibold">{syl.topics.length} topics</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={onView}>
              View syllabus
            </Button>
            <Button variant="subtle" icon={<RefreshCw size={14} />} onClick={() => fileRef.current?.click()}>
              Replace
            </Button>
            <Button
              variant="subtle"
              icon={<Trash2 size={14} />}
              onClick={async () => {
                await syllabusService.deleteSyllabus(subject.id)
                pushToast({ kind: 'info', title: 'Syllabus removed' })
              }}
            >
              Delete
            </Button>
          </div>
        </>
      ) : (
        <Button className="mt-4" variant="ghost" icon={<FileUp size={15} />} onClick={() => fileRef.current?.click()}>
          Upload syllabus (PDF, DOCX, TXT)
        </Button>
      )}
    </Card>
  )
}

function AddSubjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function save() {
    if (!name.trim() || !code.trim()) {
      pushToast({ kind: 'warning', title: 'Name and code are required' })
      return
    }
    setBusy(true)
    try {
      const subject = await syllabusService.addSubject({ name, code, description })
      if (file) {
        await syllabusService.uploadSyllabus(subject.id, file)
      }
      pushToast({ kind: 'success', title: 'Subject added', message: file ? 'Syllabus is processing.' : 'Upload a syllabus next.' })
      setName('')
      setCode('')
      setDescription('')
      setFile(null)
      onClose()
    } catch (e) {
      pushToast({ kind: 'error', title: 'Could not add subject', message: e instanceof Error ? e.message : '' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Subject"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={save}>
            Save subject
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Subject name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Operating Systems" />
        </div>
        <div>
          <label className="label">Subject code</label>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. CS-OS-303" />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="label">Upload syllabus (optional)</label>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button onClick={() => fileRef.current?.click()} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-line px-3 py-3 text-sm text-ink-muted hover:border-ink-muted">
            <FileUp size={15} />
            {file ? file.name : 'Choose a PDF, DOCX or TXT file'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
