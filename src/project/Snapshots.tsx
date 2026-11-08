import { useEffect, useMemo, useState } from 'react'
import { compare, kpis, type Snapshot } from '../engine/outputs.ts'
import { deleteSnapshot, listSnapshots, onStoreChange, putSnapshot } from '../store.ts'
import { snapshot } from '../actions.ts'
import { Empty, Icon, money, pct, QPill, signed, toast } from '../ui.tsx'
import { useP } from './ctx.ts'

export default function Snapshots() {
  const { rec, data, update, undo } = useP()
  const [list, setList] = useState<Snapshot[] | null>(null)
  const [a, setA] = useState('')
  const [b, setB] = useState('current')
  useEffect(() => {
    const load = () => listSnapshots(rec.id).then((l) => { setList(l); setA((x) => x || l[l.length - 1]?.id || '') })
    load()
    return onStoreChange(load)
  }, [rec.id])

  const pickData = (id: string) => (id === 'current' ? data : list?.find((s) => s.id === id)?.data)
  const da = pickData(a)
  const db = pickData(b)
  const cmp = useMemo(() => (da && db && da !== db ? compare(da, db) : null), [da, db])
  const label = (id: string) => (id === 'current' ? 'Now' : list?.find((s) => s.id === id)?.label ?? '')

  if (list === null) return <div className="page-loading"><span className="spinner" /></div>
  const month = new Date().toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1 className="h2">Snapshots</h1><p className="muted">Freeze the project at month end, then compare any two points: prices, plate costs, classes, food cost.</p></div>
        <button className="btn btn-primary btn-sm" onClick={() => snapshot(rec.id, data, `${month} close`)}><Icon name="camera" size={15} /> Snapshot now</button>
      </div>
      {list.length === 0 ? (
        <Empty icon="camera" title="No snapshots yet" actions={<button className="btn btn-primary" onClick={() => snapshot(rec.id, data, `${month} close`)}>Take the first snapshot</button>}>
          Take one at each month close (press S anywhere in the project). Compare shows exactly what moved.
        </Empty>
      ) : (
        <>
          <div className="snaps">
            {[...list].reverse().map((s) => {
              const k = kpis(s.data)
              return (
                <div key={s.id} className={`snap ${s.id === a || s.id === b ? 'on' : ''}`}>
                  <div><b>{s.label}</b><span className="muted fine">{new Date(s.createdAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
                  <span className="num">{k.revenue ? pct(k.theoreticalFcPct) : pct(k.avgFcPct)} <span className="muted fine">FC</span></span>
                  <div className="inline">
                    <button className="btn btn-ghost btn-sm" onClick={() => setA(s.id)}>Compare from</button>
                    <button className="btn btn-ghost btn-sm" title="Replace the current project with this snapshot" onClick={() => { update(() => structuredClone(s.data), `Restore ${s.label}`); toast(`Restored "${s.label}". Undo is available.`, { action: { label: 'Undo', run: undo } }) }}>Restore</button>
                    <button className="icon-btn" aria-label={`Delete ${s.label}`} onClick={async () => { await deleteSnapshot(s.id); toast(`Deleted snapshot "${s.label}"`, { action: { label: 'Undo', run: () => putSnapshot(s) } }) }}><Icon name="trash" size={15} /></button>
                  </div>
                </div>
              )
            })}
          </div>
          <section className="card">
            <div className="card-head">
              <h2>Compare</h2>
              <div className="inline">
                <select value={a} onChange={(e) => setA(e.target.value)} aria-label="From">{list.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}<option value="current">Now</option></select>
                <Icon name="chev" size={16} />
                <select value={b} onChange={(e) => setB(e.target.value)} aria-label="To"><option value="current">Now</option>{list.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
              </div>
            </div>
            {!cmp ? <p className="muted">Pick two different points to compare.</p> : (
              <div className="stack">
                <div className="kpis">
                  {[
                    ['Theoretical FC', cmp.a.theoreticalFcPct, cmp.b.theoreticalFcPct, (x: number) => `${x.toFixed(1)} pts`, true],
                    ['Avg plate FC', cmp.a.avgFcPct, cmp.b.avgFcPct, (x: number) => `${x.toFixed(1)} pts`, true],
                    ['Contribution margin', cmp.a.totalCm, cmp.b.totalCm, (x: number) => money(x, 0), false],
                    ['Dishes over target', cmp.a.overTarget, cmp.b.overTarget, (x: number) => String(x), true],
                  ].map(([n, x, y, f, badUp]) => {
                    const d = (y as number) - (x as number)
                    const bad = badUp ? d > 0.05 : d < -0.5
                    return <div key={n as string} className="kpi"><span>{n as string}</span><b>{typeof y === 'number' && (n as string).includes('FC') ? pct(y) : (n as string).includes('margin') ? money(y as number, 0) : String(y)}</b><small className={Math.abs(d) < 1e-9 ? 'muted' : bad ? 'bad' : 'good'}>{signed(d, f as (x: number) => string)} vs {label(a)}</small></div>
                  })}
                </div>
                <div className="grid-2">
                  <div>
                    <h3 className="h4">Ingredient prices ({cmp.prices.length})</h3>
                    {cmp.prices.length ? <ul className="changes">{cmp.prices.slice(0, 15).map((p) => <li key={p.name}><span>{p.name}</span><span className="num muted">{money(p.a)} → {money(p.b)}</span><b className={p.pct > 0 ? 'bad' : 'good'}>{signed(p.pct, (x) => `${x.toFixed(1)}%`)}</b></li>)}</ul> : <p className="muted">No price changes.</p>}
                  </div>
                  <div>
                    <h3 className="h4">Menu items ({cmp.items.length} changed)</h3>
                    {cmp.added.length > 0 && <p className="fine">Added: {cmp.added.join(', ')}</p>}
                    {cmp.removed.length > 0 && <p className="fine">Removed: {cmp.removed.join(', ')}</p>}
                    <table className="tbl compact">
                      <thead><tr><th>Item</th><th className="r">Cost</th><th className="r">FC</th><th>Class</th></tr></thead>
                      <tbody>
                        {cmp.items.map((i) => (
                          <tr key={i.id}>
                            <td>{i.name}</td>
                            <td className="r num">{i.costA !== undefined && i.costB !== undefined ? <span className={i.costB > i.costA ? 'bad' : 'good'}>{signed(i.costB - i.costA, money)}</span> : '—'}</td>
                            <td className="r num">{i.fcB !== undefined ? pct(i.fcB) : '—'}</td>
                            <td>{i.quadA && i.quadB ? (i.quadA === i.quadB ? <QPill q={i.quadB} /> : <span className="inline"><QPill q={i.quadA} /><Icon name="chev" size={12} /><QPill q={i.quadB} /></span>) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
