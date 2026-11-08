import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkline } from '../charts.tsx'
import { costPerPackUnit, usedBy } from '../engine/costing.ts'
import { ingredientsCsv } from '../engine/outputs.ts'
import type { Ingredient, Unit } from '../engine/types.ts'
import { convert, dimOf, UNIT_LABEL, UNITS } from '../engine/units.ts'
import { download, Empty, Icon, Link, Modal, money, NumField, slug, toast } from '../ui.tsx'
import { uid } from '../actions.ts'
import { useP } from './ctx.ts'

export function normCost(i: Ingredient): [number, string] {
  const d = dimOf(i.packUnit)
  const to: Unit = d === 'weight' ? 'kg' : d === 'volume' ? 'l' : 'ea'
  const per = convert(1, to, i.packUnit, i)
  return per === null ? [costPerPackUnit(i), UNIT_LABEL[i.packUnit]] : [costPerPackUnit(i) * per, UNIT_LABEL[to]]
}

export function useSlashFocus() {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) { e.preventDefault(); ref.current?.focus() }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  return ref
}

const BLANK = (): Ingredient => ({ id: uid('ing'), name: '', category: 'Produce', supplier: '', purchaseUnit: 'case', packQty: 1, packUnit: 'kg', price: 0, yieldPct: 100, history: [] })

export function IngredientEditor({ value, onSave, onCancel, onDelete }: { value: Ingredient; onSave: (i: Ingredient) => void; onCancel: () => void; onDelete?: () => void }) {
  const [i, set] = useState(value)
  const f = <K extends keyof Ingredient>(k: K, v: Ingredient[K]) => set((x) => ({ ...x, [k]: v }))
  const [c, u] = normCost(i)
  const needsDensity = dimOf(i.packUnit) !== 'count'
  return (
    <form className="editor" onSubmit={(e) => { e.preventDefault(); if (!i.name.trim()) { toast('Give the ingredient a name', { kind: 'err' }); return } onSave({ ...i, name: i.name.trim() }) }}>
      <div className="fgrid">
        <label className="field span-2"><span>Name</span><input autoFocus value={i.name} onChange={(e) => f('name', e.target.value)} placeholder="e.g. Hanger steak" /></label>
        <label className="field"><span>Category</span><input value={i.category} onChange={(e) => f('category', e.target.value)} list="ing-cats" /></label>
        <label className="field"><span>Supplier</span><input value={i.supplier} onChange={(e) => f('supplier', e.target.value)} /></label>
        <label className="field"><span>Supplier item code</span><input value={i.code ?? ''} onChange={(e) => f('code', e.target.value || undefined)} placeholder="used to match price lists" /></label>
        <label className="field"><span>Purchase unit</span><input value={i.purchaseUnit} onChange={(e) => f('purchaseUnit', e.target.value)} placeholder="case, bag, tin" /></label>
        <div className="field"><span>Pack contains</span>
          <div className="inline">
            <NumField value={i.packQty} onChange={(n) => f('packQty', n)} label="Pack quantity" min={0} />
            <select value={i.packUnit} onChange={(e) => f('packUnit', e.target.value as Unit)} aria-label="Pack unit">
              {UNITS.filter((x) => x !== 'portion').map((x) => <option key={x} value={x}>{UNIT_LABEL[x]}</option>)}
            </select>
          </div>
        </div>
        <div className="field"><span>Price per {i.purchaseUnit || 'unit'} (tax excl.)</span><NumField value={i.price} onChange={(n) => f('price', n)} prefix="$" label="Price" min={0} /></div>
        <div className="field"><span>Usable yield after trim</span><NumField value={i.yieldPct} onChange={(n) => f('yieldPct', Math.min(100, Math.max(1, n)))} suffix="%" label="Yield percent" min={1} /></div>
        <div className="field"><span>Density {needsDensity ? '' : '(optional)'}</span><NumField value={i.densityGPerMl ?? 0} onChange={(n) => f('densityGPerMl', n > 0 ? n : undefined)} suffix="g/ml" label="Density grams per millilitre" min={0} /></div>
        <div className="field"><span>Weight of one each</span><NumField value={i.eachG ?? 0} onChange={(n) => f('eachG', n > 0 ? n : undefined)} suffix="g" label="Grams per each" min={0} /></div>
      </div>
      <p className="calc">
        As purchased <b>{money(c, 2)}/{u}</b> · edible portion <b>{money(c / (i.yieldPct / 100), 2)}/{u}</b>
        <span className="muted"> · Density lets recipes use cups for a weighed item; each-weight lets “2 lemons” cost a by-the-kg item.</span>
      </p>
      {i.history.length > 1 && (
        <div className="hist">
          <h4>Price history</h4>
          <Sparkline values={i.history.map((h) => h.price)} width={260} height={44} />
          <ul>{[...i.history].reverse().slice(0, 6).map((h, k) => <li key={k}><span>{h.date || '—'}</span><b>{money(h.price)}</b><span className="muted">{h.source}</span></li>)}</ul>
        </div>
      )}
      <div className="modal-acts">
        {onDelete && <button type="button" className="btn btn-ghost danger mr-auto" onClick={onDelete}><Icon name="trash" size={15} /> Delete</button>}
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary">Save</button>
      </div>
    </form>
  )
}

