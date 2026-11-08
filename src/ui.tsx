import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { getStatus, onStatus, type SyncStatus } from './sync.ts'
import type { Quadrant } from './engine/engineering.ts'
import { QUADRANT } from './engine/engineering.ts'

// ---------- routing ----------
const routeSubs = new Set<() => void>()
window.addEventListener('popstate', () => routeSubs.forEach((f) => f()))
export function navigate(to: string, replace = false) {
  if (to === location.pathname + location.search) return
  history[replace ? 'replaceState' : 'pushState'](null, '', to)
  routeSubs.forEach((f) => f())
  if (!replace) window.scrollTo({ top: 0 })
}
export function usePath() {
  return useSyncExternalStore((f) => { routeSubs.add(f); return () => { routeSubs.delete(f) } }, () => location.pathname)
}
export function Link({ to, children, className, ...rest }: { to: string; children: ReactNode; className?: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={to} className={className} {...rest} onClick={(e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      e.preventDefault()
      navigate(to)
    }}>{children}</a>
  )
}

// ---------- formatting ----------
let currency = 'CAD'
export function setCurrency(c: string) { currency = c || 'CAD' }
const fmts = new Map<string, Intl.NumberFormat>()
export function money(n: number, digits = 2): string {
  const k = currency + digits
  if (!fmts.has(k)) fmts.set(k, new Intl.NumberFormat('en-CA', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits, currencyDisplay: 'narrowSymbol' }))
  return Number.isFinite(n) ? fmts.get(k)!.format(n) : '—'
}
export const pct = (n: number, d = 1) => (Number.isFinite(n) ? `${n.toFixed(d)}%` : '—')
export const num = (n: number, d = 0) => (Number.isFinite(n) ? n.toLocaleString('en-CA', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—')
export const signed = (n: number, f: (x: number) => string) => (n > 0 ? '+' : n < 0 ? '−' : '') + f(Math.abs(n))

// ---------- theme ----------
export function useTheme(): ['light' | 'dark', () => void] {
  const [mode, setMode] = useState<'light' | 'dark'>(() => (document.documentElement.dataset.themeMode as 'light' | 'dark') || 'light')
  const toggle = () => {
    const m = mode === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.themeMode = m
    localStorage.setItem('themeMode', m)
    setMode(m)
  }
  return [mode, toggle]
}

// ---------- toasts ----------
export interface Toast { id: number; text: string; kind?: 'ok' | 'err' | 'info'; action?: { label: string; run: () => void } }
let toasts: Toast[] = []
const toastSubs = new Set<() => void>()
let tid = 0
export function toast(text: string, opts: Omit<Toast, 'id' | 'text'> = {}) {
  const t = { id: ++tid, text, ...opts }
  toasts = [...toasts.slice(-3), t]
  toastSubs.forEach((f) => f())
  setTimeout(() => dismiss(t.id), opts.action ? 7000 : 3800)
}
function dismiss(id: number) { toasts = toasts.filter((t) => t.id !== id); toastSubs.forEach((f) => f()) }
export function Toasts() {
  const list = useSyncExternalStore((f) => { toastSubs.add(f); return () => { toastSubs.delete(f) } }, () => toasts)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind ?? 'info'}`}>
          <span>{t.text}</span>
          {t.action && <button className="toast-act" onClick={() => { t.action!.run(); dismiss(t.id) }}>{t.action.label}</button>}
          <button className="toast-x" aria-label="Dismiss" onClick={() => dismiss(t.id)}>×</button>
        </div>
      ))}
    </div>
  )
}

// ---------- modal ----------
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }} aria-label={title}>
      {open && (
        <div className="modal-body">
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

// ---------- files ----------
export function download(name: string, text: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function copy(text: string, what = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(`${what} to clipboard`, { kind: 'ok' }) } catch { toast('Clipboard blocked by the browser', { kind: 'err' }) }
}
export function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export' }

// ---------- icons ----------
const PATHS: Record<string, string> = {
  x: 'M6 6l12 12M18 6L6 18',
  sun: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66l1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14l-1.41-1.41M12 17a5 5 0 100-10 5 5 0 000 10z',
  moon: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z',
  plus: 'M12 5v14M5 12h14',
  upload: 'M12 16V4m0 0l-5 5m5-5l5 5M4 20h16',
  download: 'M12 4v12m0 0l-5-5m5 5l5-5M4 20h16',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z',
  chev: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  check: 'M5 12l5 5L20 7',
  alert: 'M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  cloud: 'M7 18a5 5 0 01-.9-9.9A6 6 0 0117.7 7 4.5 4.5 0 0117.5 18z',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-8 9a8 8 0 0116 0',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zm10 3l-5-5',
  camera: 'M4 7h4l2-3h4l2 3h4v13H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  grid: 'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3',
  sparkle: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5m7 7L18 18M6 18l2.5-2.5m7-7L18 6',
  book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zm0 0v16',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7.3 7.3 0 00-2-1.2L14.5 3h-5l-.4 2.6a7.3 7.3 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.4l-2 1.6 2 3.4 2.4-1a7.3 7.3 0 002 1.2l.4 2.6h5l.4-2.6a7.3 7.3 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
}
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ico">
      <path d={PATHS[name] ?? ''} />
    </svg>
  )
}

export function Monogram({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="mono">
      <rect width="32" height="32" rx="16" fill="var(--brand)" />
      <text x="16" y="21" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff" fontFamily="inherit">MM</text>
    </svg>
  )
}

export function QPill({ q }: { q: Quadrant }) {
  return <span className={`qpill q-${q}`}>{QUADRANT[q].label}</span>
}

export function useSync(): SyncStatus {
  return useSyncExternalStore(onStatus, getStatus)
}

export function SyncBadge({ compact }: { compact?: boolean }) {
  const s = useSync()
  if (compact && s.state === 'local') return null
  const label = { local: 'On this device', syncing: 'Syncing…', synced: 'Synced', offline: 'Offline', error: 'Sync failed' }[s.state]
  return (
    <Link to="/settings#account" className={`sync sync-${s.state}`} title={s.message ?? (s.email ? `Signed in as ${s.email}` : 'Projects are stored in this browser. Sign in to sync.')}>
      <span className="sync-dot" />
      {!compact && <span>{label}</span>}
    </Link>
  )
}

export function Header({ inApp }: { inApp?: boolean }) {
  const [mode, toggle] = useTheme()
  const path = usePath()
  return (
    <header className="site-head">
      <div className="head-in">
        <Link to="/" className="brand" aria-label="Menu Margin home">
          <Monogram />
          <span className="brand-name">Menu Margin</span>
        </Link>
        <nav className="head-nav" aria-label="Main">
          <Link to="/app" className={path.startsWith('/app') ? 'on' : ''}>Workspace</Link>
          <Link to="/docs" className={path.startsWith('/docs') ? 'on' : ''}>Docs</Link>
          <Link to="/settings" className={path.startsWith('/settings') ? 'on' : ''}>Settings</Link>
        </nav>
        <div className="head-right">
          <SyncBadge compact={!inApp} />
          <button className="icon-btn" onClick={toggle} aria-label={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`} title="Toggle theme">
            <Icon name={mode === 'light' ? 'moon' : 'sun'} />
          </button>
          {!inApp && <Link to="/app" className="btn btn-primary btn-sm head-cta">Open the app</Link>}
        </div>
      </div>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="site-foot">
      <div className="foot-in">
        <div className="foot-brand"><Monogram size={24} /> <strong>Menu Margin</strong></div>
        <nav aria-label="Footer">
          <Link to="/app">Workspace</Link>
          <Link to="/docs">Docs</Link>
          <Link to="/docs#formats">Import formats</Link>
          <Link to="/settings">Settings</Link>
        </nav>
        <p className="foot-note">Built by Aryan Kansagara. Independent project, not affiliated with Lightspeed.</p>
      </div>
    </footer>
  )
}

