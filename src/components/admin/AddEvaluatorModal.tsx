import { useState } from 'react'
import { Check, Copy, UserPlus } from 'lucide-react'
import { Button, Modal } from '@/components/ui/primitives'
import { adminApi } from '@/api/endpoints'
import { adaptUser } from '@/api/adapt'
import { pushToast, store } from '@/store/store'
import type { Evaluator } from '@/types'

export function AddEvaluatorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [department, setDepartment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<{ name: string; username: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)

  function reset() {
    setName('')
    setEmail('')
    setDepartment('')
    setError(null)
    setCredentials(null)
    setCopied(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit() {
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await adminApi.createEvaluator({
        name: name.trim(),
        email: email.trim(),
        department: department.trim() || undefined,
      })
      const evaluator = adaptUser(res.user) as Evaluator
      store.set((d) => {
        d.users.push(evaluator)
      })
      pushToast({ kind: 'success', title: 'Evaluator added', message: `${evaluator.name} can now log in and evaluate submissions.` })
      setCredentials({ name: res.user.name, username: res.username, password: res.password })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create evaluator.')
    } finally {
      setSubmitting(false)
    }
  }

  async function copyCredentials() {
    if (!credentials) return
    const text = `Username: ${credentials.username}\nPassword: ${credentials.password}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard access can be denied — the text is still shown on screen
    }
  }

  if (credentials) {
    return (
      <Modal open={open} onClose={handleClose} title="Evaluator account created" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Share these sign-in details with <strong>{credentials.name}</strong>. The password is shown only once —
            it isn&apos;t stored anywhere and can&apos;t be retrieved again.
          </p>
          <div className="space-y-2 rounded-lg bg-paper p-4">
            <Field label="Username" value={credentials.username} />
            <Field label="Password" value={credentials.password} mono />
          </div>
          <Button variant="subtle" onClick={copyCredentials} icon={copied ? <Check size={16} /> : <Copy size={16} />}>
            {copied ? 'Copied' : 'Copy username & password'}
          </Button>
        </div>
        <div className="mt-6 flex justify-end">
          <Button variant="primary" onClick={handleClose}>Done</Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add evaluator"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting} icon={<UserPlus size={16} />}>
            Done
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="ev-name">Name</label>
          <input id="ev-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </div>
        <div>
          <label className="label" htmlFor="ev-email">Email</label>
          <input
            id="ev-email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </div>
        <div>
          <label className="label" htmlFor="ev-dept">Department (optional)</label>
          <input id="ev-dept" className="input" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Computer Engineering" />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <p className="text-xs text-ink-muted">
          A username and password are generated automatically once you click Done.
        </p>
      </div>
    </Modal>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className={`text-sm font-semibold text-ink ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}
