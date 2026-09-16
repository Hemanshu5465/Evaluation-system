import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Loader2, LogOut, Menu, X } from 'lucide-react'
import { authService } from '@/services/authService'
import { bootstrapWorkspace } from '@/store/bootstrap'
import { pushToast, useStore } from '@/store/store'
import { NAV, ROLE_LABEL } from './nav'
import { NotificationCenter } from './NotificationCenter'
import { Avatar } from '@/components/ui/primitives'
import { cn } from '@/lib/format'

export function AppShell() {
  const user = useStore((s) => s.currentUser)
  const bootstrapped = useStore((s) => s.bootstrapped)
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (user && !bootstrapped) {
      bootstrapWorkspace().catch((e) =>
        pushToast({ kind: 'error', title: 'Could not load your workspace', message: e?.message ?? 'Is the backend running?' }),
      )
    }
  }, [user, bootstrapped])

  if (!user) return null
  const items = NAV[user.role]
  const crumbs = location.pathname.split('/').filter(Boolean)

  function logout() {
    authService.logout()
    navigate('/login')
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link to={`/${user.role}`} className="flex items-center gap-2.5 px-5 py-5" onClick={() => setMobileOpen(false)}>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 font-display text-lg font-bold text-white">E</span>
        <div className="leading-tight">
          <p className="font-display text-lg font-semibold text-ink">EvalAI</p>
          <p className="text-[11px] text-ink-muted">Assessment &amp; Project Evaluation</p>
        </div>
      </Link>

      <div className="mx-4 mb-3 flex items-center gap-2 rounded-xl bg-paper px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-brand-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{ROLE_LABEL[user.role]} workspace</span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === `/${user.role}`}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-soft hover:bg-paper hover:text-ink',
              )
            }
          >
            <item.icon size={17} className="shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Avatar name={user.name} color={user.avatarColor} size={34} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen">
      {/* desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-line bg-card lg:block">{sidebar}</aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 animate-scale-in border-r border-line bg-card">
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 rounded-lg p-1 text-ink-muted hover:bg-paper">
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-paper/85 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="rounded-xl border border-line bg-card p-2 text-ink-soft lg:hidden" aria-label="Open menu">
              <Menu size={18} />
            </button>
            <nav className="hidden items-center gap-1.5 text-sm text-ink-muted sm:flex">
              {crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-line">/</span>}
                  <span className={i === crumbs.length - 1 ? 'font-semibold capitalize text-ink' : 'capitalize'}>{c.replace(/-/g, ' ')}</span>
                </span>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <NotificationCenter role={user.role} userId={user.id} />
            <div className="flex items-center gap-2 rounded-xl border border-line bg-card py-1 pl-1 pr-2.5">
              <Avatar name={user.name} color={user.avatarColor} size={30} />
              <span className="hidden max-w-[16ch] truncate text-sm font-semibold text-ink sm:block">{user.name}</span>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 rounded-xl border border-line bg-card px-2.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-rose-50 hover:text-rose-600"
              aria-label="Sign out"
            >
              <LogOut size={16} />
              <span className="hidden sm:block">Sign out</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {bootstrapped ? (
            <Outlet />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-sm text-ink-muted">
              <Loader2 size={22} className="animate-spin text-brand-600" />
              Loading your workspace…
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
