import { lazy, Suspense, useEffect, useState } from 'react'
import { Header, Icon, Link, Modal, navigate, SyncBadge } from '../ui.tsx'
import { ProjectCtx, useProjectState } from './ctx.ts'
import { snapshot } from '../actions.ts'
import { Overview } from './Overview.tsx'

const Ingredients = lazy(() => import('./Ingredients.tsx'))
const Recipes = lazy(() => import('./Recipes.tsx'))
const Menu = lazy(() => import('./Menu.tsx'))
const Sales = lazy(() => import('./Sales.tsx'))
const Engineering = lazy(() => import('./Engineering.tsx'))
const Prices = lazy(() => import('./Prices.tsx'))
const Outputs = lazy(() => import('./Outputs.tsx'))
const Snapshots = lazy(() => import('./Snapshots.tsx'))
const ProjectSettings = lazy(() => import('./ProjectSettings.tsx'))

export const TABS = [
  ['overview', 'Overview', 'grid'],
  ['ingredients', 'Ingredients', 'book'],
  ['recipes', 'Recipes', 'edit'],
  ['menu', 'Menu', 'sparkle'],
  ['sales', 'Sales', 'upload'],
  ['engineering', 'Engineering', 'grid'],
  ['prices', 'Price imports', 'alert'],
  ['outputs', 'Outputs', 'print'],
  ['snapshots', 'Snapshots', 'camera'],
  ['settings', 'Project settings', 'gear'],
] as const

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

export default function Project({ id, tab, sub }: { id: string; tab: string; sub?: string }) {
  const { rec, ctx } = useProjectState(id)
  const [help, setHelp] = useState(false)
  const [snapOpen, setSnapOpen] = useState(false)
  const [snapLabel, setSnapLabel] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !typing(e.target)) { e.preventDefault(); ctx?.undo(); return }
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '?') { setHelp(true); return }
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= 9 && TABS[n - 1]) navigate(`/app/${id}/${TABS[n - 1][0]}`)
      if (e.key === 's' && ctx) { e.preventDefault(); setSnapOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, ctx])

  useEffect(() => { if (rec) document.title = `${rec.name} · Menu Margin` }, [rec])

  if (rec === undefined) return <><Header inApp /><div className="page-loading"><span className="spinner" /> Opening project…</div></>
  if (rec === null || !ctx) return (
    <><Header inApp />
      <main className="wrap notfound">
        <p className="preheader dark">Not found</p>
        <h1 className="h1">This project isn’t on this device.</h1>
        <p className="lede">It may have been deleted, or it lives on another device. Sign in to sync, or head back to your workspace.</p>
        <div className="hero-ctas"><Link to="/app" className="btn btn-primary">Workspace</Link><Link to="/settings#account" className="btn btn-secondary">Sign in</Link></div>
      </main>
    </>
  )

  const known = TABS.some(([k]) => k === tab)
  const body = (() => {
    switch (tab) {
      case 'overview': return <Overview />
      case 'ingredients': return <Ingredients />
      case 'recipes': return <Recipes sub={sub} />
      case 'menu': return <Menu />
      case 'sales': return <Sales />
      case 'engineering': return <Engineering />
      case 'prices': return <Prices />
      case 'outputs': return <Outputs sub={sub} />
      case 'snapshots': return <Snapshots />
      case 'settings': return <ProjectSettings />
      default: return null
    }
  })()

  const month = new Date().toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
  return (
    <ProjectCtx.Provider value={ctx}>
      <Header inApp />
      <div className="proj">
        <aside className="proj-nav" aria-label="Project sections">
          <Link to="/app" className="proj-back"><Icon name="back" size={16} /> All projects</Link>
          <div className="proj-name" title={rec.name}>{rec.name}</div>
          {rec.data.synthetic && <span className="tag">Synthetic sample</span>}
          <nav>
            {TABS.map(([k, label, icon], i) => (
              <Link key={k} to={`/app/${id}/${k}`} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined}>
                <Icon name={icon} size={16} /><span>{label}</span>{i < 9 && <kbd>{i + 1}</kbd>}
              </Link>
            ))}
          </nav>
          <div className="proj-nav-foot">
            <SyncBadge />
            <button className="linkish" onClick={() => setHelp(true)}>Shortcuts <kbd>?</kbd></button>
          </div>
        </aside>
        <main id="main" className="proj-main">
          <div className="proj-bar">
            <div className="proj-bar-l">
              {rec.data.sales.length > 0 && (
                <label className="sel">
                  <span>Sales period</span>
                  <select value={ctx.periodId ?? ''} onChange={(e) => ctx.setPeriodId(e.target.value)}>
                    {rec.data.sales.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="proj-bar-r">
              <button className="btn btn-ghost btn-sm" onClick={ctx.undo} disabled={!ctx.canUndo} title="Undo (Ctrl/Cmd+Z)"><Icon name="undo" size={15} /> Undo</button>
              <button className="btn btn-secondary btn-sm" onClick={() => { setSnapLabel(`${month} close`); setSnapOpen(true) }} title="Save snapshot (S)"><Icon name="camera" size={15} /> Snapshot</button>
            </div>
          </div>
          <Suspense fallback={<div className="page-loading"><span className="spinner" /></div>}>
            {known ? body : <div className="empty"><h3>Unknown section</h3><Link to={`/app/${id}`} className="btn btn-primary">Back to overview</Link></div>}
          </Suspense>
        </main>
      </div>

      <Modal open={help} onClose={() => setHelp(false)} title="Keyboard shortcuts">
        <ul className="shortcuts">
          <li><kbd>1</kbd>–<kbd>9</kbd> Jump to a section</li>
          <li><kbd>Ctrl/⌘</kbd> + <kbd>Z</kbd> Undo last change</li>
          <li><kbd>S</kbd> Save a snapshot</li>
          <li><kbd>/</kbd> Focus search on list pages</li>
          <li><kbd>?</kbd> This help</li>
        </ul>
      </Modal>
      <Modal open={snapOpen} onClose={() => setSnapOpen(false)} title="Save a snapshot">
        <form onSubmit={async (e) => { e.preventDefault(); setSnapOpen(false); await snapshot(id, ctx.data, snapLabel.trim() || month) }}>
          <p className="muted">A snapshot freezes prices, recipes, menu and sales as they are now, so you can compare month to month.</p>
          <label className="field"><span>Label</span><input autoFocus value={snapLabel} onChange={(e) => setSnapLabel(e.target.value)} /></label>
          <div className="modal-acts"><button type="button" className="btn btn-ghost" onClick={() => setSnapOpen(false)}>Cancel</button><button className="btn btn-primary">Save snapshot</button></div>
        </form>
      </Modal>
    </ProjectCtx.Provider>
  )
}
