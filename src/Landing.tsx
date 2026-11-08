import { useMemo, useState } from 'react'
import { costMenu, makeBook, costItem } from './engine/costing.ts'
import { engInputs, engineer, QUADRANT, respond } from './engine/engineering.ts'
import { sampleProject } from './engine/sample.ts'
import { Matrix } from './charts.tsx'
import { createSample } from './actions.ts'
import { Footer, Header, Icon, Link, money, pct, QPill } from './ui.tsx'

const BASE = sampleProject()
const HANGER = BASE.ingredients.find((i) => i.id === 'hanger')!
const BASE_KG = HANGER.price / HANGER.packQty
const STEAK = 'm-steak'
const SEG_COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)']

function useHero(perKg: number, menuPrice: number) {
  return useMemo(() => {
    const data = {
      ...BASE,
      ingredients: BASE.ingredients.map((i) => (i.id === 'hanger' ? { ...i, price: perKg * i.packQty } : i)),
      menu: BASE.menu.map((m) => (m.id === STEAK ? { ...m, price: menuPrice } : m)),
    }
    const costs = costMenu(data)
    const inputs = engInputs(costs, data.sales[0], false).map((i) =>
      i.id === STEAK ? { ...i, qty: respond(i.qty, 29, menuPrice, data.settings.elasticity) } : i)
    const eng = engineer(inputs, { targetFcPct: 30 })
    const book = makeBook(data)
    const c = costItem(book, { ...data.menu.find((m) => m.id === STEAK)!, modifiers: [] }, 30)
    const names = new Map(data.ingredients.map((i) => [i.id, i.name]))
    const parts = [...c.leaves].map(([id, v]) => ({ id, name: names.get(id)!, value: v })).sort((a, b) => b.value - a.value)
    const top = parts.slice(0, 4)
    const other = parts.slice(4).reduce((s, p) => s + p.value, 0)
    return { eng, row: eng.rows.find((r) => r.id === STEAK)!, plate: c.plateCost, segs: [...top, { id: 'other', name: 'Everything else', value: other }], suggested: c.suggested }
  }, [perKg, menuPrice])
}

function Plate({ segs, total, fc }: { segs: { id: string; name: string; value: number }[]; total: number; fc: number }) {
  const r = 132
  const C = 2 * Math.PI * r
  let acc = 0
  const gap = 4
  return (
    <svg className="plate" viewBox="0 0 320 320" role="img" aria-label={`Plate cost ${money(total)}, food cost ${pct(fc)}`}>
      <defs>
        <radialGradient id="pl-g" cx="45%" cy="40%" r="65%">
          <stop offset="0" stopColor="var(--plate-1)" />
          <stop offset="1" stopColor="var(--plate-2)" />
        </radialGradient>
        <linearGradient id="steak-g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#8a2a1c" />
          <stop offset="0.55" stopColor="#5e1a12" />
          <stop offset="1" stopColor="#3b0f0a" />
        </linearGradient>
        <linearGradient id="frite-g" x1="0" x2="1">
          <stop offset="0" stopColor="#f3c25a" />
          <stop offset="1" stopColor="#d9962a" />
        </linearGradient>
      </defs>
      <circle cx="160" cy="160" r={r} className="ring-track" />
      {segs.map((s, i) => {
        const len = Math.max(0, (s.value / (total || 1)) * C - gap)
        const off = -acc
        acc += (s.value / (total || 1)) * C
        return <circle key={s.id} cx="160" cy="160" r={r} className="ring-seg" stroke={SEG_COLORS[i]} strokeDasharray={`${len} ${C}`} strokeDashoffset={off} transform="rotate(-90 160 160)" />
      })}
      <circle cx="160" cy="160" r="112" fill="url(#pl-g)" className="plate-rim" />
      <circle cx="160" cy="160" r="84" className="plate-well" />
      {/* steak slices */}
      <g transform="translate(120 150) rotate(-18)">
        {[0, 1, 2, 3, 4].map((k) => (
          <g key={k} transform={`translate(${k * 15} ${k * 2})`}>
            <rect x="-7" y="-34" width="18" height="62" rx="7" fill="url(#steak-g)" />
            <rect x="-4" y="-30" width="11" height="54" rx="5" fill="#b8574a" opacity="0.55" />
          </g>
        ))}
      </g>
      {/* frites */}
      <g transform="translate(196 196)">
        {[[-30, -8, -30], [-18, -14, -12], [-6, -4, 8], [6, -16, 22], [-24, 6, -50], [-8, 10, 35], [10, 2, -8], [16, -6, 60]].map(([x, y, a], k) => (
          <rect key={k} x={x} y={y} width="42" height="9" rx="4.5" fill="url(#frite-g)" transform={`rotate(${a} ${x + 21} ${y + 4})`} />
        ))}
      </g>
      {/* sauce + greens */}
      <circle cx="198" cy="118" r="17" fill="#c9a27a" />
      <circle cx="198" cy="118" r="12" fill="#b88a5c" />
      <g fill="#5d8a3c">
        <ellipse cx="118" cy="206" rx="13" ry="6" transform="rotate(-30 118 206)" />
        <ellipse cx="130" cy="214" rx="11" ry="5" transform="rotate(20 130 214)" fill="#77a64e" />
        <ellipse cx="108" cy="218" rx="10" ry="5" transform="rotate(60 108 218)" fill="#4a7230" />
      </g>
    </svg>
  )
}

