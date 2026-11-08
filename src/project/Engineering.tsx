import { useMemo, useState } from 'react'
import { Matrix } from '../charts.tsx'
import { engInputs, engineer, QUADRANT, whatIf, type Quadrant } from '../engine/engineering.ts'
import { engineeringCsv } from '../engine/outputs.ts'
import { download, Empty, Icon, Link, money, num, NumField, pct, QPill, signed, slug, toast } from '../ui.tsx'
import { useP } from './ctx.ts'

export default function Engineering() {
  const { data, costs, rec, periodId, update } = useP()
  const period = data.sales.find((s) => s.id === periodId)
  const [cat, setCat] = useState('')
  const [sel, setSel] = useState<string | null>(() => new URLSearchParams(location.search).get('item'))
  const [price, setPrice] = useState<number | null>(null)
  const [sort, setSort] = useState<'quadrant' | 'totalCm' | 'mix'>('quadrant')
  const s = data.settings
  const opts = { popularityFactor: s.popularityFactor, targetFcPct: s.targetFcPct }

  const inputs = useMemo(() => (period ? engInputs(costs, period).filter((i) => !cat || i.category === cat) : []), [costs, period, cat])
  const eng = useMemo(() => engineer(inputs, opts), [inputs, s.popularityFactor, s.targetFcPct])
  const cats = [...new Set(data.menu.map((m) => m.category))]
  const selRow = eng.rows.find((r) => r.id === sel) ?? null
  const wi = useMemo(() => (selRow && price !== null && Math.abs(price - selRow.price) > 0.001 ? whatIf(inputs, selRow.id, price, s.elasticity, opts) : null), [selRow, price, inputs, s.elasticity])
  const shown = wi ? wi.after : eng

  if (!period) return (
    <Empty icon="grid" title="Menu engineering needs a month of sales" actions={<Link to={`/app/${rec.id}/sales`} className="btn btn-primary">Import sales</Link>}>
      Kasavana–Smith classifies each item by popularity (share of items sold) and contribution margin (price minus plate cost), so it needs both recipes and a sales export.
    </Empty>
  )

  const order: Record<Quadrant, number> = { star: 0, plowhorse: 1, puzzle: 2, dog: 3 }
  const rows = [...eng.rows].sort((a, b) => sort === 'quadrant' ? order[a.quadrant] - order[b.quadrant] || b.totalCm - a.totalCm : sort === 'totalCm' ? b.totalCm - a.totalCm : b.mixPct - a.mixPct)
  const pick = (id: string) => { setSel(id); setPrice(eng.rows.find((r) => r.id === id)?.price ?? null) }
  const counts = (['star', 'plowhorse', 'puzzle', 'dog'] as Quadrant[]).map((q) => [q, eng.rows.filter((r) => r.quadrant === q).length] as const)

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1 className="h2">Menu engineering</h1><p className="muted">{period.label} · {num(eng.totalQty)} items sold · popularity threshold {pct(eng.popThreshold)} ({Math.round(s.popularityFactor * 100)}% rule) · average CM {money(eng.avgCm)}</p></div>
        <div className="acts"><button className="btn btn-ghost btn-sm" onClick={() => download(`${slug(rec.name)}-engineering-${period.label}.csv`, engineeringCsv(eng))}><Icon name="download" size={15} /> CSV</button></div>
      </div>
      <div className="filters">
        <div className="chips" role="group" aria-label="Category">
          <button className={!cat ? 'chip on' : 'chip'} onClick={() => setCat('')}>Whole menu</button>
          {cats.map((c) => <button key={c} className={cat === c ? 'chip on' : 'chip'} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        <p className="muted fine">Analyse a category on its own when prices differ a lot, so desserts aren’t judged against mains.</p>
      </div>
      <div className="qcounts">{counts.map(([q, n]) => <div key={q} className={`qc q-${q}`}><QPill q={q} /><b>{n}</b><span>{QUADRANT[q].blurb}</span></div>)}</div>
      <div className="eng-grid">
        <section className="card">
          <Matrix rows={shown.rows} avgCm={shown.avgCm} popThreshold={shown.popThreshold} highlight={sel} onSelect={pick}
            ghost={wi ? { x: wi.rowBefore.mixPct, y: wi.rowBefore.cm } : null} labels="all" height={460} />
        </section>
        <section className="card whatif">
          {selRow ? (
            <>
              <div className="card-head"><div><span className="muted fine">Price what-if</span><h2>{selRow.name}</h2></div><button className="icon-btn" aria-label="Close" onClick={() => { setSel(null); setPrice(null) }}><Icon name="x" /></button></div>
              <div className="wi-price">
                <NumField value={price ?? selRow.price} onChange={setPrice} prefix="$" step={0.5} label="New price" />
                <input type="range" min={Math.max(1, Math.floor(selRow.price * 0.7))} max={Math.ceil(selRow.price * 1.35)} step={0.25} value={price ?? selRow.price} onChange={(e) => setPrice(+e.target.value)} aria-label="New price slider"
                  style={{ ['--p' as string]: `${(((price ?? selRow.price) - Math.floor(selRow.price * 0.7)) / (Math.ceil(selRow.price * 1.35) - Math.floor(selRow.price * 0.7))) * 100}%` }} />
              </div>
              <div className="field-inline">Price elasticity <NumField value={s.elasticity} onChange={(n) => update((d) => ({ ...d, settings: { ...d.settings, elasticity: n } }), 'Elasticity')} step={0.1} label="Elasticity" width={90} />
                <span className="muted fine">−0.8 means +10% price ≈ −8% sold</span></div>
              <table className="tbl compact wi-tbl">
                <thead><tr><th /><th className="r">Now</th><th className="r">What-if</th></tr></thead>
                <tbody>
                  <tr><td>Avg price</td><td className="r num">{money(selRow.price)}</td><td className="r num">{money(price ?? selRow.price)}</td></tr>
                  <tr><td>Sold</td><td className="r num">{num(selRow.qty)}</td><td className="r num">{num(wi ? wi.qtyAfter : selRow.qty)}</td></tr>
                  <tr><td>Food cost</td><td className="r num">{pct(selRow.fcPct)}</td><td className="r num">{pct(wi ? wi.rowAfter.fcPct : selRow.fcPct)}</td></tr>
                  <tr><td>CM per plate</td><td className="r num">{money(selRow.cm)}</td><td className="r num">{money(wi ? wi.rowAfter.cm : selRow.cm)}</td></tr>
                  <tr><td>Item CM / month</td><td className="r num">{money(selRow.totalCm, 0)}</td><td className="r num">{money(wi ? wi.rowAfter.totalCm : selRow.totalCm, 0)}</td></tr>
                  <tr><td>Class</td><td className="r"><QPill q={selRow.quadrant} /></td><td className="r"><QPill q={wi ? wi.rowAfter.quadrant : selRow.quadrant} /></td></tr>
                </tbody>
              </table>
              {wi && <div className={`wi-delta ${wi.deltaTotalCm >= 0 ? 'good' : 'bad'}`}>Menu CM {signed(wi.deltaTotalCm, (x) => money(x, 0))} / month{wi.rowAfter.quadrant !== wi.rowBefore.quadrant && <> · moves to <b>{QUADRANT[wi.rowAfter.quadrant].label}</b></>}</div>}
              <p className="wi-rec"><b>{selRow.action}.</b> {selRow.detail}</p>
              {wi && <button className="btn btn-primary btn-sm" onClick={() => { update((d) => ({ ...d, menu: d.menu.map((m) => (m.id === selRow.id ? { ...m, price: price! } : m)) }), `Reprice ${selRow.name}`); toast(`${selRow.name} now ${money(price!)} on the menu. Matrix uses realised prices until next month’s sales.`, { kind: 'ok' }) }}>Apply {money(price!)} to menu</button>}
            </>
          ) : (
            <div className="wi-empty">
              <Icon name="grid" size={26} />
              <h3>Pick a dish</h3>
              <p className="muted">Click a dot or a row to test a new price. Sold quantity responds by your elasticity, and the thresholds re-compute, so the dish (and its neighbours) can change class.</p>
            </div>
          )}
        </section>
      </div>

      <div className="table-wrap">
        <table className="tbl">
          <thead><tr>
            <th><button className="th-sort" onClick={() => setSort('quadrant')}>Item {sort === 'quadrant' && '↓'}</button></th>
            <th className="r"><button className="th-sort" onClick={() => setSort('mix')}>Mix {sort === 'mix' && '↓'}</button></th>
            <th className="r">Avg price</th><th className="r">Cost</th><th className="r">CM</th>
            <th className="r"><button className="th-sort" onClick={() => setSort('totalCm')}>Total CM {sort === 'totalCm' && '↓'}</button></th>
            <th>Class</th><th>Recommendation</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`clickable ${r.id === sel ? 'sel' : ''}`} onClick={() => pick(r.id)}>
                <td><b>{r.name}</b><div className="muted fine">{num(r.qty)} sold</div></td>
                <td className={`r num ${r.highPop ? '' : 'muted'}`}>{pct(r.mixPct)}</td>
                <td className="r num">{money(r.price)}</td>
                <td className="r num">{money(r.cost)}</td>
                <td className={`r num ${r.highCm ? '' : 'muted'}`}>{money(r.cm)}</td>
                <td className="r num">{money(r.totalCm, 0)}</td>
                <td><QPill q={r.quadrant} /></td>
                <td className="rec"><b>{r.action}</b><div className="muted fine">{r.detail}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
