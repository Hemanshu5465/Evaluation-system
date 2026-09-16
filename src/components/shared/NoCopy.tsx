import type { ReactNode, SyntheticEvent } from 'react'

/**
 * Wraps content that students must not be able to copy or select — the common
 * question, their scenario and the question parts.
 *
 * Best-effort deterrent: it blocks text selection, copy/cut, right-click and
 * drag. It cannot stop screenshots or browser dev-tools, which no web page can.
 */
export function NoCopy({ children, className }: { children: ReactNode; className?: string }) {
  const block = (e: SyntheticEvent) => e.preventDefault()
  return (
    <div
      className={className}
      onCopy={block}
      onCut={block}
      onContextMenu={block}
      onDragStart={block}
      style={{
        userSelect: 'none',
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
    >
      {children}
    </div>
  )
}
