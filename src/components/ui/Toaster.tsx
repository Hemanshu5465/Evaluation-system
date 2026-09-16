import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { dismissToast, useStore } from '@/store/store'
import { cn } from '@/lib/format'

export function Toaster() {
  const toasts = useStore((s) => s.toasts)
  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => {
        const cfg = {
          success: { icon: CheckCircle2, ring: 'border-emerald-200', dot: 'text-emerald-600' },
          error: { icon: XCircle, ring: 'border-rose-200', dot: 'text-rose-600' },
          warning: { icon: AlertTriangle, ring: 'border-amber-200', dot: 'text-amber-600' },
          info: { icon: Info, ring: 'border-sky-200', dot: 'text-sky-600' },
        }[t.kind]
        const Icon = cfg.icon
        return (
          <div key={t.id} className={cn('pointer-events-auto flex animate-fade-up items-start gap-3 rounded-xl border bg-card p-3.5 shadow-lift', cfg.ring)}>
            <Icon size={18} className={cn('mt-0.5 shrink-0', cfg.dot)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{t.title}</p>
              {t.message && <p className="mt-0.5 text-xs text-ink-muted">{t.message}</p>}
            </div>
            <button onClick={() => dismissToast(t.id)} className="text-ink-muted hover:text-ink" aria-label="Dismiss">
              <X size={15} />
            </button>
          </div>
        )
      })}
    </div>,
    document.body,
  )
}
