const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1'

const ACCESS_KEY = 'evalai.access'
const REFRESH_KEY = 'evalai.refresh'

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY)
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY)
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access)
    localStorage.setItem(REFRESH_KEY, refresh)
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

export class ApiError extends Error {
  code: string
  status: number
  details?: unknown
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  form?: FormData
  auth?: boolean
  signal?: AbortSignal
}

let refreshInFlight: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (!tokens.refresh) return false
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refresh }),
    })
      .then(async (r) => {
        if (!r.ok) {
          tokens.clear()
          return false
        }
        const data = await r.json()
        tokens.set(data.access_token, data.refresh_token)
        return true
      })
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null
      })
  }
  return refreshInFlight
}

async function raw<T>(path: string, opts: RequestOptions, retry = true): Promise<T> {
  const headers: Record<string, string> = {}
  if (opts.auth !== false && tokens.access) headers.Authorization = `Bearer ${tokens.access}`

  let body: BodyInit | undefined
  if (opts.form) {
    body = opts.form
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body,
    signal: opts.signal,
  })

  if (res.status === 401 && retry && opts.auth !== false) {
    const ok = await tryRefresh()
    if (ok) return raw<T>(path, opts, false)
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  const payload = text ? JSON.parse(text) : null

  if (!res.ok) {
    const err = payload?.error ?? {}
    throw new ApiError(
      res.status,
      err.code ?? 'HTTP_ERROR',
      err.message ?? res.statusText ?? 'Request failed',
      err.details,
    )
  }
  return payload as T
}

export const api = {
  get: <T>(path: string, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    raw<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    raw<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    raw<T>(path, { ...opts, method: 'PUT', body }),
  del: <T>(path: string, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    raw<T>(path, { ...opts, method: 'DELETE' }),
  upload: <T>(path: string, file: File, field = 'file') => {
    const form = new FormData()
    form.append(field, file)
    return raw<T>(path, { method: 'POST', form })
  },
}

export { BASE_URL }
