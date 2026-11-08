import { Fragment, useState } from 'react'
import { menuCostCsv } from '../engine/outputs.ts'
import type { MenuItem, Modifier, Unit } from '../engine/types.ts'
import { UNIT_LABEL, UNITS } from '../engine/units.ts'
import { download, Empty, Icon, Link, money, NumField, pct, slug, toast } from '../ui.tsx'
import { uid } from '../actions.ts'
import { useP } from './ctx.ts'

export default function Menu() {
  const { data, update, costs, rec } = useP()
  const [open, setOpen] = useState<string | null>(null)
  const t = data.settings.targetFcPct
  const dishes = data.recipes.filter((r) => r.kind === 'dish')
  const setItem = (id: string, patch: Partial<MenuItem>, label = 'Edit menu item') => update((d) => ({ ...d, menu: d.menu.map((m) => (m.id === id ? { ...m, ...patch } : m)) }), label)
  const add = () => {
    const m: MenuItem = { id: uid('m'), name: 'New item', category: 'Mains', recipeId: dishes[0]?.id ?? '', price: 0, modifiers: [], aliases: [] }
    update((d) => ({ ...d, menu: [...d.menu, m] }), 'Add menu item')
    setOpen(m.id)
  }
  const remove = (m: MenuItem) => {
    update((d) => ({ ...d, menu: d.menu.filter((x) => x.id !== m.id) }), `Delete ${m.name}`)
    toast(`Removed ${m.name} from the menu`, { action: { label: 'Undo', run: () => update((d) => ({ ...d, menu: [...d.menu, m] }), 'Restore') } })
  }
  const cats = [...new Set(data.menu.map((m) => m.category))]

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1 className="h2">Menu</h1><p className="muted">{data.menu.length} items · target food cost {t}% · prices tax excluded</p></div>
        <div className="acts">
          <button className="btn btn-ghost btn-sm" onClick={() => download(`${slug(rec.name)}-menu-costing.csv`, menuCostCsv(data))} disabled={!data.menu.length}><Icon name="download" size={15} /> CSV</button>
          <button className="btn btn-primary btn-sm" onClick={add}><Icon name="plus" size={15} /> Add item</button>
        </div>
      </div>
      {data.menu.length === 0 ? (
        <Empty icon="sparkle" title="No menu items yet" actions={<><button className="btn btn-primary" onClick={add}>Add a menu item</button><Link to={`/app/${rec.id}/sales`} className="btn btn-secondary">Create from a sales export</Link></>}>
          Each item links to a dish recipe. Importing sales can create items from your POS names; you link recipes afterwards.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="tbl menu-tbl">
            <thead><tr><th>Item</th><th>Recipe</th><th className="r">Price</th><th className="r">Plate cost</th><th className="r">Food cost</th><th className="r">CM</th><th className="r">Price for {t}%</th><th /></tr></thead>
            <tbody>
              {cats.map((cat) => (
                <Fragment key={cat}>
                  <tr className="group"><td colSpan={8}>{cat}</td></tr>
                  {costs.filter((c) => c.item.category === cat).map((c) => {
                    const m = c.item
                    const isOpen = open === m.id
                    const off = c.fcPct > t
                    return (
                      <Fragment key={m.id}>
                        <tr className={isOpen ? 'open' : ''}>
                          <td>
                            <button className="expander" onClick={() => setOpen(isOpen ? null : m.id)} aria-expanded={isOpen} aria-label={`Details for ${m.name}`}><Icon name="chev" size={14} /></button>
                            <b>{m.name}</b>
                            {m.modifiers.length > 0 && <span className="tag">{m.modifiers.length} mod</span>}
                            {c.errors.length > 0 && <span className="err fine block">{c.errors[0]}</span>}
                          </td>
                          <td>
                            <select value={m.recipeId} onChange={(e) => setItem(m.id, { recipeId: e.target.value }, 'Link recipe')} aria-label={`Recipe for ${m.name}`}>
                              <option value="">— none —</option>
                              {dishes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                          </td>
                          <td className="r"><NumField value={m.price} onChange={(n) => setItem(m.id, { price: n }, `Price ${m.name}`)} prefix="$" label={`Price of ${m.name}`} min={0} width={100} /></td>
                          <td className="r num">{money(c.plateCost)}</td>
                          <td className="r num"><span className={`fc ${off ? 'bad' : 'good'}`}>{pct(c.fcPct)}</span>
                            <span className="fcbar" aria-hidden="true"><span style={{ width: `${Math.min(100, c.fcPct * 2)}%` }} className={off ? 'bad' : ''} /><i style={{ left: `${t * 2}%` }} /></span>
                          </td>
                          <td className="r num">{money(c.cm)}</td>
                          <td className="r num">
                            {Math.abs(c.suggested - m.price) >= 0.5 ? (
                              <button className="linkish" onClick={() => setItem(m.id, { price: c.suggested }, `Reprice ${m.name}`)} title="Apply this price">{money(c.suggested)}</button>
                            ) : <span className="muted">{money(c.suggested)}</span>}
                          </td>
                          <td className="r"><button className="icon-btn" aria-label={`Remove ${m.name}`} onClick={() => remove(m)}><Icon name="trash" size={15} /></button></td>
                        </tr>
                        {isOpen && (
                          <tr className="detail"><td colSpan={8}><ItemDetail item={m} /></td></tr>
                        )}
                      </Fragment>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ItemDetail({ item }: { item: MenuItem }) {
  const { data, update } = useP()
  const set = (patch: Partial<MenuItem>, label = 'Edit menu item') => update((d) => ({ ...d, menu: d.menu.map((m) => (m.id === item.id ? { ...m, ...patch } : m)) }), label)
  const setMod = (id: string, patch: Partial<Modifier>) => set({ modifiers: item.modifiers.map((m) => (m.id === id ? { ...m, ...patch } : m)) }, 'Edit modifier')
  const [alias, setAlias] = useState('')
  const opts = [...data.recipes.filter((r) => r.kind === 'sub').map((r) => ({ v: `rec:${r.id}`, n: `${r.name} (sub)` })), ...data.ingredients.map((i) => ({ v: `ing:${i.id}`, n: i.name }))]
  return (
    <div className="itemdetail">
      <div className="fgrid">
        <label className="field"><span>Name on menu</span><input value={item.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="field"><span>Category</span><input value={item.category} onChange={(e) => set({ category: e.target.value })} /></label>
        <div className="field span-2"><span>POS names (aliases used to match sales exports)</span>
          <div className="aliases">
            {item.aliases.map((a) => <span key={a} className="chip on">{a}<button aria-label={`Remove alias ${a}`} onClick={() => set({ aliases: item.aliases.filter((x) => x !== a) })}>×</button></span>)}
            <form onSubmit={(e) => { e.preventDefault(); if (alias.trim()) { set({ aliases: [...new Set([...item.aliases, alias.trim()])] }); setAlias('') } }}>
              <input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Add POS name" aria-label="Add POS name" />
            </form>
          </div>
        </div>
      </div>
      <h4>Modifiers</h4>
      {item.modifiers.length === 0 && <p className="muted fine">Add-ons and swaps. Cost and price are weighted by how often guests choose them.</p>}
      {item.modifiers.map((m) => (
        <div key={m.id} className="modrow">
          <input value={m.name} onChange={(e) => setMod(m.id, { name: e.target.value })} aria-label="Modifier name" />
          <NumField value={m.price} onChange={(n) => setMod(m.id, { price: n })} prefix="+$" label="Modifier price" width={100} />
          <NumField value={m.attachPct} onChange={(n) => setMod(m.id, { attachPct: Math.max(0, Math.min(100, n)) })} suffix="% attach" label="Attach rate" width={130} />
          {m.lines.map((l, i) => (
            <span key={i} className="modline">
              <NumField value={l.qty} onChange={(n) => setMod(m.id, { lines: m.lines.map((x, k) => (k === i ? { ...x, qty: n } : x)) })} label="Quantity" width={80} />
              <select value={l.unit} onChange={(e) => setMod(m.id, { lines: m.lines.map((x, k) => (k === i ? { ...x, unit: e.target.value as Unit } : x)) })} aria-label="Unit">{UNITS.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}</select>
              <select value={`${l.ref.kind}:${l.ref.id}`} onChange={(e) => { const [kind, id] = e.target.value.split(':') as ['ing' | 'rec', string]; setMod(m.id, { lines: m.lines.map((x, k) => (k === i ? { ...x, ref: { kind, id } } : x)) }) }} aria-label="Component">
                {opts.map((o) => <option key={o.v} value={o.v}>{o.n}</option>)}
              </select>
            </span>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => opts[0] && setMod(m.id, { lines: [...m.lines, { ref: { kind: opts[0].v.startsWith('rec') ? 'rec' : 'ing', id: opts[0].v.split(':')[1] }, qty: 10, unit: 'g' }] })}>+ component</button>
          <button className="icon-btn" aria-label="Remove modifier" onClick={() => set({ modifiers: item.modifiers.filter((x) => x.id !== m.id) }, 'Remove modifier')}><Icon name="x" size={15} /></button>
        </div>
      ))}
      <button className="btn btn-secondary btn-sm" onClick={() => set({ modifiers: [...item.modifiers, { id: uid('mod'), name: 'New modifier', price: 0, attachPct: 20, lines: [] }] }, 'Add modifier')}><Icon name="plus" size={14} /> Add modifier</button>
    </div>
  )
}
