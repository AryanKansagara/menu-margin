import { deleteProject, listSnapshots, putProject, putSnapshot } from '../store.ts'
import { queueCloudDelete } from '../sync.ts'
import { download, Icon, navigate, NumField, slug, toast } from '../ui.tsx'
import { useP } from './ctx.ts'

export default function ProjectSettings() {
  const { rec, data, update, rename } = useP()
  const s = data.settings
  const set = (patch: Partial<typeof s>, label = 'Settings') => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }), label)
  const remove = async () => {
    const snaps = await listSnapshots(rec.id)
    const copy = { ...rec }
    await deleteProject(rec.id)
    queueCloudDelete(rec.id)
    navigate('/app')
    toast(`Deleted "${rec.name}"`, { action: { label: 'Undo', run: async () => { await putProject(copy); for (const x of snaps) await putSnapshot(x) } } })
  }
  return (
    <div className="stack narrow">
      <div className="page-head"><div><h1 className="h2">Project settings</h1></div></div>
      <section className="card">
        <div className="fgrid">
          <label className="field span-2"><span>Project name</span><input value={rec.name} onChange={(e) => rename(e.target.value)} /></label>
          <label className="field"><span>Currency</span>
            <select value={s.currency} onChange={(e) => set({ currency: e.target.value })}>
              {['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'NZD', 'CHF'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <div className="field"><span>Target food cost</span><NumField value={s.targetFcPct} onChange={(n) => set({ targetFcPct: Math.min(90, Math.max(5, n)) })} suffix="%" label="Target food cost percent" /></div>
          <div className="field"><span>Popularity rule (Kasavana–Smith uses 70%)</span><NumField value={Math.round(s.popularityFactor * 100)} onChange={(n) => set({ popularityFactor: Math.min(1.5, Math.max(0.1, n / 100)) })} suffix="%" label="Popularity factor" /></div>
          <div className="field"><span>Default price elasticity</span><NumField value={s.elasticity} onChange={(n) => set({ elasticity: n })} step={0.1} label="Elasticity" /></div>
        </div>
        <p className="muted fine">An item is “popular” when its share of items sold is at least this percentage of an equal share (70% of 1/18 ≈ 3.9% for an 18-item menu). Elasticity drives the price what-if: −0.8 means a 10% price rise loses about 8% of orders.</p>
      </section>
      <section className="card">
        <div className="card-head"><h2>Data</h2></div>
        <div className="inline wrap-gap">
          <button className="btn btn-secondary btn-sm" onClick={() => download(`${slug(rec.name)}.json`, JSON.stringify({ app: 'menu-margin', projects: [rec] }, null, 2), 'application/json')}><Icon name="download" size={15} /> Export this project (JSON)</button>
          <button className="btn btn-ghost btn-sm danger" onClick={remove}><Icon name="trash" size={15} /> Delete project</button>
        </div>
      </section>
    </div>
  )
}
