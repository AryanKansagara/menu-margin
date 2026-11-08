import { Fragment, useMemo, useState } from 'react'
import { Matrix } from '../charts.tsx'
import { costRecipe, CycleError, makeBook } from '../engine/costing.ts'
import { QUADRANT, variance, type Quadrant } from '../engine/engineering.ts'
import { engineeringCsv, forecast, ingredientsCsv, menuCostCsv, orderGuideCsv, scaleRecipe } from '../engine/outputs.ts'
import { toCsv } from '../engine/csv.ts'
import { fmtQty, humanize, UNIT_LABEL } from '../engine/units.ts'
import { download, Empty, Icon, Link, money, navigate, num, NumField, pct, QPill, signed, slug } from '../ui.tsx'
import { useP } from './ctx.ts'

export default function Outputs({ sub }: { sub?: string }) {
  const { rec } = useP()
  const base = `/app/${rec.id}/outputs`
  if (sub === 'cards') return <Cards />
  if (sub === 'order') return <OrderGuide />
  if (sub === 'report') return <Report />
  const tiles = [
    { to: `${base}/cards`, i: 'print', h: 'Recipe cards', p: 'Printable cards for the line, scaled to the batch you are making.' },
    { to: `${base}/order`, i: 'download', h: 'Order guide & prep list', p: 'Forecast covers → sub-recipe batches to prep and cases to order by supplier.' },
    { to: `${base}/report`, i: 'book', h: 'Owner’s monthly report', p: 'One printable page: food cost, theoretical vs actual, matrix, price moves, actions.' },
  ]
  return (
    <div className="stack">
      <div className="page-head"><div><h1 className="h2">Outputs</h1><p className="muted">Things to print, send, or paste into the spreadsheet you still keep.</p></div></div>
      <div className="tiles">
        {tiles.map((t) => <Link key={t.h} to={t.to} className="tile"><span className="feature-ico"><Icon name={t.i} size={22} /></span><h3>{t.h}</h3><p className="muted">{t.p}</p><span className="tile-go">Open <Icon name="chev" size={14} /></span></Link>)}
      </div>
      <Exports />
    </div>
  )
}

function Exports() {
  const { data, rec, eng } = useP()
  const s = slug(rec.name)
  const recipesCsv = () => {
    const book = makeBook(data)
    const rows: (string | number)[][] = [['Recipe', 'Kind', 'Component', 'Qty', 'Unit', 'Line cost', 'Batch cost', 'Unit cost']]
    for (const r of data.recipes) {
      try {
        const c = costRecipe(book, r.id)
        c.lines.forEach((l) => rows.push([r.name, r.kind, l.name, l.line.qty, l.line.unit, l.cost, c.batchCost, c.unitCost]))
      } catch (e) { rows.push([r.name, r.kind, (e as Error).message, '', '', '', '', '']) }
    }
    return toCsv(rows)
  }
  const items = [
    { n: 'Ingredients & unit costs', f: `${s}-ingredients.csv`, get: () => ingredientsCsv(data), ok: data.ingredients.length > 0 },
    { n: 'Recipe costing (every line)', f: `${s}-recipes.csv`, get: recipesCsv, ok: data.recipes.length > 0 },
    { n: 'Menu costing & target prices', f: `${s}-menu.csv`, get: () => menuCostCsv(data), ok: data.menu.length > 0 },
    { n: 'Menu engineering (current period)', f: `${s}-engineering.csv`, get: () => engineeringCsv(eng!), ok: !!eng },
  ]
  return (
    <section className="card">
      <div className="card-head"><h2>CSV exports</h2></div>
      <ul className="exports">
        {items.map((x) => <li key={x.f}><span>{x.n}</span><code className="muted">{x.f}</code><button className="btn btn-ghost btn-sm" disabled={!x.ok} onClick={() => download(x.f, x.get())}><Icon name="download" size={15} /> Download</button></li>)}
      </ul>
    </section>
  )
}

