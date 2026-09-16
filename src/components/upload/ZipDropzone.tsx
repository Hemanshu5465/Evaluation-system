import { useRef, useState } from 'react'
import { FileArchive, RotateCcw, Trash2, UploadCloud } from 'lucide-react'
import { Button, Progress } from '@/components/ui/primitives'
import { cn } from '@/lib/format'

export interface PickedZip {
  name: string
  sizeMB: number
}

export function ZipDropzone({
  onUpload,
  hint = 'Only .zip files are allowed · max 50 MB',
  accent = 'brand',
}: {
  onUpload: (file: File, onProgress: (pct: number) => void) => Promise<void>
  hint?: string
  accent?: 'brand' | 'ai'
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<PickedZip | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handle(f: File) {
    setError(null)
    if (!f.name.toLowerCase().endsWith('.zip')) {
      setError('Invalid file type — a .zip archive is required.')
      return
    }
    const sizeMB = f.size ? f.size / 1024 / 1024 : 2.4
    if (sizeMB > 50) {
      setError('ZIP file is too large (50 MB limit).')
      return
    }
    setFile({ name: f.name, sizeMB })
    setProgress(0)
    setDone(false)
    try {
      await onUpload(f, (p) => setProgress(p))
      setProgress(100)
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
      setProgress(null)
    }
  }

  function reset() {
    setFile(null)
    setProgress(null)
    setDone(false)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const ring = accent === 'ai' ? 'border-ai-400 bg-ai-50' : 'border-brand-400 bg-brand-50'

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])}
      />

      {!file && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            if (e.dataTransfer.files?.[0]) handle(e.dataTransfer.files[0])
          }}
          className={cn(
            'flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors',
            dragging ? ring : 'border-line hover:border-ink-muted hover:bg-paper',
          )}
        >
          <span className={cn('mb-3 flex h-14 w-14 items-center justify-center rounded-2xl', accent === 'ai' ? 'bg-ai-100 text-ai-600' : 'bg-brand-100 text-brand-600')}>
            <UploadCloud size={26} />
          </span>
          <span className="text-sm font-semibold text-ink">Drag &amp; drop your ZIP file here</span>
          <span className="mt-1 text-xs text-ink-muted">
            or <span className="font-semibold text-brand-700 underline">browse files</span>
          </span>
          <span className="mt-3 text-[11px] text-ink-muted">{hint}</span>
        </button>
      )}

      {file && (
        <div className="rounded-2xl border border-line bg-card p-4">
          <div className="flex items-start gap-3">
            <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', accent === 'ai' ? 'bg-ai-100 text-ai-600' : 'bg-brand-100 text-brand-600')}>
              <FileArchive size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{file.name}</p>
              <p className="text-xs text-ink-muted">{file.sizeMB.toFixed(1)} MB</p>
              {progress != null && progress < 100 && (
                <div className="mt-2">
                  <Progress value={progress} tone={accent} />
                  <p className="mt-1 text-[11px] text-ink-muted">Uploading… {progress}%</p>
                </div>
              )}
              {done && (
                <ul className="mt-2 space-y-1 text-xs text-emerald-700">
                  <li>✓ Valid ZIP archive</li>
                  <li>✓ Archive extracted &amp; scanned</li>
                </ul>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              <button onClick={() => inputRef.current?.click()} className="rounded-lg p-1.5 text-ink-muted hover:bg-paper hover:text-ink" title="Re-upload">
                <RotateCcw size={15} />
              </button>
              <button onClick={reset} className="rounded-lg p-1.5 text-ink-muted hover:bg-rose-50 hover:text-rose-600" title="Remove">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>
      )}

      {file && !done && progress == null && (
        <Button variant="ghost" className="mt-3" icon={<RotateCcw size={15} />} onClick={reset}>
          Choose a different file
        </Button>
      )}
    </div>
  )
}
