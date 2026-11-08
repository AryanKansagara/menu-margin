import { useMemo, useState } from 'react'
import { CostBar } from '../charts.tsx'
import { costRecipe, CycleError, makeBook, usedBy, wouldCycle, type RecipeCost } from '../engine/costing.ts'
import type { Recipe, RecipeLine, Unit } from '../engine/types.ts'
import { dimOf, perUnit, UNIT_LABEL, UNITS } from '../engine/units.ts'
import { Empty, Icon, Link, money, navigate, NumField, pct, toast } from '../ui.tsx'
import { uid } from '../actions.ts'
import { useP } from './ctx.ts'
import { useSlashFocus } from './Ingredients.tsx'

function safeCost(book: ReturnType<typeof makeBook>, id: string): RecipeCost | CycleError {
  try { return costRecipe(book, id) } catch (e) { if (e instanceof CycleError) return e; throw e }
}

function unitsFor(kind: 'ing' | 'rec', target?: { packUnit?: Unit; yieldUnit?: Unit; portions?: number; densityGPerMl?: number; eachG?: number }): Unit[] {
  const all: Unit[] = UNITS.filter((u) => u !== 'portion')
  if (!target) return all
  const base = kind === 'ing' ? target.packUnit! : target.yieldUnit!
  const ok = all.filter((u) => {
    const d = dimOf(u)
    if (base === 'portion') return false
    if (d === dimOf(base)) return true
    if ((d === 'weight' || d === 'volume') && (dimOf(base) === 'weight' || dimOf(base) === 'volume')) return !!target.densityGPerMl
    if (d === 'count' || dimOf(base) === 'count') return !!target.eachG
    return false
  })
  if (kind === 'rec' && (target.portions ?? 0) > 0) ok.push('portion')
  return ok.length ? ok : all
}

export default function Recipes({ sub }: { sub?: string }) {
  const { data, update, rec } = useP()
  const [q, setQ] = useState('')
  const search = useSlashFocus()
  const book = useMemo(() => makeBook(data), [data])
  const base = `/app/${rec.id}/recipes`
  const selected = data.recipes.find((r) => r.id === sub) ?? null
  const list = data.recipes.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()))

  const create = (kind: 'dish' | 'sub') => {
    const r: Recipe = kind === 'dish'
      ? { id: uid('rec'), name: 'New dish', kind, yieldQty: 1, yieldUnit: 'portion', portions: 1, lines: [] }
      : { id: uid('rec'), name: 'New sub-recipe', kind, yieldQty: 1, yieldUnit: 'l', portions: 0, lines: [] }
    update((d) => ({ ...d, recipes: [...d.recipes, r] }), `Add ${r.name}`)
    navigate(`${base}/${r.id}`)
  }

  return (
    <div className="split">
      <aside className="split-list">
        <div className="split-head">
          <label className="search"><Icon name="search" size={16} /><input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes" aria-label="Search recipes" /><kbd>/</kbd></label>
          <div className="inline"><button className="btn btn-primary btn-sm" onClick={() => create('dish')}><Icon name="plus" size={14} /> Dish</button><button className="btn btn-secondary btn-sm" onClick={() => create('sub')}><Icon name="plus" size={14} /> Sub-recipe</button></div>
        </div>
        {(['sub', 'dish'] as const).map((k) => {
          const items = list.filter((r) => r.kind === k)
          return (
            <div key={k} className="rlist">
              <h4>{k === 'sub' ? 'Sub-recipes' : 'Dishes'} <span className="muted">{items.length}</span></h4>
              {items.map((r) => {
                const c = safeCost(book, r.id)
                return (
                  <Link key={r.id} to={`${base}/${r.id}`} className={`ritem ${r.id === sub ? 'on' : ''}`}>
                    <span>{r.name}</span>
                    <span className="num muted">{c instanceof CycleError ? '⟳' : r.kind === 'dish' ? money(c.unitCost) : (([v, u]) => `${money(v)}/${UNIT_LABEL[u]}`)(perUnit(c.unitCost, r.yieldUnit))}</span>
                  </Link>
                )
              })}
            </div>
          )
        })}
      </aside>
      <section className="split-detail">
        {selected ? <RecipeEditor key={selected.id} r={selected} /> : data.recipes.length ? (
          <Empty icon="edit" title="Pick a recipe">Sub-recipes (sauces, stocks, doughs) are costed per yield unit and can be nested inside each other and inside dishes.</Empty>
        ) : (
          <Empty icon="edit" title="No recipes yet" actions={<><button className="btn btn-primary" onClick={() => create('sub')}>Start with a sub-recipe</button><button className="btn btn-secondary" onClick={() => create('dish')}>Or a dish</button></>}>
            {data.ingredients.length ? 'Build sauces and doughs first, then dishes that use them.' : 'Add ingredients first so recipe lines have something to cost.'}
          </Empty>
        )}
      </section>
    </div>
  )
}

