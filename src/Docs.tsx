import { useEffect } from 'react'
import { samplePriceListCsv, sampleProductMixCsv } from './engine/sample.ts'
import { download, Footer, Header, Icon, Link } from './ui.tsx'

const TOC = [
  ['start', 'Quick start'],
  ['formats', 'Sales exports'],
  ['k-series', 'Lightspeed K-Series'],
  ['l-series', 'Lightspeed L-Series'],
  ['generic', 'Any other POS'],
  ['prices', 'Supplier price lists'],
  ['costing', 'How costing works'],
  ['units', 'Units & densities'],
  ['engineering', 'Menu engineering'],
  ['variance', 'Theoretical vs actual'],
  ['privacy', 'Data & sync'],
  ['assumptions', 'Assumptions'],
]

export default function Docs() {
  useEffect(() => { document.title = 'Docs · Menu Margin'; if (location.hash) document.querySelector(location.hash)?.scrollIntoView() }, [])
  return (
    <>
      <Header />
      <main id="main" className="wrap docs">
        <aside className="docs-toc" aria-label="On this page">
          <p className="preheader dark">Docs</p>
          <nav>{TOC.map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}</nav>
        </aside>
        <article className="prose">
          <h1 className="h1">Getting your data in</h1>
          <p className="lede">Menu Margin works from three files you already have or can make in minutes: a supplier price list, your recipes, and a POS item-sales export. Nothing connects to your POS; you export, drop the file, and confirm the column mapping.</p>

          <h2 id="start">Quick start</h2>
          <ol>
            <li><b>Ingredients.</b> In a project, open <i>Price imports</i> and drop your distributor’s price list or an invoice CSV. Unmatched lines can be added as ingredients. Then set yield % (trim loss) and, for anything you measure by volume or count, a density or each-weight.</li>
            <li><b>Recipes.</b> Build sub-recipes first (stocks, sauces, doughs) with their batch yield. Then dishes, which can use ingredients and sub-recipes in any unit that converts.</li>
            <li><b>Menu.</b> Link each item to a dish and set the price, tax excluded. Add modifiers with an attach rate.</li>
            <li><b>Sales.</b> Import one month of item sales from your POS (below). Confirm fuzzy matches once; they’re remembered as aliases.</li>
            <li><b>Act.</b> Engineering gives each item a class and an action; Outputs gives you recipe cards, an order guide and the monthly report. Take a snapshot at month close.</li>
          </ol>
          <div className="inline wrap-gap">
            <button className="btn btn-secondary btn-sm" onClick={() => download('sample-product-mix-2026-10.csv', sampleProductMixCsv())}><Icon name="download" size={15} /> Sample K-Series Product Mix CSV</button>
            <button className="btn btn-secondary btn-sm" onClick={() => download('sample-price-list-2026-11.csv', samplePriceListCsv())}><Icon name="download" size={15} /> Sample supplier price list CSV</button>
          </div>
          <p className="fine muted">Sample files are synthetic and match the sample bistro project.</p>

          <h2 id="formats">Sales exports</h2>
          <p>The importer looks for the header row in the first 25 lines (report titles and date ranges above it are skipped), detects the delimiter (comma, semicolon, tab or pipe), reads UTF-8, UTF-16 or Windows-1252 files, and understands <code>1,234.50</code>, <code>1.234,50</code>, <code>$</code> and <code>(12.00)</code>. Every column can be re-mapped by hand. Rows called Total or Subtotal, group header rows, and rows whose status reads void, cancelled, deleted or refund are skipped and counted in the validation report, which lists problems by file line number.</p>

          <h3 id="k-series">Lightspeed Restaurant K-Series: Product Mix report</h3>
          <ol>
            <li>Sign in to the Back Office.</li>
            <li>Go to <b>Reports › All reports</b>, then under <b>Sales reports</b> open <b>Product Mix Report</b>.</li>
            <li>Set the date range to one month (for example the 1st to the last day) and any location filters.</li>
            <li>Click <b>Export</b>, pick the file format for your computer (Mac or Windows), and export the CSV.</li>
          </ol>
          <p>The export includes every column, even ones hidden on screen. Menu Margin uses:</p>
          <table className="tbl compact"><thead><tr><th>Column in the export</th><th>Used as</th></tr></thead><tbody>
            <tr><td><code>Item name</code></td><td>POS name, matched to your menu</td></tr>
            <tr><td><code>Quantity</code></td><td>Units sold</td></tr>
            <tr><td><code>Sales (tax excl.)</code></td><td>Net revenue (preferred)</td></tr>
            <tr><td><code>Sales (tax incl.)</code></td><td>Fallback revenue, flagged as tax-included</td></tr>
            <tr><td><code>Accounting group</code></td><td>Used to recognise the format</td></tr>
          </tbody></table>
          <p className="fine muted">Other columns (Tax, Zero priced count, Discounted/Offered/Loss/Returned amounts and quantities, Margin, Costs, Service charge) are ignored. Zero-priced and staff-meal lines can be set to Ignore in the match step.</p>

          <h3 id="l-series">Lightspeed Restaurant L-Series: Export Data › Receipt items</h3>
          <ol>
            <li>In Restaurant Manager, open <b>Reports › Export Data</b>.</li>
            <li>Choose the <b>Receipt items</b> category, pick the date range and location(s), and download the CSV.</li>
          </ol>
          <p>This export is line-level (one row per item on a receipt), so Menu Margin sums rows per item name.</p>
          <table className="tbl compact"><thead><tr><th>Column</th><th>Used as</th></tr></thead><tbody>
            <tr><td><code>Item Name</code></td><td>POS name</td></tr>
            <tr><td><code>Amount</code></td><td>Quantity on the line</td></tr>
            <tr><td><code>Total Tax Excl. Price</code></td><td>Net revenue for the line</td></tr>
            <tr><td><code>Total Price</code></td><td>Fallback, tax included</td></tr>
            <tr><td><code>Status</code></td><td>Void or cancelled lines are skipped</td></tr>
            <tr><td><code>Creation Date</code></td><td>Suggests the period label</td></tr>
            <tr><td><code>Receipt ID</code></td><td>Used to recognise the format</td></tr>
          </tbody></table>
          <p className="fine muted">The L-Series Products report is also accepted if it has a product name and a quantity column; map them in step 1.</p>

          <h3 id="generic">Any other POS</h3>
          <p>Any CSV with one row per item (or per sale line) works. Minimum: an item name column and a quantity column. Recognised headers include <code>Item</code>, <code>Menu Item</code>, <code>Product</code>, <code>Name</code>; <code>Qty</code>, <code>Quantity</code>, <code>Sold</code>, <code>Count</code>; and <code>Net Sales</code>, <code>Revenue</code>, <code>Gross Sales</code>. If revenue is missing, realised price falls back to your menu price.</p>

          <h2 id="prices">Supplier price lists and invoices</h2>
          <p>Export or save your distributor’s order guide, price list or invoice as CSV. Recognised columns: <code>Item #</code> / <code>SKU</code> / <code>Item code</code>, <code>Description</code>, <code>Pack</code> / <code>Pack size</code>, <code>UOM</code> / <code>Unit</code>, <code>Case price</code> / <code>Unit price</code> / <code>Price</code>, <code>Vendor</code> / <code>Supplier</code>, <code>Invoice date</code>.</p>
          <ul>
            <li>Lines match ingredients by supplier item code first, then exact name, then a fuzzy name match (72%+), which you can override per line.</li>
            <li>If the pack size changed but the unit is the same, the price is normalised to your current pack so history stays comparable. If the unit changed, the line is flagged for you to check.</li>
            <li>The diff shows increases, decreases, unchanged lines, lines not matched, and your ingredients from that supplier that were missing from the file.</li>
            <li>Before you apply, the spike alert lists every dish that would cross your food-cost target, how far over it lands, and the ingredient driving it.</li>
          </ul>

          <h2 id="costing">How costing works</h2>
          <ul>
            <li><b>Edible portion vs as purchased.</b> Recipe quantities are what goes on the plate. Cost = quantity ÷ yield % × price per pack unit. A 200 g hanger portion at 88% yield costs 227 g of purchased steak.</li>
            <li><b>Sub-recipes.</b> A sub-recipe’s batch cost is divided by its yield (e.g. per litre). A dish using 60 ml of a 1 L sauce takes 6% of the batch. Nesting has no depth limit; loops are blocked when you add a line and reported if they arrive in an import.</li>
            <li><b>Dishes.</b> Plate cost = batch cost ÷ portions. A soup batch of 10 portions costs one tenth per bowl.</li>
            <li><b>Modifiers.</b> Expected cost and price add each modifier × its attach rate. Contribution margin is expected price − expected cost.</li>
            <li><b>Suggested price</b> = plate cost ÷ target food cost, rounded up to the next $0.50.</li>
          </ul>

          <h2 id="units">Units & densities</h2>
          <p>Weight (g, kg, oz, lb), volume (ml, L, tsp, tbsp, cup, fl oz, qt, gal; US measures) and count (each, dozen) convert within their family exactly. Crossing families needs a density (g per ml) for weight↔volume, or an each-weight (g) for count↔weight. Typical densities: water/stock 1.00, cream 1.00, milk 1.03, oils 0.91–0.92, honey 1.42, flour 0.53, sugar 0.85. A recipe line that can’t convert shows a red message and contributes $0 until fixed; it is never silently guessed.</p>

          <h2 id="engineering">Menu engineering</h2>
          <p>Menu Margin uses the Kasavana–Smith method (1982):</p>
          <ul>
            <li><b>Popularity:</b> an item is popular if its menu mix % ≥ 70% × (100% ÷ number of items). Analyse one category at a time when price levels differ.</li>
            <li><b>Profitability:</b> an item is high-margin if its contribution margin ≥ the sales-weighted average CM.</li>
            <li><b>Star</b> (popular, high CM): protect it. <b>Plowhorse</b> (popular, low CM): small price rise or cheaper component. <b>Puzzle</b> (unpopular, high CM): reposition and promote. <b>Dog</b> (neither): rework or remove.</li>
            <li>Realised price = net revenue ÷ quantity when revenue is in the export, so discounts show up.</li>
          </ul>
          <p><b>Price what-if</b> uses constant elasticity: new quantity = quantity × (new price ÷ old price)<sup>e</sup>. With e = −0.8, a 10% increase keeps about 92.7% of orders. The whole matrix is recomputed, so thresholds move too.</p>

          <h2 id="variance">Theoretical vs actual</h2>
          <p>Theoretical food cost = Σ (items sold × expected cost). Actual food cost = opening inventory + purchases − closing inventory, valued at cost. The gap, in points and dollars, is what recipes don’t explain: waste, over-portioning, unrung comps, spoilage or theft.</p>

          <h2 id="privacy">Data & sync</h2>
          <p>Projects are stored in your browser (IndexedDB). Files you drop in are parsed on your device and discarded; only the parsed result is saved. Signing in (optional) syncs projects and snapshots across devices; edits merge by most recent change. You can export everything as JSON, delete your cloud data, or delete your account from <Link to="/settings">Settings</Link>.</p>

          <h2 id="assumptions">Assumptions</h2>
          <ul>
            <li>Lightspeed export column names were checked against Lightspeed’s public help-centre articles in November 2026. Report layouts change; if yours differs, map the columns in step 1.</li>
            <li>All prices and sales are treated as tax excluded. Pick a tax-excluded column when the export has both.</li>
            <li>Default target food cost is 30%, popularity rule 70%, elasticity −0.8. All are editable per project.</li>
            <li>Menu Margin is an independent tool. It is not made by, affiliated with, or endorsed by Lightspeed; it simply reads files that Lightspeed and other POS systems let you export.</li>
          </ul>
        </article>
      </main>
      <Footer />
    </>
  )
}
