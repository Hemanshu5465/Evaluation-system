import { type ButtonHTMLAttributes, type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import { cn, initials } from '@/lib/format'

/* ---------------- Button ---------------- */
type Variant = 'primary' | 'ai' | 'ghost' | 'subtle' | 'danger'
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  icon?: ReactNode
}
export function Button({ variant = 'primary', loading, icon, children, className, disabled, ...rest }: ButtonProps) {
  const map: Record<Variant, string> = {
    primary: 'btn-primary',
    ai: 'btn-ai',
    ghost: 'btn-ghost',
    subtle: 'btn-subtle',
    danger: 'btn bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.98]',
  }
  return (
    <button className={cn(map[variant], className)} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  )
}

/* ---------------- Card ---------------- */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('card p-5', className)}>{children}</div>
}

export function SectionTitle({ children, sub, action }: { children: ReactNode; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">{children}</h2>
        {sub && <p className="mt-0.5 text-sm text-ink-muted">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

/* ---------------- Badge ---------------- */
type Tone = 'neutral' | 'brand' | 'ai' | 'green' | 'amber' | 'rose' | 'blue'
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const map: Record<Tone, string> = {
    neutral: 'bg-line/60 text-ink-soft',
    brand: 'bg-brand-100 text-brand-800',
    ai: 'bg-ai-100 text-ai-800',
    green: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-800',
    rose: 'bg-rose-100 text-rose-700',
    blue: 'bg-sky-100 text-sky-800',
  }
  return <span className={cn('badge', map[tone], className)}>{children}</span>
}

/* ---------------- Avatar ---------------- */
export function Avatar({ name, color, size = 36 }: { name: string; color?: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ background: color ?? '#136853', width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </span>
  )
}

/* ---------------- Progress ---------------- */
export function Progress({ value, tone = 'brand', className }: { value: number; tone?: 'brand' | 'ai' | 'amber'; className?: string }) {
  const bar = { brand: 'bg-brand-500', ai: 'bg-ai-500', amber: 'bg-amber-500' }[tone]
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-line', className)}>
      <div className={cn('h-full rounded-full transition-all duration-500', bar)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

/* ---------------- Modal ---------------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  tone = 'brand',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  tone?: 'brand' | 'ai'
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  const width = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size]
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 backdrop-blur-sm sm:p-8">
      <div className={cn('card w-full animate-scale-in p-0', width)} role="dialog" aria-modal="true">
        <div className={cn('flex items-center justify-between border-b border-line px-5 py-4', tone === 'ai' && 'bg-ai-50')}>
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-muted hover:bg-line/60 hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ---------------- Empty / Loading ---------------- */
export function EmptyState({ icon, title, message, action }: { icon: ReactNode; title: string; message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-card/60 px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-paper text-ink-muted">{icon}</div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

/* ---------------- Tabs ---------------- */
export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string; count?: number }[]; active: T; onChange: (id: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'relative whitespace-nowrap px-3.5 py-2.5 text-sm font-semibold transition-colors',
            active === t.id ? 'text-brand-700' : 'text-ink-muted hover:text-ink',
          )}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 rounded-full bg-line/70 px-1.5 py-0.5 text-[11px] text-ink-soft">{t.count}</span>}
          {active === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-600" />}
        </button>
      ))}
    </div>
  )
}

/* ---------------- Tooltip (hover) ---------------- */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span className="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-line text-[10px] font-bold text-ink-soft">i</span>
      <span className="pointer-events-none absolute left-1/2 top-6 z-20 w-64 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-lift transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  )
}
