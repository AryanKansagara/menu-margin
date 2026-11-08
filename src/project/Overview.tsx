import { Matrix } from '../charts.tsx'
import { variance } from '../engine/engineering.ts'
import { Icon, Link, money, navigate, pct, QPill, signed } from '../ui.tsx'
import { useP } from './ctx.ts'

export function Checklist() {
  const { data, rec } = useP()
  const base = `/app/${rec.id}`
  const steps = [
    { done: data.ingredients.length > 0, h: 'Add ingredients', p: 'Import a supplier price list or invoice CSV, or add them by hand.', to: `${base}/prices`, cta: 'Import price list', alt: { to: `${base}/ingredients`, label: 'Add by hand' } },
    { done: data.recipes.length > 0, h: 'Build recipes', p: 'Sub-recipes first (sauces, doughs), then dishes. Quantities are edible portion.', to: `${base}/recipes`, cta: 'Open recipes' },
    { done: data.menu.length > 0, h: 'Set up the menu', p: 'Link each menu item to a recipe and set its price. Or let the sales import create items for you.', to: `${base}/menu`, cta: 'Open menu' },
    { done: data.sales.length > 0, h: 'Import a month of sales', p: 'Lightspeed K-Series Product Mix, L-Series Receipt items, or any POS item-sales CSV.', to: `${base}/sales`, cta: 'Import sales', alt: { to: '/docs#formats', label: 'How to export' } },
  ]
  const left = steps.filter((s) => !s.done).length
  if (!left) return null
  return (
    <section className="card checklist">
      <div className="card-head">
        <div><h2>Get set up</h2><p className="muted">{4 - left} of 4 done. Each step works on its own; costing improves as you go.</p></div>
        <div className="progress" aria-label={`${4 - left} of 4 steps done`}><span style={{ width: `${((4 - left) / 4) * 100}%` }} /></div>
      </div>
      <ol>
        {steps.map((s, i) => (
          <li key={s.h} className={s.done ? 'done' : ''}>
            <span className="ck">{s.done ? <Icon name="check" size={14} /> : i + 1}</span>
            <div><h3>{s.h}</h3><p className="muted">{s.p}</p></div>
            {!s.done && <div className="ck-acts">{s.alt && <Link to={s.alt.to} className="btn btn-ghost btn-sm">{s.alt.label}</Link>}<Link to={s.to} className="btn btn-primary btn-sm">{s.cta}</Link></div>}
          </li>
        ))}
      </ol>
    </section>
  )
}

export function Overview() {
  const { data, rec, costs, eng, cycles, periodId } = useP()
  const t = data.settings.targetFcPct
  const period = data.sales.find((s) => s.id === periodId)
  const act = data.actuals.find((a) => a.periodId === periodId)
  const v = eng && act ? variance(eng, act) : null
  const over = costs.filter((c) => c.fcPct > t).sort((a, b) => b.fcPct - a.fcPct)
  const broken = costs.filter((c) => c.errors.length)
  const score = (r: NonNullable<typeof eng>['rows'][number]) => r.qty * Math.max(0, eng!.avgCm - r.cm) + r.qty * Math.max(0, r.cost - (r.price * t) / 100) + (r.quadrant === 'puzzle' ? r.cm * 5 : 0)
  const actions = eng ? [...eng.rows].filter((r) => r.quadrant !== 'star' || r.fcPct > t).sort((a, b) => score(b) - score(a)).slice(0, 5) : []
  const base = `/app/${rec.id}`
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="h2">{rec.name}</h1>
          <p className="muted">{period ? `${period.label} · ${period.covers ? `${period.covers.toLocaleString()} covers · ` : ''}${period.source}` : 'No sales imported yet'} · target food cost {t}%</p>
        </div>
      </div>
      <Checklist />
      {cycles.length > 0 && (
        <div className="notice notice-err"><Icon name="alert" /> Circular recipe: {cycles[0].join(' → ')}. Costs that depend on it can’t be computed until you break the loop.</div>
      )}

      <div className="kpis">
        <div className="kpi">
          <span>Theoretical food cost</span>
          <b className={eng && eng.fcPct > t ? 'bad' : ''}>{eng ? pct(eng.fcPct) : '—'}</b>
          <small>{eng ? `${money(eng.foodCost, 0)} on ${money(eng.revenue, 0)} sales` : 'Import sales to weight by mix'}</small>
        </div>
        <div className="kpi">
          <span>Actual food cost</span>
          <b className={v && v.gapPct > 1.5 ? 'bad' : ''}>{v ? pct(v.actualPct) : '—'}</b>
          <small>{v ? `${signed(v.gapPct, (x) => x.toFixed(1))} pts vs theoretical · ${money(v.gap, 0)}` : <Link to={`${base}/sales`}>Enter inventory &amp; purchases</Link>}</small>
        </div>
        <div className="kpi">
          <span>Contribution margin</span>
          <b>{eng ? money(eng.totalCm, 0) : '—'}</b>
          <small>{eng ? `avg ${money(eng.avgCm)} per item sold` : '—'}</small>
        </div>
        <div className="kpi">
          <span>Dishes over {t}%</span>
          <b className={over.length ? 'bad' : 'good'}>{over.length}<em>/{costs.length}</em></b>
          <small>{over[0] ? `worst: ${over[0].item.name} ${pct(over[0].fcPct)}` : costs.length ? 'all on target' : 'no menu yet'}</small>
        </div>
      </div>

      {eng && (
        <div className="grid-2">
          <section className="card">
            <div className="card-head"><h2>Menu matrix</h2><Link to={`${base}/engineering`} className="btn btn-ghost btn-sm">Open engineering <Icon name="chev" size={14} /></Link></div>
            <Matrix rows={eng.rows} avgCm={eng.avgCm} popThreshold={eng.popThreshold} labels="none" compact width={480} height={320} onSelect={(id) => navigate(`${base}/engineering?item=${id}`)} />
          </section>
          <section className="card">
            <div className="card-head"><h2>Do these first</h2><span className="muted fine">ranked by margin left on the table</span></div>
            <ul className="todo">
              {actions.map((r) => (
                <li key={r.id}>
                  <QPill q={r.quadrant} />
                  <div><b>{r.name}</b><span className="muted">{r.action}</span></div>
                  <span className="todo-n">{pct(r.fcPct)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {(broken.length > 0 || over.length > 0) && (
        <section className="card">
          <div className="card-head"><h2>Needs attention</h2></div>
          <ul className="issues">
            {broken.map((c) => <li key={c.item.id}><Icon name="alert" size={16} /><b>{c.item.name}</b><span className="muted">{c.errors[0]}</span><Link to={`${base}/menu`}>Fix</Link></li>)}
            {over.slice(0, 6).map((c) => (
              <li key={c.item.id}><span className="dotc bad" /><b>{c.item.name}</b><span className="muted">{pct(c.fcPct)} at menu price {money(c.item.price)} · {money(c.plateCost)} plate · price for {t}%: {money(c.suggested)}</span><Link to={`${base}/recipes/${c.item.recipeId}`}>Recipe</Link></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