export default function Ingredients() {
  const { data, update, rec } = useP()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [edit, setEdit] = useState<Ingredient | null>(null)
  const search = useSlashFocus()
  const cats = useMemo(() => [...new Set(data.ingredients.map((i) => i.category).filter(Boolean))].sort(), [data.ingredients])
  const rows = data.ingredients.filter((i) => (!cat || i.category === cat) && (!q || `${i.name} ${i.supplier} ${i.code ?? ''}`.toLowerCase().includes(q.toLowerCase())))
  const isNew = edit && !data.ingredients.some((i) => i.id === edit.id)

  const save = (i: Ingredient) => {
    const prev = data.ingredients.find((x) => x.id === i.id)
    if (prev && prev.price !== i.price) i = { ...i, history: [...(i.history.length ? i.history : [{ date: '', price: prev.price, source: 'initial' }]), { date: new Date().toISOString().slice(0, 10), price: i.price, source: 'Edited by hand' }] }
    update((d) => ({ ...d, ingredients: prev ? d.ingredients.map((x) => (x.id === i.id ? i : x)) : [...d.ingredients, i] }), prev ? `Edit ${i.name}` : `Add ${i.name}`)
    setEdit(null)
    toast(prev ? 'Saved' : `Added ${i.name}`, { kind: 'ok' })
  }
  const remove = (i: Ingredient) => {
    const users = usedBy(data.recipes, { kind: 'ing', id: i.id })
    update((d) => ({ ...d, ingredients: d.ingredients.filter((x) => x.id !== i.id) }), `Delete ${i.name}`)
    setEdit(null)
    toast(users.length ? `Deleted ${i.name}; ${users.length} recipe${users.length > 1 ? 's' : ''} now show a missing line` : `Deleted ${i.name}`, { action: { label: 'Undo', run: () => update((d) => ({ ...d, ingredients: [...d.ingredients, i] }), 'Restore') } })
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1 className="h2">Ingredients</h1><p className="muted">{data.ingredients.length} items · prices are tax excluded, per purchase unit</p></div>
        <div className="acts">
          <button className="btn btn-ghost btn-sm" onClick={() => download(`${slug(rec.name)}-ingredients.csv`, ingredientsCsv(data))} disabled={!data.ingredients.length}><Icon name="download" size={15} /> CSV</button>
          <Link to={`/app/${rec.id}/prices`} className="btn btn-secondary btn-sm"><Icon name="upload" size={15} /> Import price list</Link>
          <button className="btn btn-primary btn-sm" onClick={() => setEdit(BLANK())}><Icon name="plus" size={15} /> Add ingredient</button>
        </div>
      </div>
      {data.ingredients.length === 0 ? (
        <Empty icon="book" title="No ingredients yet" actions={<><Link to={`/app/${rec.id}/prices`} className="btn btn-primary">Import a supplier price list</Link><button className="btn btn-secondary" onClick={() => setEdit(BLANK())}>Add one by hand</button></>}>
          A price list or invoice CSV creates ingredients in one go, with codes so next month’s import updates prices automatically.
        </Empty>
      ) : (
        <>
          <div className="filters">
            <label className="search"><Icon name="search" size={16} /><input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, supplier, code" aria-label="Search ingredients" /><kbd>/</kbd></label>
            <div className="chips" role="group" aria-label="Category">
              <button className={!cat ? 'chip on' : 'chip'} onClick={() => setCat('')}>All</button>
              {cats.map((c) => <button key={c} className={cat === c ? 'chip on' : 'chip'} onClick={() => setCat(c)}>{c}</button>)}
            </div>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Ingredient</th><th>Supplier</th><th>Pack</th><th className="r">Price</th><th className="r">Unit cost</th><th className="r">Yield</th><th>Trend</th><th className="r">Used in</th></tr></thead>
              <tbody>
                {rows.map((i) => {
                  const [c, u] = normCost(i)
                  const n = usedBy(data.recipes, { kind: 'ing', id: i.id }).length
                  const h = i.history.map((x) => x.price)
                  const ch = h.length > 1 ? ((h[h.length - 1] - h[h.length - 2]) / h[h.length - 2]) * 100 : 0
                  return (
                    <tr key={i.id} className="clickable" onClick={() => setEdit(i)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEdit(i)}>
                      <td><b>{i.name}</b><div className="muted fine">{i.category}{i.code ? ` · ${i.code}` : ''}</div></td>
                      <td>{i.supplier || <span className="muted">—</span>}</td>
                      <td>{i.packQty} {UNIT_LABEL[i.packUnit]} / {i.purchaseUnit}</td>
                      <td className="r num">{money(i.price)}</td>
                      <td className="r num">{money(c)}<span className="muted">/{u}</span></td>
                      <td className="r num">{i.yieldPct < 100 ? `${i.yieldPct}%` : <span className="muted">100%</span>}</td>
                      <td><span className="trend"><Sparkline values={h} width={64} height={22} />{Math.abs(ch) >= 0.5 && <small className={ch > 0 ? 'bad' : 'good'}>{ch > 0 ? '+' : ''}{ch.toFixed(1)}%</small>}</span></td>
                      <td className="r">{n || <span className="muted">0</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length === 0 && <p className="muted pad">No ingredients match “{q}”.</p>}
          </div>
        </>
      )}
      <datalist id="ing-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={isNew ? 'Add ingredient' : edit?.name ?? ''} wide>
        {edit && <IngredientEditor value={edit} onSave={save} onCancel={() => setEdit(null)} onDelete={isNew ? undefined : () => remove(edit)} />}
      </Modal>
    </div>
  )
}
