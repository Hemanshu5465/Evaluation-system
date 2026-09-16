import { useEffect, useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/primitives'
import { evaluatorApi } from '@/api/endpoints'

type FileData = { path: string; is_text: boolean; size_bytes: number; content: string; truncated: boolean }

export function FileViewerModal({
  submissionId,
  file,
  onClose,
}: {
  submissionId: string
  file: { name: string; path: string } | null
  onClose: () => void
}) {
  const [data, setData] = useState<FileData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!file) return
    setData(null)
    setError(null)
    setLoading(true)
    evaluatorApi
      .getSubmissionFile(submissionId, file.path)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load this file.'))
      .finally(() => setLoading(false))
  }, [submissionId, file])

  return (
    <Modal
      open={!!file}
      onClose={onClose}
      size="xl"
      title={
        <span className="flex items-center gap-2">
          <FileText size={15} className="text-ink-muted" />
          <span className="font-mono text-sm">{file?.name}</span>
        </span>
      }
    >
      {loading && (
        <div className="flex items-center gap-2 py-10 text-sm text-ink-muted">
          <Loader2 size={15} className="animate-spin" /> Loading file…
        </div>
      )}
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {data && !data.is_text && (
        <p className="rounded-lg bg-paper px-3 py-2 text-sm text-ink-muted">
          This is a binary file ({(data.size_bytes / 1024).toFixed(1)} KB) and cannot be shown as text.
        </p>
      )}
      {data && data.is_text && (
        <div>
          <pre className="max-h-[65vh] overflow-auto rounded-xl border border-line bg-ink/95 p-4 text-xs leading-relaxed text-white">
            <code>{data.content || '(empty file)'}</code>
          </pre>
          {data.truncated && <p className="mt-2 text-xs text-ink-muted">File is large — showing the first part only.</p>}
        </div>
      )}
    </Modal>
  )
}