function Hero() {
  const [perKg, setPerKg] = useState(Math.round(BASE_KG * 100) / 100)
  const [price, setPrice] = useState(29)
  const h = useHero(perKg, price)
  const base = useHero(Math.round(BASE_KG * 100) / 100, 29)
  const fc = (h.plate / price) * 100
  const over = fc > 30
  return (
    <section className="hero">
      <div className="hero-glow" aria-hidden="true" />
      <div className="hero-in">
        <div className="hero-copy">
          <p className="preheader">Recipe costing · Menu engineering</p>
          <h1>Know what every plate costs before the invoice tells you.</h1>
          <p className="hero-lede">
            Menu Margin turns your ingredient prices, recipes and POS item sales into plate cost, food-cost %, and a
            Stars-to-Dogs menu matrix with a concrete next step for every dish. Built for owners and chefs who run it on a spreadsheet today.
          </p>
          <div className="hero-ctas">
            <button className="btn btn-primary btn-lg" onClick={() => createSample()}>Try the sample bistro</button>
            <Link to="/app?import=1" className="btn btn-inverse btn-lg">Import your data</Link>
          </div>
          <p className="hero-fine">Free. Works offline in your browser. No account needed.</p>
        </div>

        <div className="hero-demo" aria-label="Live demo: drag the hanger steak price">
          <div className="demo-card">
            <div className="demo-head">
              <div>
                <span className="demo-kicker">Steak frites · sample bistro</span>
                <strong className="demo-title">Plate cost {money(h.plate)}</strong>
              </div>
              <span className={`demo-fc ${over ? 'is-over' : ''}`}>{pct(fc)} <small>food cost</small></span>
            </div>
            <div className="demo-body">
              <Plate segs={h.segs} total={h.plate} fc={fc} />
              <ul className="demo-legend">
                {h.segs.map((s, i) => (
                  <li key={s.id}><i style={{ background: SEG_COLORS[i] }} /><span>{s.name}</span><b>{money(s.value)}</b></li>
                ))}
              </ul>
            </div>
            <label className="demo-slider">
              <span className="ds-row"><span>Hanger steak, as purchased</span><b>{money(perKg)}/kg</b></span>
              <input type="range" min={18} max={58} step={0.1} value={perKg} onChange={(e) => setPerKg(+e.target.value)} aria-label="Hanger steak price per kilogram" style={{ ['--p' as string]: `${((perKg - 18) / 40) * 100}%` }} />
              <span className="ds-scale"><span>$18</span><span>supplier quote today {money(BASE_KG)}</span><span>$58</span></span>
            </label>
            <label className="demo-slider">
              <span className="ds-row"><span>Menu price</span><b>{money(price)}</b></span>
              <input type="range" min={22} max={38} step={0.5} value={price} onChange={(e) => setPrice(+e.target.value)} aria-label="Menu price" style={{ ['--p' as string]: `${((price - 22) / 16) * 100}%` }} />
            </label>
            <div className="demo-stats">
              <div><span>Contribution margin</span><b>{money(h.row.cm)}</b></div>
              <div><span>Price at 30% target</span><b>{money(h.suggested)}</b></div>
              <div><span>Class</span><b><QPill q={h.row.quadrant} /></b></div>
            </div>
          </div>
          <div className="demo-matrix">
            <div className="demo-mhead"><span className="demo-kicker">Menu engineering matrix</span><span className="demo-sub">18 dishes · October sales</span></div>
            <Matrix rows={h.eng.rows} avgCm={h.eng.avgCm} popThreshold={h.eng.popThreshold} highlight={STEAK}
              ghost={{ x: base.row.mixPct, y: base.row.cm }} labels="highlight" compact width={340} height={330}
              domain={{ xMax: 16, yMin: 2, yMax: 26 }} />
            <p className="demo-caption">
              <b>{QUADRANT[h.row.quadrant].label}:</b> {h.row.action}. <span className="muted">Same engine as the app: 18 dishes, one month of sales.</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

const EVIDENCE = [
  { k: 'Cook forums', t: 'Ask a line-cook community what they use for menu costing and the replies split two ways: a paid back-office platform, or a spreadsheet someone built years ago.' },
  { k: 'Spreadsheet forums', t: 'A steady stream of posts asks how to make a food-cost sheet update itself when supplier prices change, and how to roll sauces into dishes without breaking formulas.' },
  { k: 'POS vendors', t: 'Lightspeed’s 2026 AI launch points at menu performance and optimization. Advice like that is only as good as the plate costs underneath it.' },
]

const STEPS = [
  { n: '01', h: 'Ingredients', p: 'Pack size, price, supplier, trim yield. Weight, volume and count convert through density and each-weights.' },
  { n: '02', h: 'Recipes', p: 'Sub-recipes nest to any depth: a jus inside a sauce inside a dish, with cycle detection.' },
  { n: '03', h: 'Menu', p: 'Link items to recipes, add modifiers with attach rates, and get the price that hits your target.' },
  { n: '04', h: 'Sales', p: 'Drop a POS item-sales export. Names are fuzzy-matched; you confirm anything unsure.' },
  { n: '05', h: 'Engineer', p: 'Stars, Plowhorses, Puzzles and Dogs, with one specific action per item and a price what-if.' },
]

const FEATURES = [
  { i: 'alert', h: 'Supplier spike alerts', p: 'Import this week’s price list. See every changed line, then exactly which dishes crossed your food-cost target and by how many points.' },
  { i: 'grid', h: 'Price what-if', p: 'Move one price and watch margin, sold quantity and quadrant shift under an elasticity you control.' },
  { i: 'book', h: 'Theoretical vs actual', p: 'Enter opening, purchases and closing inventory. The gap is waste, comps, portioning, or theft. Now it has a number.' },
  { i: 'print', h: 'Recipe cards', p: 'Print a card for any recipe, scaled to the batch you are making today, with costs on or off.' },
  { i: 'download', h: 'Order guide & prep list', p: 'Forecast covers, get sub-recipe batches to prep and cases to order, grouped by supplier.' },
  { i: 'camera', h: 'Monthly snapshots', p: 'Close the month, then compare: what moved in price, which dishes changed class, how food cost drifted.' },
]

export function Landing() {
  return (
    <>
      <Header />
      <main id="main">
        <Hero />

        <section className="band">
          <div className="wrap">
            <p className="preheader dark">Why this exists</p>
            <h2 className="h2">Plate cost is the number every restaurant needs and few can see.</h2>
            <div className="evidence">
              {EVIDENCE.map((e) => (
                <figure key={e.k} className="ev">
                  <figcaption>{e.k}</figcaption>
                  <blockquote>{e.t}</blockquote>
                </figure>
              ))}
            </div>
            <p className="fine muted">Paraphrased from public discussions. No individual posts or users are quoted.</p>
          </div>
        </section>

        <section className="wrap section">
          <p className="preheader dark">The workflow</p>
          <h2 className="h2">From invoice to menu decision in five steps.</h2>
          <ol className="steps">
            {STEPS.map((s) => (
              <li key={s.n}><span className="step-n">{s.n}</span><h3>{s.h}</h3><p>{s.p}</p></li>
            ))}
          </ol>
        </section>

        <section className="band band-warm">
          <div className="wrap">
            <p className="preheader dark">What you walk away with</p>
            <h2 className="h2">Actions, not just charts.</h2>
            <div className="features">
              {FEATURES.map((f) => (
                <article key={f.h} className="feature">
                  <span className="feature-ico"><Icon name={f.i} size={22} /></span>
                  <h3>{f.h}</h3>
                  <p>{f.p}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="wrap section formats">
          <div>
            <p className="preheader dark">Bring your own data</p>
            <h2 className="h2">Works with the exports you already have.</h2>
            <p className="lede">No integration to install and no credentials to hand over. Export a report, drop it in, check the column mapping.</p>
            <Link to="/docs#formats" className="btn btn-secondary">How to export each format <Icon name="chev" size={16} /></Link>
          </div>
          <ul className="format-list">
            <li><b>Lightspeed Restaurant K-Series</b><span>Product Mix report CSV: Item name, Quantity, Sales (tax excl.)</span></li>
            <li><b>Lightspeed Restaurant L-Series</b><span>Export Data › Receipt items: Item Name, Amount, Total Tax Excl. Price</span></li>
            <li><b>Any POS</b><span>Any CSV with an item name and a quantity. Map the columns yourself.</span></li>
            <li><b>Supplier price lists & invoices</b><span>Item code, description, pack, price. Matched by code, then by name.</span></li>
          </ul>
        </section>

        <section className="cta-band">
          <div className="wrap cta-in">
            <div>
              <h2>Your menu, costed by Friday.</h2>
              <p>Start from the sample bistro or a blank project. Everything stays in your browser unless you sign in to sync.</p>
            </div>
            <div className="hero-ctas">
              <button className="btn btn-primary btn-lg" onClick={() => createSample()}>Try the sample</button>
              <Link to="/app" className="btn btn-inverse btn-lg">Open workspace</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
