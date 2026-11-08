import { useEffect, useState } from 'react'
import { createEmpty, createSample } from './actions.ts'
import { kpis } from './engine/outputs.ts'
import { deleteProject, listProjects, listSnapshots, onStoreChange, putProject, putSnapshot, newProject, type ProjectRec } from './store.ts'
import { queueCloudDelete } from './sync.ts'
import { DropZone, Empty, Footer, Header, Icon, Link, Modal, money, pct, setCurrency, toast } from './ui.tsx'
import type { Snapshot } from './engine/outputs.ts'

function useProjects() {
  const [list, setList] = useState<ProjectRec[] | null>(null)
  useEffect(() => {
    const load = () => listProjects().then((l) => setList(l.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))).catch(() => setList([]))
    load()
    return onStoreChange(load)
  }, [])
  return list
}

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

function ProjectCard({ p }: { p: ProjectRec }) {
  setCurrency(p.data.settings.currency)
  const k = kpis(p.data)
  const remove = async () => {
    const snaps = await listSnapshots(p.id)
    await deleteProject(p.id)
    queueCloudDelete(p.id)
    toast(`Deleted "${p.name}"`, {
      action: { label: 'Undo', run: async () => { await putProject(p); for (const s of snaps) await putSnapshot(s); toast('Restored', { kind: 'ok' }) } },
    })
  }
  const dup = async () => {
    const c = newProject(`${p.name} (copy)`, structuredClone(p.data))
    await putProject(c)
    toast('Duplicated', { kind: 'ok' })
  }
  return (
    <article className="pcard">
      <Link to={`/app/${p.id}`} className="pcard-main">
        <div className="pcard-top">
          <h3>{p.name}</h3>
          {p.data.synthetic && <span className="tag">Synthetic</span>}
        </div>
        <dl className="pcard-kpis">
          <div><dt>Menu items</dt><dd>{k.items}</dd></div>
          <div><dt>Theoretical FC</dt><dd>{k.revenue > 0 ? pct(k.theoreticalFcPct) : '—'}</dd></div>
          <div><dt>Over target</dt><dd className={k.overTarget ? 'bad' : ''}>{k.overTarget}</dd></div>
          <div><dt>Monthly CM</dt><dd>{k.revenue > 0 ? money(k.totalCm, 0) : '—'}</dd></div>
        </dl>
        <p className="pcard-foot muted">{p.data.ingredients.length} ingredients · {p.data.recipes.length} recipes · updated {ago(p.updatedAt)}</p>
      </Link>
      <div className="pcard-acts">
        <button className="btn btn-ghost btn-sm" onClick={dup}><Icon name="copy" size={15} /> Duplicate</button>
        <button className="btn btn-ghost btn-sm danger" onClick={remove}><Icon name="trash" size={15} /> Delete</button>
      </div>
    </article>
  )
}

let sampleRequested = false

export default function Workspace() {
  const list = useProjects()
  useEffect(() => {
    // /app?sample=1 is a direct link into the sample bistro.
    const q = new URLSearchParams(location.search)
    if (!sampleRequested && q.has('sample')) { sampleRequested = true; createSample(true, (q.get('to') ?? '').replace(/[^a-z/-]/g, '')) }
  }, [])
  const [naming, setNaming] = useState(() => new URLSearchParams(location.search).has('import'))
  const [name, setName] = useState('')
  const [restoring, setRestoring] = useState(false)

  const restore = async (text: string) => {
    try {
      const j = JSON.parse(text) as { projects?: ProjectRec[]; snapshots?: Snapshot[] }
      if (!Array.isArray(j.projects)) throw new Error('Not a Menu Margin backup')
      for (const p of j.projects) await putProject(p)
      for (const s of j.snapshots ?? []) await putSnapshot(s)
      toast(`Restored ${j.projects.length} project${j.projects.length === 1 ? '' : 's'}`, { kind: 'ok' })
      setRestoring(false)
    } catch (e) { toast((e as Error).message, { kind: 'err' }) }
  }

  return (
    <>
      <Header inApp />
      <main id="main" className="wrap ws">
        <div className="ws-head">
          <div>
            <p className="preheader dark">Workspace</p>
            <h1 className="h1">Your restaurants</h1>
            <p className="muted">Each project is one restaurant or concept, with its own prices, recipes, menu, sales and monthly snapshots.</p>
          </div>
          <div className="ws-acts">
            <button className="btn btn-ghost" onClick={() => setRestoring(true)}><Icon name="upload" size={16} /> Restore backup</button>
            <button className="btn btn-secondary" onClick={() => createSample()}>Try the sample</button>
            <button className="btn btn-primary" onClick={() => setNaming(true)}><Icon name="plus" size={16} /> New project</button>
          </div>
        </div>

        {list === null ? (
          <div className="pgrid">{[0, 1, 2].map((i) => <div key={i} className="pcard skeleton" />)}</div>
        ) : list.length === 0 ? (
          <Empty icon="sparkle" title="Start with a sample, or bring your own numbers"
            actions={<>
              <button className="btn btn-primary btn-lg" onClick={() => createSample()}>Try the sample bistro</button>
              <button className="btn btn-secondary btn-lg" onClick={() => setNaming(true)}>Import your data</button>
            </>}>
            The sample is a synthetic neighbourhood bistro: 35 ingredients, 6 sub-recipes, 18 dishes and a month of sales.
            Importing starts a blank project with a guided checklist: supplier price list, recipes, then your POS item-sales export.
          </Empty>
        ) : (
          <div className="pgrid">{list.map((p) => <ProjectCard key={p.id} p={p} />)}</div>
        )}

        <p className="fine muted ws-note">
          Projects live in this browser (IndexedDB). <Link to="/settings#account">Sign in</Link> to sync across devices; raw uploaded files are never stored or uploaded, only the parsed results.
        </p>
      </main>
      <Footer />

      <Modal open={naming} onClose={() => setNaming(false)} title="New project">
        <form onSubmit={async (e) => { e.preventDefault(); setNaming(false); await createEmpty(name.trim() || 'My restaurant'); toast('Project created. Follow the checklist to import.', { kind: 'ok' }) }}>
          <label className="field">
            <span>Restaurant or concept name</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Café Lune, Plateau location" />
          </label>
          <p className="muted fine">Next you will import a supplier price list (or add ingredients by hand), build recipes, and drop in a POS item-sales export.</p>
          <div className="modal-acts">
            <button type="button" className="btn btn-ghost" onClick={() => setNaming(false)}>Cancel</button>
            <button className="btn btn-primary">Create project</button>
          </div>
        </form>
      </Modal>

      <Modal open={restoring} onClose={() => setRestoring(false)} title="Restore from backup">
        <p className="muted">Choose a JSON file exported from Settings › Export all my data. Projects with the same id are overwritten.</p>
        <DropZone label="Drop a Menu Margin backup (.json)" onText={restore} />
      </Modal>
    </>
  )
}