function Cards() {
  const { data, rec } = useP()
  const qs = new URLSearchParams(location.search)
  const [id, setId] = useState(qs.get('recipe') ?? data.recipes[0]?.id ?? '')
  const [factor, setFactor] = useState(1)
  const [showCost, setShowCost] = useState(true)
  const r = data.recipes.find((x) => x.id === id)
  const book = useMemo(() => makeBook(data), [data])
  if (!r) return <Empty icon="print" title="No recipes to print" actions={<Link to={`/app/${rec.id}/recipes`} className="btn btn-primary">Build a recipe</Link>} />
  const scaled = scaleRecipe(r, factor)
  let cost: ReturnType<typeof costRecipe> | null = null
  try { cost = costRecipe(book, r.id) } catch (e) { if (!(e instanceof CycleError)) throw e }
  const nameOf = (l: (typeof r.lines)[number]) => (l.ref.kind === 'ing' ? data.ingredients.find((i) => i.id === l.ref.id)?.name : data.recipes.find((x) => x.id === l.ref.id)?.name) ?? 'Missing'
  const yieldText = r.kind === 'dish' ? `${num(scaled.portions, 1)} portion${scaled.portions === 1 ? '' : 's'}` : fmtQty(...humanize(scaled.yieldQty, r.yieldUnit))
  return (
    <div className="stack">
      <div className="page-head no-print">
        <div><Link to={`/app/${rec.id}/outputs`} className="crumb"><Icon name="back" size={14} /> Outputs</Link><h1 className="h2">Recipe card</h1></div>
        <div className="acts"><button className="btn btn-primary btn-sm" onClick={() => window.print()}><Icon name="print" size={15} /> Print</button></div>
      </div>
      <div className="filters no-print">
        <label className="field-inline">Recipe <select value={id} onChange={(e) => { setId(e.target.value); navigate(`/app/${rec.id}/outputs/cards?recipe=${e.target.value}`, true) }}>{data.recipes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="field-inline">Scale × <NumField value={factor} onChange={(n) => setFactor(Math.max(0.05, n))} step={0.5} label="Scale factor" width={90} /></label>
        <div className="chips">{[0.5, 1, 2, 3, 5].map((f) => <button key={f} className={factor === f ? 'chip on' : 'chip'} onClick={() => setFactor(f)}>×{f}</button>)}</div>
        {r.kind === 'dish' && <label className="field-inline">or portions <NumField value={Math.round(scaled.portions * 100) / 100} onChange={(n) => setFactor(Math.max(0.05, n / (r.portions || 1)))} label="Target portions" width={90} /></label>}
        <label className="check"><input type="checkbox" checked={showCost} onChange={(e) => setShowCost(e.target.checked)} /> Show costs</label>
      </div>
      <article className="rcard print-page">
        <header>
          <div><span className="preheader dark">{r.kind === 'dish' ? 'Dish' : 'Sub-recipe'} · {rec.name}</span><h2>{r.name}</h2></div>
          <div className="rcard-yield"><span>Yield</span><b>{yieldText}</b>{factor !== 1 && <small>×{factor} of base batch</small>}</div>
        </header>
        <table className="rcard-tbl">
          <thead><tr><th>Qty</th><th>Component</th>{showCost && <th className="r">Cost</th>}</tr></thead>
          <tbody>
            {scaled.lines.map((l, i) => (
              <tr key={i}><td className="num"><b>{fmtQty(...humanize(l.qty, l.unit))}</b></td><td>{nameOf(l)}{l.ref.kind === 'rec' && <span className="muted"> (sub-recipe)</span>}</td>{showCost && <td className="r num">{cost ? money(cost.lines[i].cost * factor) : '—'}</td>}</tr>
            ))}
          </tbody>
          {showCost && cost && <tfoot><tr><td colSpan={2}>Batch cost{r.kind === 'dish' ? ` · ${money(cost.unitCost)} per portion` : ` · ${money(cost.unitCost)} per ${UNIT_LABEL[r.yieldUnit]}`}</td><td className="r num">{money(cost.batchCost * factor)}</td></tr></tfoot>}
        </table>
        {r.method && <section className="rcard-method"><h3>Method</h3>{r.method.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}</section>}
        <footer className="muted fine">Printed {new Date().toLocaleDateString('en-CA')} · quantities are edible portion · Menu Margin</footer>
      </article>
    </div>
  )
}

function OrderGuide() {
  const { data, rec, periodId } = useP()
  const period = data.sales.find((s) => s.id === periodId)
  const perDay = period?.covers ? period.covers / 30 : 0
  const [covers, setCovers] = useState(Math.round(perDay * 7) || 500)
  const [onHand, setOnHand] = useState<Record<string, number>>({})
  const f = useMemo(() => (period ? forecast(data, period, covers, onHand) : null), [data, period, covers, onHand])
  if (!period || !f) return <Empty icon="download" title="Forecasts need a sales period" actions={<Link to={`/app/${rec.id}/sales`} className="btn btn-primary">Import sales</Link>}>The item mix per cover comes from your last sales import.</Empty>
  const bySupplier = new Map<string, typeof f.order>()
  for (const o of f.order) bySupplier.set(o.ingredient.supplier || 'No supplier', [...(bySupplier.get(o.ingredient.supplier || 'No supplier') ?? []), o])
  const total = f.order.reduce((s, o) => s + o.cost, 0)
  return (
    <div className="stack">
      <div className="page-head no-print">
        <div><Link to={`/app/${rec.id}/outputs`} className="crumb"><Icon name="back" size={14} /> Outputs</Link><h1 className="h2">Order guide &amp; prep list</h1></div>
        <div className="acts">
          <button className="btn btn-ghost btn-sm" onClick={() => download(`${slug(rec.name)}-order-guide.csv`, orderGuideCsv(f))}><Icon name="download" size={15} /> CSV</button>
          <button className="btn btn-primary btn-sm" onClick={() => window.print()}><Icon name="print" size={15} /> Print</button>
        </div>
      </div>
      <div className="filters no-print">
        <label className="field-inline">Forecast covers <NumField value={covers} onChange={(n) => setCovers(Math.max(0, Math.round(n)))} label="Forecast covers" width={110} /></label>
        <div className="chips">{[1, 3, 7].map((d) => <button key={d} className="chip" onClick={() => setCovers(Math.round(perDay * d))} disabled={!perDay}>{d === 1 ? '1 day' : `${d} days`}{perDay ? ` · ${Math.round(perDay * d)}` : ''}</button>)}</div>
        <p className="muted fine">Mix from {period.label}{period.covers ? ` (${num(period.covers)} covers)` : ' (no covers entered: scaled by items sold)'}.</p>
      </div>
      <div className="print-page stack">
        <div className="print-only"><h2>{rec.name}: order guide for {num(covers)} covers</h2></div>
        {f.unconvertible.length > 0 && <div className="notice notice-warn"><Icon name="alert" /> Couldn’t convert units for: {f.unconvertible.join(', ')}. Add a density or each-weight.</div>}
        <section className="card">
          <div className="card-head"><h2>Prep list</h2><span className="muted fine">sub-recipe batches, rounded up to half batches</span></div>
          {f.prep.length === 0 ? <p className="muted">No sub-recipes needed.</p> : (
            <table className="tbl compact">
              <thead><tr><th>Sub-recipe</th><th className="r">Needed</th><th className="r">Batch</th><th className="r">Make</th></tr></thead>
              <tbody>{f.prep.map((p) => <tr key={p.recipe.id}><td><b>{p.recipe.name}</b></td><td className="r num">{fmtQty(...humanize(p.need, p.recipe.yieldUnit))}</td><td className="r num muted">{fmtQty(...humanize(p.recipe.yieldQty, p.recipe.yieldUnit))}</td><td className="r num"><b>{p.batches} ×</b></td></tr>)}</tbody>
            </table>
          )}
        </section>
        <section className="card">
          <div className="card-head"><h2>Order guide</h2><span className="num"><b>{money(total, 0)}</b> <span className="muted">est.</span></span></div>
          <table className="tbl compact">
            <thead><tr><th>Ingredient</th><th className="r">Need</th><th className="r no-print">On hand</th><th className="r">Order</th><th className="r">Est. cost</th></tr></thead>
            <tbody>
              {[...bySupplier].map(([sup, list]) => (
                <Fragment key={sup}>
                  <tr className="group"><td colSpan={5}>{sup}</td></tr>
                  {list.map((o) => (
                    <tr key={o.ingredient.id}>
                      <td><b>{o.ingredient.name}</b>{o.ingredient.code && <span className="muted fine"> · {o.ingredient.code}</span>}</td>
                      <td className="r num">{fmtQty(o.need, o.ingredient.packUnit)}</td>
                      <td className="r no-print"><NumField value={onHand[o.ingredient.id] ?? 0} onChange={(n) => setOnHand((h) => ({ ...h, [o.ingredient.id]: Math.max(0, n) }))} label={`On hand ${o.ingredient.purchaseUnit}s of ${o.ingredient.name}`} suffix={o.ingredient.purchaseUnit} width={120} /></td>
                      <td className="r num"><b>{o.packs}</b> {o.ingredient.purchaseUnit}{o.packs === 1 ? '' : 's'}</td>
                      <td className="r num">{money(o.cost, 0)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}

function Report() {
  const { data, rec, costs, eng, periodId } = useP()
  const period = data.sales.find((s) => s.id === periodId)
  const act = data.actuals.find((a) => a.periodId === periodId)
  const v = eng && act ? variance(eng, act) : null
  const t = data.settings.targetFcPct
  if (!eng || !period) return <Empty icon="book" title="The monthly report needs a sales period" actions={<Link to={`/app/${rec.id}/sales`} className="btn btn-primary">Import sales</Link>} />
  const since = (d: string) => d >= `${period.label}-01`.slice(0, 10)
  const moves = data.ingredients.map((i) => {
    const h = i.history.filter((x) => x.date)
    const before = [...h].reverse().find((x) => !since(x.date))
    const pctCh = before && before.price > 0 ? ((i.price - before.price) / before.price) * 100 : 0
    return { i, pct: pctCh, before: before?.price }
  }).filter((x) => Math.abs(x.pct) >= 2).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 8)
  const by = (q: Quadrant) => eng.rows.filter((r) => r.quadrant === q).sort((a, b) => b.totalCm - a.totalCm)
  const over = costs.filter((c) => c.fcPct > t).sort((a, b) => b.fcPct - a.fcPct)
  const top = [...eng.rows].sort((a, b) => b.totalCm - a.totalCm).slice(0, 5)
  return (
    <div className="stack">
      <div className="page-head no-print">
        <div><Link to={`/app/${rec.id}/outputs`} className="crumb"><Icon name="back" size={14} /> Outputs</Link><h1 className="h2">Owner’s monthly report</h1></div>
        <div className="acts"><button className="btn btn-primary btn-sm" onClick={() => window.print()}><Icon name="print" size={15} /> Print or save PDF</button></div>
      </div>
      <article className="report-page print-page">
        <header className="rp-head">
          <div><span className="preheader dark">Monthly food-cost report</span><h2>{rec.name}</h2><p className="muted">{period.label} · {period.covers ? `${num(period.covers)} covers · ` : ''}target {t}%{data.synthetic ? ' · synthetic sample data' : ''}</p></div>
        </header>
        <div className="kpis">
          <div className="kpi"><span>Food sales</span><b>{money(eng.revenue, 0)}</b><small>{num(eng.totalQty)} items</small></div>
          <div className="kpi"><span>Theoretical FC</span><b className={eng.fcPct > t ? 'bad' : ''}>{pct(eng.fcPct)}</b><small>{money(eng.foodCost, 0)}</small></div>
          <div className="kpi"><span>Actual FC</span><b className={v && v.gapPct > 1.5 ? 'bad' : ''}>{v ? pct(v.actualPct) : '—'}</b><small>{v ? `${signed(v.gapPct, (x) => x.toFixed(1))} pts · ${money(v.gap, 0)}` : 'no inventory entered'}</small></div>
          <div className="kpi"><span>Contribution margin</span><b>{money(eng.totalCm, 0)}</b><small>avg {money(eng.avgCm)} / item</small></div>
        </div>
        <div className="rp-grid">
          <section>
            <h3>Menu matrix</h3>
            <Matrix rows={eng.rows} avgCm={eng.avgCm} popThreshold={eng.popThreshold} labels="all" height={380} />
          </section>
          <section>
            <h3>Top earners</h3>
            <table className="tbl compact"><tbody>{top.map((r) => <tr key={r.id}><td>{r.name}</td><td className="r num">{money(r.totalCm, 0)}</td><td><QPill q={r.quadrant} /></td></tr>)}</tbody></table>
            <h3>Over {t}% food cost</h3>
            {over.length ? <table className="tbl compact"><tbody>{over.map((c) => <tr key={c.item.id}><td>{c.item.name}</td><td className="r num bad">{pct(c.fcPct)}</td><td className="r num muted">→ {money(c.suggested)}</td></tr>)}</tbody></table> : <p className="muted">None.</p>}
            <h3>Ingredient price moves this month</h3>
            {moves.length ? <table className="tbl compact"><tbody>{moves.map((m) => <tr key={m.i.id}><td>{m.i.name}</td><td className="r num muted">{money(m.before!)} → {money(m.i.price)}</td><td className={`r num ${m.pct > 0 ? 'bad' : 'good'}`}>{signed(m.pct, (x) => `${x.toFixed(1)}%`)}</td></tr>)}</tbody></table> : <p className="muted">No moves over 2%.</p>}
          </section>
        </div>
        <section>
          <h3>Actions for next month</h3>
          <ol className="rp-actions">
            {(['plowhorse', 'dog', 'puzzle', 'star'] as Quadrant[]).flatMap((q) => by(q).slice(0, q === 'star' ? 2 : 3)).map((r) => (
              <li key={r.id}><QPill q={r.quadrant} /> <b>{r.name}</b>: {r.action}. <span className="muted">{QUADRANT[r.quadrant].blurb}; {pct(r.mixPct)} of mix, CM {money(r.cm)}.</span></li>
            ))}
          </ol>
        </section>
        <footer className="muted fine">Generated {new Date().toLocaleDateString('en-CA')} with Menu Margin. Costs use current ingredient prices; sales are tax excluded.</footer>
      </article>
    </div>
  )
}
