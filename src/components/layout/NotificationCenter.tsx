import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { store, useStore } from '@/store/store'
import { relativeTime } from '@/lib/format'
import type { Role } from '@/types'

export function NotificationCenter({ role, userId }: { role: Role; userId: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const all = useStore((s) => s.notifications)
  const mine = all.filter((n) => n.role === role && (n.userId === null || n.userId === userId))
  const unread = mine.filter((n) => !n.read).length

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function markAll() {
    store.set((d) => {
      d.notifications = d.notifications.map((n) =>
        n.role === role && (n.userId === null || n.userId === userId) ? { ...n, read: true } : n,
      )
    })
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-xl border border-line bg-card p-2 text-ink-soft hover:bg-paper hover:text-ink"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 animate-scale-in overflow-hidden rounded-2xl border border-line bg-card shadow-lift">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            <button onClick={markAll} className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
              <CheckCheck size={13} /> Mark all read
            </button>
          </div>
          <div className="max-h-96 divide-y divide-line overflow-y-auto">
            {mine.length === 0 && <p className="px-4 py-8 text-center text-sm text-ink-muted">You're all caught up.</p>}
            {mine.map((n) => (
              <div key={n.id} className="flex gap-3 px-4 py-3 hover:bg-paper">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-line' : 'bg-brand-500'}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{n.title}</p>
                  <p className="text-xs text-ink-muted">{n.body}</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">{relativeTime(n.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
