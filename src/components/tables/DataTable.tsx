import { type ReactNode, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import { cn } from '@/lib/format'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  sortValue?: (row: T) => string | number
  className?: string
}

export interface Filter {
  key: string
  label: string
  options: { value: string; label: string }[]
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  filters = [],
  searchKeys,
  searchPlaceholder = 'Search…',
  pageSize = 8,
  emptyState,
  onRowClick,
}: {
  rows: T[]
  columns: Column<T>[]
  filters?: Filter[]
  searchKeys?: (row: T) => string
  searchPlaceholder?: string
  pageSize?: number
  emptyState?: ReactNode
  onRowClick?: (row: T) => void
}) {
  const [query, setQuery] = useState('')
  const [filterState, setFilterState] = useState<Record<string, string>>({})
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    let out = rows
    if (query && searchKeys) {
      const q = query.toLowerCase()
      out = out.filter((r) => searchKeys(r).toLowerCase().includes(q))
    }
    for (const [k, v] of Object.entries(filterState)) {
      if (v && v !== '__all') out = out.filter((r) => String((r as Record<string, unknown>)[k]) === v)
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key)
      if (col?.sortValue) {
        out = [...out].sort((a, b) => {
          const av = col.sortValue!(a)
          const bv = col.sortValue!(b)
          const cmp = av < bv ? -1 : av > bv ? 1 : 0
          return sort.dir === 'asc' ? cmp : -cmp
        })
      }
    }
    return out
  }, [rows, query, filterState, sort, columns, searchKeys])

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize)

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        {searchKeys && (
          <div className="relative min-w-48 flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(0)
              }}
              placeholder={searchPlaceholder}
              className="input pl-9"
            />
          </div>
        )}
        {filters.map((f) => (
          <select
            key={f.key}
            className="input w-auto"
            value={filterState[f.key] ?? '__all'}
            onChange={(e) => {
              setFilterState((p) => ({ ...p, [f.key]: e.target.value }))
              setPage(0)
            }}
          >
            <option value="__all">{f.label}: All</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {f.label}: {o.label}
              </option>
            ))}
          </select>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line bg-paper/60 text-left text-xs uppercase tracking-wide text-ink-muted">
              {columns.map((c) => (
                <th key={c.key} className={cn('px-4 py-2.5 font-semibold', c.className)}>
                  {c.sortValue ? (
                    <button
                      className="flex items-center gap-1 hover:text-ink"
                      onClick={() =>
                        setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' }))
                      }
                    >
                      {c.header}
                      {sort?.key === c.key ? sort.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} /> : null}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {pageRows.map((row) => (
              <tr
                key={row.id}
                className={cn('transition-colors', onRowClick && 'cursor-pointer hover:bg-paper')}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-3 align-middle', c.className)}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-ink-muted">
                  {emptyState ?? 'No results.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > pageSize && (
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-ink-muted">
          <span>
            {page * pageSize + 1}–{Math.min(filtered.length, (page + 1) * pageSize)} of {filtered.length}
          </span>
          <div className="flex gap-1">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-line px-2.5 py-1 disabled:opacity-40">
              Prev
            </button>
            <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-line px-2.5 py-1 disabled:opacity-40">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
