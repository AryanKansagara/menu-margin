import { useMemo, useState } from 'react'
import { applyPrices, diffPrices, parsePriceList, spikeAlerts, type PriceLine, type PriceMapping } from '../engine/prices.ts'
import { samplePriceListCsv } from '../engine/sample.ts'
import type { Ingredient, PriceImport } from '../engine/types.ts'
import { parseUnit } from '../engine/units.ts'
import { DropZone, Empty, Icon, Link, money, pct, signed, toast } from '../ui.tsx'
import { uid } from '../actions.ts'
import { useP } from './ctx.ts'

const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase())

function newIngredient(l: PriceLine): Ingredient {
  const unit = (l.packUnit && parseUnit(l.packUnit)) || 'ea'
  return {
    id: uid('ing'), name: titleCase(l.name || l.code), category: 'Uncategorized', supplier: l.supplier, code: l.code || undefined,
    purchaseUnit: 'case', packQty: l.packQty ?? 1, packUnit: unit === 'portion' ? 'ea' : unit, price: l.price, yieldPct: 100,
    history: [{ date: l.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), price: l.price, source: 'Price list import' }],
  }
}

function Importer({ onDone }: { onDone: () => void }) {
  const { data, update } = useP()
  const [file, setFile] = useState<{ text: string; name: string } | null>(null)
  const [map, setMap] = useState<PriceMapping | null>(null)
  const [overrides, setOverrides] = useState<Record<number, string | null>>({})
  const [create, setCreate] = useState<Record<number, boolean>>({})
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [onlyChanges, setOnlyChanges] = useState(true)

  const parsed = useMemo(() => (file ? parsePriceList(file.text, map ?? undefined) : null), [file, map])
  const diff = useMemo(() => (parsed ? diffPrices(data.ingredients, parsed.lines, overrides) : null), [parsed, data.ingredients, overrides])
  const preview = useMemo(() => {
    if (!diff) return null
    const ingredients = applyPrices(data.ingredients, diff, date, file?.name ?? '')
    return { ingredients, alerts: spikeAlerts(data, { ...data, ingredients }) }
  }, [diff, data, date, file])

  const load = (text: string, name: string) => {
    const p = parsePriceList(text)
    setFile({ text, name }); setMap(p.mapping); setOverrides({})
    const d = p.lines.find((l) => l.date)?.date
    if (d && /^\d{4}-\d{2}-\d{2}/.test(d)) setDate(d.slice(0, 10))
    // New lines become ingredients by default only on a fresh project.
    const fresh = data.ingredients.length === 0
    setCreate(Object.fromEntries(p.lines.map((l) => [l.line, fresh])))
  }

  if (!file || !parsed || !diff || !preview) return (
    <div className="stack">
      <DropZone label="Drop a supplier price list or invoice CSV" hint="item code, description, pack, price" onText={load} />
      <div className="inline wrap-gap">
        <button className="btn btn-ghost btn-sm" onClick={() => load(samplePriceListCsv(), 'sample-price-list-2026-11.csv')}>Use the sample November price list</button>
        <Link to="/docs#prices" className="btn btn-ghost btn-sm">Supported layouts</Link>
      </div>
    </div>
  )

  const m = parsed.mapping
  const colSel = (k: keyof PriceMapping, lbl: string) => (
    <label className="field"><span>{lbl}</span>
      <select value={m[k]} onChange={(e) => setMap({ ...m, [k]: +e.target.value })}>
        <option value={-1}>— not in file —</option>
        {parsed.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
      </select>
    </label>
  )
  const changed = diff.rows.filter((r) => r.kind === 'up' || r.kind === 'down' || r.kind === 'pack')
  const fresh = diff.rows.filter((r) => r.kind === 'new')
  const toCreate = fresh.filter((r) => create[r.line.line])
  const visible = onlyChanges ? diff.rows.filter((r) => r.kind !== 'same') : diff.rows

  const apply = () => {
    const created = toCreate.map((r) => newIngredient(r.line))
    const rec: PriceImport = {
      id: uid('pi'), date, supplier: [...new Set(parsed.lines.map((l) => l.supplier).filter(Boolean))].join(', ') || 'Supplier', fileName: file.name,
      changes: changed.map((r) => ({ ingredientId: r.ingredientId!, old: r.old!, new: r.next! })), created: created.length,
      alerts: preview.alerts.map((a) => ({ id: a.id, name: a.name, before: a.before, after: a.after, overBy: a.overBy, crossed: a.crossed, driver: a.driver?.name })),
    }
    update((d) => ({ ...d, ingredients: [...applyPrices(d.ingredients, diff, date, file.name), ...created], priceImports: [rec, ...d.priceImports] }), `Price import ${file.name}`)
    toast(`${changed.length} prices updated${created.length ? `, ${created.length} ingredients added` : ''}${preview.alerts.length ? ` · ${preview.alerts.length} dishes over target` : ''}`, { kind: preview.alerts.length ? 'err' : 'ok' })
    onDone()
  }

  return (
    <div className="stack">
      <div className="notice"><Icon name="check" /> {file.name} · {parsed.lines.length} priced lines{parsed.issues.length ? ` · ${parsed.issues.length} problems` : ''}</div>
      <details className="mapbox"><summary>Column mapping</summary>
        <div className="fgrid fgrid-3">{colSel('name', 'Description')}{colSel('code', 'Item code')}{colSel('price', 'Price')}{colSel('supplier', 'Supplier')}{colSel('packQty', 'Pack size')}{colSel('packUnit', 'Pack unit')}{colSel('date', 'Date')}</div>
      </details>
      {parsed.issues.length > 0 && <details className="issues-list" open><summary>Validation report</summary><ul>{parsed.issues.map((x, i) => <li key={i}><span className="mono">line {x.line}</span> {x.message}</li>)}</ul></details>}
      <div className="report">
        <div className="bad"><b>{diff.rows.filter((r) => r.kind === 'up').length}</b><span>price increases</span></div>
        <div className="good"><b>{diff.rows.filter((r) => r.kind === 'down').length}</b><span>decreases</span></div>
        <div><b>{diff.rows.filter((r) => r.kind === 'same').length}</b><span>unchanged</span></div>
        <div><b>{fresh.length}</b><span>not matched</span></div>
        <div><b>{diff.missing.length}</b><span>missing from file</span></div>
      </div>
      <label className="check"><input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} /> Show changes only</label>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Line</th><th>On file</th><th>Matched ingredient</th><th className="r">Was</th><th className="r">Now</th><th className="r">Change</th></tr></thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.line.line} className={r.kind === 'up' ? 'row-up' : r.kind === 'pack' ? 'row-warn' : ''}>
                <td className="mono muted">{r.line.line}</td>
                <td><b>{r.line.name || r.line.code}</b><div className="muted fine">{r.line.code}{r.line.packQty ? ` · ${r.line.packQty} ${r.line.packUnit ?? ''}` : ''}</div>{r.note && <div className="warn fine">{r.note}</div>}</td>
                <td>
                  <select value={r.ingredientId ?? ''} onChange={(e) => setOverrides((o) => ({ ...o, [r.line.line]: e.target.value || null }))} aria-label={`Ingredient for ${r.line.name}`}>
                    <option value="">— no match —</option>
                    {data.ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                  {r.kind === 'new' && <label className="check fine"><input type="checkbox" checked={!!create[r.line.line]} onChange={(e) => setCreate((c) => ({ ...c, [r.line.line]: e.target.checked }))} /> Add as new ingredient</label>}
                  {r.matchScore < 1 && r.ingredientId && <div className="muted fine">fuzzy match {Math.round(r.matchScore * 100)}%</div>}
                </td>
                <td className="r num">{r.old !== undefined ? money(r.old) : '—'}</td>
                <td className="r num">{money(r.next ?? r.line.price)}</td>
                <td className={`r num ${r.kind === 'up' ? 'bad' : r.kind === 'down' ? 'good' : 'muted'}`}>{r.pct !== undefined && r.kind !== 'new' ? signed(r.pct, (x) => `${x.toFixed(1)}%`) : r.kind === 'new' ? 'new' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {diff.missing.length > 0 && <p className="muted fine">Not on this file but from the same supplier: {diff.missing.map((i) => i.name).join(', ')}. Their prices are left as they are.</p>}

      <section className={`alerts ${preview.alerts.length ? 'alerts-on' : ''}`}>
        <h3><Icon name="alert" /> Dishes this pushes past your {data.settings.targetFcPct}% target</h3>
        {preview.alerts.length === 0 ? <p className="muted">None. Every dish stays at or under target after these prices.</p> : <AlertList alerts={preview.alerts.map((a) => ({ ...a, driver: a.driver?.name }))} />}
      </section>
      <div className="modal-acts">
        <label className="field-inline">Effective date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <button className="btn btn-ghost" onClick={() => setFile(null)}>Cancel</button>
        <button className="btn btn-primary" disabled={!changed.length && !toCreate.length} onClick={apply}>Apply {changed.length} price changes{toCreate.length ? ` + ${toCreate.length} new` : ''}</button>
      </div>
    </div>
  )
}

function AlertList({ alerts }: { alerts: PriceImport['alerts'] }) {
  return (
    <ul className="alert-list">
      {alerts.map((a) => (
        <li key={a.id}>
          <span className={`tag ${a.crossed ? 'tag-red' : 'tag-amber'}`}>{a.crossed ? 'crossed' : 'worse'}</span>
          <b>{a.name}</b>
          <span className="num">{pct(a.before)} → <b className="bad">{pct(a.after)}</b></span>
          <span className="muted">{a.overBy.toFixed(1)} pts over{a.driver ? ` · driven by ${a.driver}` : ''}</span>
        </li>
      ))}
    </ul>
  )
}

export default function Prices() {
  const { data, update } = useP()
  const [importing, setImporting] = useState(data.priceImports.length === 0)
  const names = new Map(data.ingredients.map((i) => [i.id, i.name]))
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1 className="h2">Price imports</h1><p className="muted">Each supplier price list or invoice updates ingredient prices, keeps the history, and flags dishes that cross your target.</p></div>
        {!importing && <button className="btn btn-primary btn-sm" onClick={() => setImporting(true)}><Icon name="upload" size={15} /> Import price list</button>}
      </div>
      {importing && (
        <section className="card">
          <div className="card-head"><h2>New price import</h2>{data.priceImports.length > 0 && <button className="icon-btn" aria-label="Close" onClick={() => setImporting(false)}><Icon name="x" /></button>}</div>
          <Importer onDone={() => setImporting(false)} />
        </section>
      )}
      {data.priceImports.length === 0 && !importing && <Empty icon="alert" title="No imports yet" />}
      {data.priceImports.map((p) => (
        <section key={p.id} className="card">
          <div className="card-head">
            <div><h2>{p.supplier}</h2><p className="muted fine">{p.date} · {p.fileName} · {p.changes.length} changes{p.created ? ` · ${p.created} new ingredients` : ''}</p></div>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              update((d) => ({ ...d, priceImports: d.priceImports.filter((x) => x.id !== p.id) }), 'Remove import record')
              toast('Import record removed. Prices stay as they are.', { action: { label: 'Undo', run: () => update((d) => ({ ...d, priceImports: [p, ...d.priceImports] }), 'Restore') } })
            }}>Dismiss</button>
          </div>
          {p.alerts.length > 0 && <div className="alerts alerts-on"><h3><Icon name="alert" /> {p.alerts.length} dish{p.alerts.length > 1 ? 'es' : ''} over target</h3><AlertList alerts={p.alerts} /></div>}
          <ul className="changes">
            {[...p.changes].sort((a, b) => Math.abs(b.new / b.old) - Math.abs(a.new / a.old)).map((c) => {
              const d = c.old > 0 ? ((c.new - c.old) / c.old) * 100 : 0
              return <li key={c.ingredientId}><span>{names.get(c.ingredientId) ?? 'Deleted ingredient'}</span><span className="num muted">{money(c.old)} → {money(c.new)}</span><b className={d > 0 ? 'bad' : 'good'}>{signed(d, (x) => `${x.toFixed(1)}%`)}</b></li>
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
