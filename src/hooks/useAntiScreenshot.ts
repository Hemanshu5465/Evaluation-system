import { useEffect } from 'react'

/**
 * Anti-screenshot hook — uses DIRECT DOM manipulation (not React state) so the
 * blocking overlay is injected synchronously, before any React render cycle.
 * This closes the timing gap that React-state-based approaches have.
 *
 * Layers applied:
 *  1. Direct DOM overlay injected on blur/visibility-hide — instant, no render lag.
 *  2. CSS class toggled on <body> so the question content itself also hides via CSS.
 *  3. Keyboard shortcut blocking: PrtScn, Ctrl+P, F12, Ctrl+Shift+I.
 *  4. beforeprint listener — hides content even if Ctrl+P isn't caught by keydown.
 *
 * Hard limit (no web page can bypass):
 *  - Phone cameras and hardware-level capture tools operate outside the browser.
 *  - The watermark in AssessmentPanel.tsx handles those — any captured image
 *    contains the student's name, email and date.
 */

const OVERLAY_ID = 'anti-screenshot-overlay'

function showOverlay() {
  if (document.getElementById(OVERLAY_ID)) return
  const el = document.createElement('div')
  el.id = OVERLAY_ID
  el.setAttribute('aria-live', 'polite')
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;">
      <svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 24 24"
           fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p style="font-size:1.15rem;font-weight:700;color:#111827;margin:0;">Assessment Protected</p>
      <p style="font-size:0.875rem;color:#6b7280;margin:0;max-width:320px;">
        Screen capture is not allowed during this assessment.<br/>
        Click back on this window to continue.
      </p>
    </div>
  `
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '999999',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.97)',
    backdropFilter: 'blur(32px)',
    WebkitBackdropFilter: 'blur(32px)',
    cursor: 'pointer',
  })
  el.onclick = () => hideOverlay()
  document.body.appendChild(el)
  document.body.classList.add('assessment-hidden')
}

function hideOverlay() {
  const el = document.getElementById(OVERLAY_ID)
  if (el) el.remove()
  document.body.classList.remove('assessment-hidden')
}

export function useAntiScreenshot() {
  useEffect(() => {
    // Clear clipboard helper to wipe copied screenshot image if OS captured it
    const clearClipboard = () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText('Screenshots are disabled during assessment.').catch(() => {})
      }
    }

    // Intercept copy and cut events to destroy copied data
    const onCopyOrCut = (e: ClipboardEvent) => {
      e.preventDefault()
      if (e.clipboardData) {
        e.clipboardData.setData('text/plain', 'Screenshots are disabled during assessment.')
      }
      clearClipboard()
    }

    // Block right-click context menu
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    const handlePrtScnOrModifier = (e: KeyboardEvent, isKeyUp = false) => {
      const keyLower = (e.key || '').toLowerCase()
      const codeLower = (e.code || '').toLowerCase()

      const isModifierKey =
        keyLower === 'shift' ||
        keyLower === 'alt' ||
        keyLower === 'meta' ||
        keyLower === 'os' ||
        keyLower === 'control'

      const isPrtScn =
        e.keyCode === 44 ||
        e.which === 44 ||
        keyLower === 'printscreen' ||
        keyLower === 'prtscn' ||
        keyLower === 'print' ||
        keyLower.includes('sysrq') ||
        keyLower.includes('snapshot') ||
        codeLower.includes('printscreen') ||
        ((e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) &&
          (e.keyCode === 44 || keyLower.includes('print') || keyLower.includes('prt') || codeLower.includes('print'))) ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && keyLower === 's')

      if (isPrtScn) {
        e.preventDefault()
        e.stopPropagation()
        showOverlay()
        clearClipboard()
        return true
      }

      if (isModifierKey) {
        if (!isKeyUp) {
          showOverlay()
          clearClipboard()
        } else {
          clearClipboard()
          setTimeout(hideOverlay, 300)
        }
      }
      return false
    }

    // --- 1. Focus / visibility tracking (direct DOM, no React render cycle) ---
    const onBlur = () => {
      showOverlay()
      clearClipboard()
    }
    const onFocus = () => hideOverlay()
    const onVisibilityChange = () => {
      if (document.hidden) {
        showOverlay()
        clearClipboard()
      } else {
        hideOverlay()
      }
    }

    // --- 2. Print, Copy & ContextMenu interception ---
    const onBeforePrint = () => {
      showOverlay()
      clearClipboard()
    }
    const onAfterPrint = () => hideOverlay()

    window.addEventListener('blur', onBlur, true)
    window.addEventListener('focus', onFocus, true)
    document.addEventListener('visibilitychange', onVisibilityChange, true)
    window.addEventListener('beforeprint', onBeforePrint, true)
    window.addEventListener('afterprint', onAfterPrint, true)
    document.addEventListener('copy', onCopyOrCut, true)
    document.addEventListener('cut', onCopyOrCut, true)
    document.addEventListener('contextmenu', onContextMenu, true)

    // --- 3. Keyboard shortcut blocking (capture phase for both keydown & keyup) ---
    const onKeyDown = (e: KeyboardEvent) => {
      if (handlePrtScnOrModifier(e, false)) return

      // Ctrl+P (print / PDF)
      if (e.ctrlKey && !e.shiftKey && (e.key.toLowerCase() === 'p' || e.keyCode === 80)) {
        e.preventDefault()
        e.stopPropagation()
        showOverlay()
        clearClipboard()
        setTimeout(hideOverlay, 2000)
        return
      }
      // Ctrl+Shift+I / Ctrl+Shift+J (DevTools)
      if (e.ctrlKey && e.shiftKey && ['i', 'I', 'j', 'J'].includes(e.key)) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      // F12 (DevTools)
      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      handlePrtScnOrModifier(e, true)
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('keyup', onKeyUp, true)

    return () => {
      hideOverlay()
      window.removeEventListener('blur', onBlur, true)
      window.removeEventListener('focus', onFocus, true)
      document.removeEventListener('visibilitychange', onVisibilityChange, true)
      window.removeEventListener('beforeprint', onBeforePrint, true)
      window.removeEventListener('afterprint', onAfterPrint, true)
      document.removeEventListener('copy', onCopyOrCut, true)
      document.removeEventListener('cut', onCopyOrCut, true)
      document.removeEventListener('contextmenu', onContextMenu, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('keyup', onKeyUp, true)
    }
  }, [])
}

