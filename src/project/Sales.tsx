import { useMemo, useState } from 'react'
import { engInputs, engineer, variance } from '../engine/engineering.ts'
import { aggregateSales, detectSales, FORMAT_LABEL, matchSales, type SalesDetect, type SalesMapping, type SalesMatch } from '../engine/sales.ts'
import { sampleProductMixCsv } from '../engine/sample.ts'
import type { MenuItem, SalesPeriod } from '../engine/types.ts'
import { DropZone, Empty, Icon, Link, money, num, NumField, pct, signed, toast } from '../ui.tsx'
import { uid } from '../actions.ts'
import { useP } from './ctx.ts'

type Choice = { id: string | null; create?: boolean; ignore?: boolean }

function Importer({ onDone }: { onDone: () => void }) {
  const { data, update } = useP()
  const [file, setFile] = useState<{ text: string; name: string } | null>(null)
  const [det, setDet] = useState<SalesDetect | null>(null)
  const [map, setMap] = useState<SalesMapping | null>(null)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [remember, setRemember] = useState(true)
  const [label, setLabel] = useState('')
  const [covers, setCovers] = useState(0)

  const parsed = useMemo(() => (det && map ? aggregateSales(det, map) : null), [det, map])
  const matches = useMemo<SalesMatch[]>(() => (parsed ? matchSales(parsed.items, data.menu) : []), [parsed, data.menu])

  const load = (text: string, name: string) => {
    const d = detectSales(text)
    setFile({ text, name }); setDet(d); setMap(d.mapping); setStep(1)
    const a = aggregateSales(d)
    const month = a.dates.min?.slice(0, 7) ?? new Date(Date.now() - 15 * 864e5).toISOString().slice(0, 7)
    setLabel(month)
    setChoices({})
  }
  const choice = (m: SalesMatch): Choice => choices[m.sale.posName] ?? { id: m.menuItemId }
  const unresolved = matches.filter((m) => { const c = choice(m); return !c.id && !c.create && !c.ignore })
  const fuzzyPending = matches.filter((m) => m.status === 'fuzzy' && !choices[m.sale.posName])

  const save = () => {
    const created: MenuItem[] = []
    const aliasAdds = new Map<string, string[]>()
    const rows = new Map<string, { qty: number; revenue: number }>()
    for (const m of matches) {
      const c = choice(m)
      if (c.ignore) continue
      let id = c.id
      if (c.create) {
        const it: MenuItem = { id: uid('m'), name: m.sale.posName, category: 'Unsorted', recipeId: '', price: m.sale.qty > 0 && m.sale.revenue > 0 ? Math.round((m.sale.revenue / m.sale.qty) * 100) / 100 : 0, modifiers: [], aliases: [m.sale.posName] }
        created.push(it); id = it.id
      } else if (id && remember && m.status !== 'exact') aliasAdds.set(id, [...(aliasAdds.get(id) ?? []), m.sale.posName])
      if (!id) continue
      const r = rows.get(id) ?? { qty: 0, revenue: 0 }
      r.qty += m.sale.qty; r.revenue += m.sale.revenue
      rows.set(id, r)
    }
    const period: SalesPeriod = {
      id: uid('sales'), label: label || 'Untitled period', source: `${FORMAT_LABEL[det!.format]} · ${file!.name}`, covers,
      rows: [...rows].map(([menuItemId, r]) => ({ menuItemId, qty: r.qty, revenue: Math.round(r.revenue * 100) / 100 })),
      importedAt: new Date().toISOString(),
    }
    const replacing = data.sales.find((s) => s.label === period.label)
    update((d) => ({
      ...d,
      menu: [...d.menu.map((mi) => (aliasAdds.has(mi.id) ? { ...mi, aliases: [...new Set([...mi.aliases, ...aliasAdds.get(mi.id)!])] } : mi)), ...created],
      sales: [...d.sales.filter((s) => s.label !== period.label), period].sort((a, b) => a.label.localeCompare(b.label)),
      actuals: replacing ? d.actuals.map((a) => (a.periodId === replacing.id ? { ...a, periodId: period.id } : a)) : d.actuals,
    }), `Import sales ${period.label}`)
    toast(`Imported ${num(period.rows.reduce((s, r) => s + r.qty, 0))} items sold for ${period.label}${created.length ? ` · ${created.length} new menu items` : ''}${replacing ? ' (replaced previous import)' : ''}`, { kind: 'ok' })
    onDone()
  }

  if (!file || !det || !map) return (
    <div className="stack">
      <DropZone label="Drop a POS item-sales export" hint="CSV, any delimiter" onText={load} />
      <div className="inline wrap-gap">
        <button className="btn btn-ghost btn-sm" onClick={() => load(sampleProductMixCsv(), 'sample-product-mix-2026-10.csv')}>Use the sample K-Series Product Mix export</button>
        <Link to="/docs#formats" className="btn btn-ghost btn-sm">Where do I find this file?</Link>
      </div>
    </div>
  )

  const colSel = (k: keyof SalesMapping, lbl: string, optional = false) => (
    <label className="field"><span>{lbl}{optional ? ' (optional)' : ''}</span>
      <select value={map[k]} onChange={(e) => setMap({ ...map, [k]: +e.target.value })}>
        <option value={-1}>— not in file —</option>
        {det.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
      </select>
    </label>
  )

  return (
    <div className="wizard">
      <ol className="wsteps">
        {['Columns', 'Match items', 'Save'].map((s, i) => <li key={s} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}><span>{i + 1}</span>{s}</li>)}
      </ol>
      {step === 1 && parsed && (
        <div className="stack">
          <div className="notice"><Icon name="check" /> Detected <b>{FORMAT_LABEL[det.format]}</b> · header on line {det.headerRow + 1} · {file.name}</div>
          <div className="fgrid fgrid-3">
            {colSel('name', 'Item name')}
            {colSel('qty', 'Quantity sold')}
            {colSel('revenue', 'Net sales', true)}
            {colSel('status', 'Status (skips voids)', true)}
            {colSel('date', 'Date', true)}
          </div>
          {det.revenueTaxIncluded && map.revenue >= 0 && <div className="notice notice-warn"><Icon name="alert" /> Only a tax-included sales column was found. Food-cost % will read low; prefer a tax-excluded column if your POS has one.</div>}
          <div className="report">
            <div><b>{parsed.items.length}</b><span>distinct items</span></div>
            <div><b>{num(parsed.items.reduce((s, i) => s + i.qty, 0))}</b><span>units sold</span></div>
            <div><b>{money(parsed.items.reduce((s, i) => s + i.revenue, 0), 0)}</b><span>net sales</span></div>
            <div><b>{parsed.skipped}</b><span>rows skipped (totals, headers, voids)</span></div>
            <div className={parsed.issues.length ? 'bad' : ''}><b>{parsed.issues.length}</b><span>problems</span></div>
          </div>
          {parsed.issues.length > 0 && (
            <details className="issues-list" open={parsed.issues.length < 8}>
              <summary>Validation report</summary>
              <ul>{parsed.issues.slice(0, 200).map((x, i) => <li key={i}><span className="mono">line {x.line}</span> {x.message}</li>)}</ul>
            </details>
          )}
          <div className="modal-acts">
            <button className="btn btn-ghost" onClick={() => setFile(null)}>Choose another file</button>
            <button className="btn btn-primary" disabled={!parsed.items.length} onClick={() => setStep(2)}>Match {parsed.items.length} items <Icon name="chev" size={15} /></button>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="stack">
          <div className="inline wrap-gap between">
            <p className="muted">{matches.filter((m) => m.status === 'exact').length} exact · {matches.filter((m) => m.status === 'fuzzy').length} close matches to confirm · {matches.filter((m) => m.status === 'unmatched').length} unmatched</p>
            <div className="inline">
              {fuzzyPending.length > 0 && <button className="btn btn-secondary btn-sm" onClick={() => setChoices((c) => { const n = { ...c }; for (const m of fuzzyPending) n[m.sale.posName] = { id: m.menuItemId }; return n })}>Confirm {fuzzyPending.length} close matches</button>}
              {unresolved.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setChoices((c) => { const n = { ...c }; for (const m of unresolved) n[m.sale.posName] = { id: null, create: true }; return n })}>Create {unresolved.length} as new items</button>}
            </div>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>POS name</th><th className="r">Sold</th><th className="r">Net sales</th><th>Menu item</th><th>Status</th></tr></thead>
              <tbody>
                {matches.map((m) => {
                  const c = choice(m)
                  const confirmed = !!choices[m.sale.posName]
                  const val = c.ignore ? '__ignore' : c.create ? '__create' : c.id ?? ''
                  return (
                    <tr key={m.sale.posName} className={!c.id && !c.create && !c.ignore ? 'row-warn' : ''}>
                      <td><b>{m.sale.posName}</b>{m.sale.lines > 1 && <span className="muted fine"> · {m.sale.lines} lines</span>}</td>
                      <td className="r num">{num(m.sale.qty)}</td>
                      <td className="r num">{money(m.sale.revenue, 0)}</td>
                      <td>
                        <select value={val} aria-label={`Menu item for ${m.sale.posName}`} onChange={(e) => {
                          const v = e.target.value
                          setChoices((x) => ({ ...x, [m.sale.posName]: v === '__ignore' ? { id: null, ignore: true } : v === '__create' ? { id: null, create: true } : { id: v || null } }))
                        }}>
                          <option value="">— choose —</option>
                          {m.candidates.length > 0 && <optgroup label="Suggestions">{m.candidates.map((cd) => <option key={cd.id} value={cd.id}>{data.menu.find((x) => x.id === cd.id)?.name} · {Math.round(cd.score * 100)}%</option>)}</optgroup>}
                          <optgroup label="All items">{data.menu.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>
                          <option value="__create">+ Create new menu item</option>
                          <option value="__ignore">Ignore (staff meals, specials…)</option>
                        </select>
                      </td>
                      <td>
                        {c.ignore ? <span className="tag">ignored</span> : c.create ? <span className="tag tag-blue">new item</span>
                          : m.status === 'exact' ? <span className="tag tag-green">exact</span>
                          : c.id && (confirmed || m.status !== 'fuzzy') ? <span className="tag tag-green">confirmed</span>
                          : m.status === 'fuzzy' ? <button className="tag tag-amber" onClick={() => setChoices((x) => ({ ...x, [m.sale.posName]: { id: m.menuItemId } }))}>confirm {Math.round(m.candidates[0].score * 100)}%</button>
                          : <span className="tag tag-red">needs a match</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember confirmed POS names as aliases so next month matches exactly</label>
          <div className="modal-acts">
            <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-primary" disabled={unresolved.length > 0 || fuzzyPending.length > 0} onClick={() => setStep(3)}>
              {unresolved.length || fuzzyPending.length ? `${unresolved.length + fuzzyPending.length} left to resolve` : <>Continue <Icon name="chev" size={15} /></>}
            </button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div className="stack">
          <div className="fgrid">
            <label className="field"><span>Period label</span><input type="month" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
            <div className="field"><span>Covers in this period (for forecasting)</span><NumField value={covers} onChange={setCovers} label="Covers" min={0} /></div>
          </div>
          {data.sales.some((s) => s.label === label) && <div className="notice notice-warn"><Icon name="alert" /> A period labelled {label} exists and will be replaced. Undo is available after saving.</div>}
          <div className="modal-acts">
            <button className="btn btn-ghost" onClick={() => setStep(2)}>Back</button>
            <button className="btn btn-primary" onClick={save}>Save sales period</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Sales() {
  const { data, update, costs, rec } = useP()
  const [importing, setImporting] = useState(data.sales.length === 0)
  const removePeriod = (p: SalesPeriod) => {
    const act = data.actuals.find((a) => a.periodId === p.id)
    update((d) => ({ ...d, sales: d.sales.filter((s) => s.id !== p.id), actuals: d.actuals.filter((a) => a.periodId !== p.id) }), `Delete ${p.label}`)
    toast(`Deleted sales for ${p.label}`, { action: { label: 'Undo', run: () => update((d) => ({ ...d, sales: [...d.sales, p].sort((a, b) => a.label.localeCompare(b.label)), actuals: act ? [...d.actuals, act] : d.actuals }), 'Restore') } })
  }
  const setActual = (periodId: string, k: 'opening' | 'purchases' | 'closing', v: number) => update((d) => {
    const cur = d.actuals.find((a) => a.periodId === periodId) ?? { periodId, opening: 0, purchases: 0, closing: 0 }
    return { ...d, actuals: [...d.actuals.filter((a) => a.periodId !== periodId), { ...cur, [k]: v }] }
  }, 'Edit inventory')
  const setCovers = (id: string, covers: number) => update((d) => ({ ...d, sales: d.sales.map((s) => (s.id === id ? { ...s, covers } : s)) }), 'Edit covers')

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1 className="h2">Sales</h1><p className="muted">Item sales by period, from your POS export. Used for mix, menu engineering and forecasts.</p></div>
        {!importing && <button className="btn btn-primary btn-sm" onClick={() => setImporting(true)}><Icon name="upload" size={15} /> Import sales</button>}
      </div>
      {importing && (
        <section className="card">
          <div className="card-head"><h2>Import a sales export</h2>{data.sales.length > 0 && <button className="icon-btn" onClick={() => setImporting(false)} aria-label="Close importer"><Icon name="x" /></button>}</div>
          {data.menu.length === 0 && <p className="muted fine">No menu yet: you can create menu items straight from the POS names in step 2.</p>}
          <Importer onDone={() => setImporting(false)} />
        </section>
      )}
      {data.sales.length === 0 && !importing && <Empty icon="upload" title="No sales yet" />}
      {[...data.sales].reverse().map((p) => {
        const eng = costs.length ? engineer(engInputs(costs, p), { targetFcPct: data.settings.targetFcPct }) : null
        const a = data.actuals.find((x) => x.periodId === p.id) ?? { periodId: p.id, opening: 0, purchases: 0, closing: 0 }
        const v = eng && (a.opening || a.purchases || a.closing) ? variance(eng, a) : null
        const qty = p.rows.reduce((s, r) => s + r.qty, 0)
        return (
          <section key={p.id} className="card">
            <div className="card-head">
              <div><h2>{p.label}</h2><p className="muted fine">{p.source} · imported {new Date(p.importedAt).toLocaleDateString('en-CA')}</p></div>
              <button className="btn btn-ghost btn-sm danger" onClick={() => removePeriod(p)}><Icon name="trash" size={15} /> Delete</button>
            </div>
            <div className="report">
              <div><b>{num(qty)}</b><span>items sold</span></div>
              <div><b>{money(eng?.revenue ?? 0, 0)}</b><span>net food sales</span></div>
              <div><b>{eng ? pct(eng.fcPct) : '—'}</b><span>theoretical food cost</span></div>
              <div><span className="field-inline">Covers <NumField value={p.covers} onChange={(n) => setCovers(p.id, n)} label="Covers" width={100} /></span><span>{p.covers ? `${(qty / p.covers).toFixed(2)} items per cover` : 'for forecasts'}</span></div>
            </div>
            <h3 className="h4">Theoretical vs actual</h3>
            <p className="muted fine">Actual food cost = opening inventory + purchases − closing inventory, at cost. Leave blank if you don’t count stock.</p>
            <div className="tva">
              <div className="field"><span>Opening inventory</span><NumField value={a.opening} onChange={(n) => setActual(p.id, 'opening', n)} prefix="$" label="Opening inventory" /></div>
              <div className="field"><span>Food purchases</span><NumField value={a.purchases} onChange={(n) => setActual(p.id, 'purchases', n)} prefix="$" label="Purchases" /></div>
              <div className="field"><span>Closing inventory</span><NumField value={a.closing} onChange={(n) => setActual(p.id, 'closing', n)} prefix="$" label="Closing inventory" /></div>
              {v && (
                <div className={`tva-out ${v.gapPct > 1.5 ? 'bad' : 'good'}`}>
                  <div><span>Theoretical</span><b>{pct(v.theoreticalPct)}</b><small>{money(v.theoretical, 0)}</small></div>
                  <div><span>Actual</span><b>{pct(v.actualPct)}</b><small>{money(v.actual, 0)}</small></div>
                  <div><span>Gap</span><b>{signed(v.gapPct, (x) => x.toFixed(1))} pts</b><small>{signed(v.gap, (x) => money(x, 0))} unexplained</small></div>
                </div>
              )}
            </div>
            {v && v.gapPct > 1.5 && <p className="fine">A gap above 1–2 points usually means waste, over-portioning, comps not rung in, or recipes that don’t match what the line actually does. Start with the top-selling items in <Link to={`/app/${rec.id}/engineering`}>engineering</Link>.</p>}
          </section>
        )
      })}
    </div>
  )
}