function RecipeEditor({ r }: { r: Recipe }) {
  const { data, update, rec } = useP()
  const book = useMemo(() => makeBook(data), [data])
  const cost = safeCost(book, r.id)
  const set = (patch: Partial<Recipe>, label = `Edit ${r.name}`) => update((d) => ({ ...d, recipes: d.recipes.map((x) => (x.id === r.id ? { ...x, ...patch } : x)) }), label)
  const setLine = (i: number, patch: Partial<RecipeLine>) => set({ lines: r.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) })
  const users = usedBy(data.recipes, { kind: 'rec', id: r.id })
  const onMenu = data.menu.filter((m) => m.recipeId === r.id)
  const [pick, setPick] = useState('')

  const addLine = (val: string) => {
    if (!val) return
    const [kind, id] = val.split(':') as ['ing' | 'rec', string]
    if (kind === 'rec' && wouldCycle(data.recipes, r.id, id)) { toast('That would make a recipe contain itself', { kind: 'err' }); return }
    const target = kind === 'ing' ? data.ingredients.find((i) => i.id === id) : data.recipes.find((x) => x.id === id)
    const units = unitsFor(kind, target as never)
    const dim = units[0] ? dimOf(units[0]) : 'weight'
    const unit: Unit = units.includes(dim === 'volume' ? 'ml' : dim === 'count' ? 'ea' : 'g') ? (dim === 'volume' ? 'ml' : dim === 'count' ? 'ea' : 'g') : units[0]
    set({ lines: [...r.lines, { ref: { kind, id }, qty: unit === 'ea' ? 1 : 100, unit }] }, 'Add line')
    setPick('')
  }
  const del = () => {
    const snapshot = r
    update((d) => ({ ...d, recipes: d.recipes.filter((x) => x.id !== r.id) }), `Delete ${r.name}`)
    navigate(`/app/${rec.id}/recipes`)
    toast(`Deleted ${r.name}${users.length || onMenu.length ? ` (was used by ${users.length + onMenu.length})` : ''}`, { action: { label: 'Undo', run: () => update((d) => ({ ...d, recipes: [...d.recipes, snapshot] }), 'Restore') } })
  }
  const dup = () => {
    const c = { ...structuredClone(r), id: uid('rec'), name: `${r.name} (copy)` }
    update((d) => ({ ...d, recipes: [...d.recipes, c] }), 'Duplicate')
    navigate(`/app/${rec.id}/recipes/${c.id}`)
  }

  const isCycle = cost instanceof CycleError
  const total = isCycle ? 0 : cost.batchCost
  const target = data.settings.targetFcPct
  const linkedPrice = onMenu[0]?.price
  return (
    <div className="stack">
      <div className="redit-head">
        <input className="title-input" value={r.name} onChange={(e) => set({ name: e.target.value })} aria-label="Recipe name" />
        <div className="acts">
          <Link to={`/app/${rec.id}/outputs/cards?recipe=${r.id}`} className="btn btn-ghost btn-sm"><Icon name="print" size={15} /> Card</Link>
          <button className="btn btn-ghost btn-sm" onClick={dup}><Icon name="copy" size={15} /> Duplicate</button>
          <button className="btn btn-ghost btn-sm danger" onClick={del}><Icon name="trash" size={15} /> Delete</button>
        </div>
      </div>
      {isCycle && <div className="notice notice-err"><Icon name="alert" /> {cost.message}. Remove one of the sub-recipe lines to fix it.</div>}

      <div className="yieldbar">
        <div className="seg">
          <button className={r.kind === 'dish' ? 'on' : ''} onClick={() => set({ kind: 'dish', yieldUnit: 'portion', yieldQty: r.portions || 1, portions: r.portions || 1 })}>Dish</button>
          <button className={r.kind === 'sub' ? 'on' : ''} onClick={() => set({ kind: 'sub', yieldUnit: r.yieldUnit === 'portion' ? 'l' : r.yieldUnit, portions: 0 })}>Sub-recipe</button>
        </div>
        {r.kind === 'dish' ? (
          <label className="field-inline">Batch makes <NumField value={r.portions} onChange={(n) => set({ portions: Math.max(1, n), yieldQty: Math.max(1, n) })} label="Portions per batch" min={1} width={90} /> portions</label>
        ) : (
          <>
            <label className="field-inline">Batch yields <NumField value={r.yieldQty} onChange={(n) => set({ yieldQty: n })} label="Batch yield" min={0} width={90} />
              <select value={r.yieldUnit} onChange={(e) => set({ yieldUnit: e.target.value as Unit })} aria-label="Yield unit">{UNITS.filter((u) => u !== 'portion').map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}</select>
            </label>
            <label className="field-inline">Density <NumField value={r.densityGPerMl ?? 0} onChange={(n) => set({ densityGPerMl: n > 0 ? n : undefined })} label="Density" suffix="g/ml" width={110} /></label>
          </>
        )}
      </div>

      <div className="table-wrap">
        <table className="tbl lines">
          <thead><tr><th>Component</th><th className="r">Qty</th><th>Unit</th><th className="r">Cost</th><th className="r">Share</th><th /></tr></thead>
          <tbody>
            {r.lines.map((l, i) => {
              const target = l.ref.kind === 'ing' ? data.ingredients.find((x) => x.id === l.ref.id) : data.recipes.find((x) => x.id === l.ref.id)
              const lc = isCycle ? undefined : cost.lines[i]
              const units = unitsFor(l.ref.kind, target as never)
              return (
                <tr key={i} className={lc?.error ? 'row-err' : ''}>
                  <td>
                    {l.ref.kind === 'rec' && target ? <Link to={`/app/${rec.id}/recipes/${target.id}`} className="sublink"><span className="tag">sub</span> {target.name}</Link> : <b>{target?.name ?? 'Missing'}</b>}
                    {lc?.error && <div className="err fine">{lc.error}</div>}
                  </td>
                  <td className="r"><NumField value={l.qty} onChange={(n) => setLine(i, { qty: n })} label={`Quantity of ${target?.name}`} min={0} width={90} /></td>
                  <td><select value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value as Unit })} aria-label="Unit">{[...new Set([...units, l.unit])].map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}</select></td>
                  <td className="r num">{lc ? money(lc.cost) : '—'}</td>
                  <td className="r num muted">{lc && total > 0 ? pct((lc.cost / total) * 100, 0) : ''}</td>
                  <td className="r"><button className="icon-btn" aria-label="Remove line" onClick={() => set({ lines: r.lines.filter((_, k) => k !== i) }, 'Remove line')}><Icon name="x" size={15} /></button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="addline">
          <select value={pick} onChange={(e) => { setPick(e.target.value); addLine(e.target.value) }} aria-label="Add ingredient or sub-recipe">
            <option value="">+ Add ingredient or sub-recipe…</option>
            <optgroup label="Sub-recipes">
              {data.recipes.filter((x) => x.kind === 'sub' && x.id !== r.id).map((x) => <option key={x.id} value={`rec:${x.id}`} disabled={wouldCycle(data.recipes, r.id, x.id)}>{x.name}{wouldCycle(data.recipes, r.id, x.id) ? ' (would loop)' : ''}</option>)}
            </optgroup>
            <optgroup label="Ingredients">
              {[...data.ingredients].sort((a, b) => a.name.localeCompare(b.name)).map((x) => <option key={x.id} value={`ing:${x.id}`}>{x.name}</option>)}
            </optgroup>
          </select>
          <span className="muted fine">Quantities are edible portion; trim loss is added from each ingredient’s yield.</span>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>Cost</h2></div>
          <div className="costsum">
            <div><span>Batch</span><b>{money(total)}</b></div>
            {r.kind === 'dish'
              ? <div><span>Per portion</span><b>{isCycle ? '—' : money(cost.unitCost)}</b></div>
              : <div><span>Per {UNIT_LABEL[perUnit(1, r.yieldUnit)[1]]}</span><b>{isCycle ? '—' : money(perUnit(cost.unitCost, r.yieldUnit)[0])}</b></div>}
            {r.kind === 'dish' && !isCycle && <div><span>Price at {target}%</span><b>{money(Math.ceil((cost.unitCost / (target / 100)) * 2) / 2)}</b></div>}
            {r.kind === 'dish' && linkedPrice && !isCycle && <div><span>Food cost at {money(linkedPrice)}</span><b className={cost.unitCost / linkedPrice * 100 > target ? 'bad' : 'good'}>{pct((cost.unitCost / linkedPrice) * 100)}</b></div>}
          </div>
          {!isCycle && total > 0 && <CostBar parts={[...cost.leaves].map(([id, v]) => ({ name: data.ingredients.find((x) => x.id === id)?.name ?? id, value: v }))} total={total} />}
        </section>
        <section className="card">
          <div className="card-head"><h2>Method</h2></div>
          <textarea className="method" value={r.method ?? ''} onChange={(e) => set({ method: e.target.value })} placeholder="Steps, holding temps, plating notes. Printed on the recipe card." rows={6} />
          {(users.length > 0 || onMenu.length > 0) && (
            <p className="muted fine">Used by: {[...onMenu.map((m) => `${m.name} (menu)`), ...users.map((u) => u.name)].join(', ')}</p>
          )}
        </section>
      </div>
    </div>
  )
}