export function Empty({ icon = 'sparkle', title, children, actions }: { icon?: string; title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-ico"><Icon name={icon} size={26} /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="empty-actions">{actions}</div>}
    </div>
  )
}

export function NumField({ value, onChange, step = 'any', min, label, suffix, prefix, className, width }: {
  value: number; onChange: (n: number) => void; step?: string | number; min?: number; label?: string; suffix?: string; prefix?: string; className?: string; width?: number
}) {
  // Keep the typed text while editing so "1." or "" don't get clobbered; show the canonical value otherwise.
  const [raw, setRaw] = useState<string | null>(null)
  const shown = raw ?? String(Math.round(value * 10000) / 10000)
  return (
    <span className={`numfield ${className ?? ''}`} style={width ? { width } : undefined}>
      {prefix && <span className="nf-affix">{prefix}</span>}
      <input type="number" inputMode="decimal" step={step} min={min} aria-label={label} value={shown}
        onBlur={() => setRaw(null)}
        onChange={(e) => { setRaw(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n)) onChange(n) }} />
      {suffix && <span className="nf-affix">{suffix}</span>}
    </span>
  )
}

export function readFileText(file: File): Promise<string> {
  return file.arrayBuffer().then(async (b) => (await import('./engine/csv.ts')).decodeBytes(new Uint8Array(b)))
}

export function DropZone({ onText, label, hint }: { onText: (text: string, name: string) => void; label: string; hint?: string }) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const take = async (f?: File) => {
    if (!f) return
    if (f.size > 25_000_000) { toast('That file is over 25 MB. Export a shorter date range.', { kind: 'err' }); return }
    try { onText(await readFileText(f), f.name) } catch { toast(`Could not read ${f.name}`, { kind: 'err' }) }
  }
  return (
    <div className={`drop ${over ? 'drop-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]) }}>
      <Icon name="upload" size={24} />
      <div><strong>{label}</strong>{hint && <span className="muted"> · {hint}</span>}</div>
      <button className="btn btn-ghost btn-sm" onClick={() => input.current?.click()}>Choose file</button>
      <input ref={input} type="file" accept=".csv,.txt,.tsv,.json,text/csv,application/json" hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = '' }} />
    </div>
  )
}
