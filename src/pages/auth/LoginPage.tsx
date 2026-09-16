import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, GraduationCap, ShieldCheck, UserCog } from 'lucide-react'
import type { Role } from '@/types'
import { authService } from '@/services/authService'
import { demoAccounts } from '@/data/mockData'
import { pushToast } from '@/store/store'
import { studentGivenName } from '@/lib/format'

const ROLES: { id: Role; label: string; icon: typeof GraduationCap }[] = [
  { id: 'student', label: 'Student', icon: GraduationCap },
  { id: 'evaluator', label: 'Evaluator', icon: ShieldCheck },
  { id: 'admin', label: 'Admin', icon: UserCog },
]

export function LoginPage() {
  const navigate = useNavigate()
  const [role, setRole] = useState<Role>('student')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState<'form' | Role | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function doLogin(loginEmail: string, loginPassword: string, loginRole: Role, key: 'form' | Role) {
    setLoading(key)
    setError(null)
    try {
      const user = await authService.login(loginEmail, loginPassword, loginRole, remember)
      const displayName = user.role === 'student' ? studentGivenName(user.name) : user.name.split(' ').slice(-1)[0]
      pushToast({ kind: 'success', title: `Welcome, ${displayName}`, message: `Signed in as ${user.role}.` })
      navigate(`/${user.role}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.')
    } finally {
      setLoading(null)
    }
  }

  function quickLogin(r: Role) {
    const acct = demoAccounts.find((d) => d.role === r)!
    setRole(r)
    setEmail(acct.identifier)
    setPassword(acct.password)
    doLogin(acct.identifier, acct.password, r, r)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    doLogin(email, password, role, 'form')
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-paper">
      <FieldBackdrop />

      {/* top bar */}
      <div className="relative z-20 grid grid-cols-3 items-center px-6 py-6 sm:px-10">
        <div />
        <div className="flex items-center justify-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink font-display text-base font-semibold text-white">
            E
          </span>
          <p className="font-display text-[15px] font-semibold tracking-tight text-ink">EvalAI</p>
        </div>
        <button
          type="button"
          onClick={() =>
            pushToast({ kind: 'info', title: 'Contact support', message: 'support@evalai.app — this is a prototype, no email will be sent.' })
          }
          className="justify-self-end text-sm font-medium text-ink-soft hover:text-ink"
        >
          Contact support
        </button>
      </div>

      {/* centered card */}
      <div className="relative z-10 flex min-h-[calc(100vh-84px)] items-center justify-center px-5 py-8">
        <div className="w-full max-w-[380px] animate-fade-up rounded-2xl border border-line bg-card/95 p-7 shadow-lift backdrop-blur-sm sm:p-8">
          <h1 className="font-display text-[1.6rem] font-medium tracking-tight text-ink">Log in to EvalAI</h1>
          <p className="mt-1 text-sm text-ink-muted">Your evaluation workspace starts here.</p>

          {/* one-click demo sign-in, per role */}
          <div className="mt-6 grid grid-cols-3 gap-2">
            {ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => quickLogin(r.id)}
                disabled={loading !== null}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-card py-3 text-ink-soft transition-colors hover:border-ink/30 hover:bg-paper disabled:opacity-50"
              >
                {loading === r.id ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-muted border-t-ink" />
                ) : (
                  <r.icon size={16} />
                )}
                <span className="text-[11px] font-semibold">{r.label}</span>
              </button>
            ))}
          </div>

          <div className="my-6 flex items-center gap-3 text-[11px] text-ink-muted">
            <span className="h-px flex-1 bg-line" />
            or continue with email
            <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">
                Enrollment number or email
              </label>
              <input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                placeholder="Enrollment number or email"
                className="w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-ink/40 focus:outline-none focus:ring-4 focus:ring-ink/5"
              />
            </div>

            <div>
              <label className="label" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-line bg-card px-3.5 py-2.5 pr-10 text-sm text-ink placeholder:text-ink-muted focus:border-ink/40 focus:outline-none focus:ring-4 focus:ring-ink/5"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 text-ink-soft">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="rounded border-line text-ink focus:ring-ink/30"
                />
                Remember me
              </label>
              <button
                type="button"
                className="font-semibold text-ink-soft hover:text-ink hover:underline"
                onClick={() => pushToast({ kind: 'info', title: 'Password reset', message: 'This is a prototype — no email will be sent.' })}
              >
                Forgot password?
              </button>
            </div>

            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}

            <button
              type="submit"
              disabled={loading !== null}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
            >
              {loading === 'form' ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <ArrowRight size={15} />
              )}
              Continue with email
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-ink-muted">
            New to EvalAI? Ask your administrator for access.
            <br />
            Students sign in with their enrollment number — password is the last 7 digits.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Full-bleed editorial illustration: a rolling "field of scenarios" — layered
 * hills, tree clusters and a scatter of paper/document shapes standing in for
 * the personalized scenarios every student receives.
 */
function FieldBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, #fbf8f0 0%, #f4f1e6 55%, #eef1e4 100%)' }}
      />
      <div className="absolute -right-10 top-[-4rem] h-72 w-72 rounded-full bg-amber-200/50 blur-[90px]" />
      <div className="absolute -left-16 top-24 h-56 w-56 rounded-full bg-ai-200/40 blur-[90px]" />

      <svg
        viewBox="0 0 1600 1000"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-0 h-full w-full"
      >
        {/* far hill */}
        <path
          d="M0,620 C200,560 400,600 600,580 C850,555 1000,610 1200,585 C1350,565 1500,600 1600,580 L1600,1000 L0,1000 Z"
          fill="#d3ece5"
        />
        {/* mid hill */}
        <path
          d="M0,700 C220,650 380,690 560,665 C780,635 950,700 1150,670 C1330,645 1480,690 1600,665 L1600,1000 L0,1000 Z"
          fill="#8fcdb9"
        />
        {/* near hill */}
        <path
          d="M0,800 C250,740 420,790 650,760 C880,730 1050,800 1300,765 C1420,748 1520,780 1600,760 L1600,1000 L0,1000 Z"
          fill="#115444"
        />

        {/* meandering path */}
        <path
          d="M300,260 C420,440 520,560 560,700 C600,830 680,900 760,980"
          stroke="#ffffff"
          strokeOpacity="0.28"
          strokeWidth="2"
          strokeDasharray="7 12"
          fill="none"
        />

        {/* tree clusters */}
        {[
          { x: 95, y: 792, s: 1 },
          { x: 230, y: 815, s: 0.7 },
          { x: 1500, y: 770, s: 1.1 },
          { x: 1380, y: 812, s: 0.75 },
        ].map((t, i) => (
          <g key={i} transform={`translate(${t.x} ${t.y}) scale(${t.s})`} fill="#0c372f">
            <circle cx="-16" cy="-6" r="20" />
            <circle cx="14" cy="-10" r="24" />
            <circle cx="0" cy="-28" r="22" />
          </g>
        ))}

        {/* scattered scenario papers, in place of bunkers */}
        {[
          { x: 560, y: 900, r: -8 },
          { x: 900, y: 930, r: 6 },
          { x: 730, y: 965, r: -3 },
        ].map((p, i) => (
          <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.r})`}>
            <rect x="-34" y="-24" width="68" height="48" rx="8" fill="#fffdf9" stroke="#e4ded2" />
            <line x1="-22" y1="-8" x2="18" y2="-8" stroke="#c9c2b2" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="-22" y1="2" x2="10" y2="2" stroke="#c9c2b2" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="-22" y1="12" x2="22" y2="12" stroke="#c9c2b2" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        ))}
      </svg>
    </div>
  )
}
