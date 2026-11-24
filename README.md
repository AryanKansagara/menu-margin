# Menu Margin

Recipe costing and menu engineering for independent restaurants.

Most owners and chefs know their sales to the dollar and their plate cost roughly, if at all. The usual options are a paid back-office platform or a spreadsheet that breaks the day a sauce goes inside another sauce or a supplier changes a price. Menu Margin takes the files you already have (a supplier price list, your recipes, a POS item-sales export) and turns them into plate cost, food-cost %, and a menu-engineering matrix with a concrete action for every dish.

**Live:** https://menu-margin-two.vercel.app

## Features

- **Ingredients** with purchase unit, pack size, price, supplier code, trim yield, and unit conversion across weight, volume and count (per-ingredient density and each-weight). Price history from repeated imports.
- **Recipes** with sub-recipes nested to any depth (cycle detection), batch yield and portions. Plate cost, food-cost %, suggested price for a target, contribution margin, cost breakdown by ingredient.
- **Menu** items linked to recipes, with modifiers weighted by attach rate and POS-name aliases.
- **Sales import** from Lightspeed Restaurant K-Series (Product Mix export), L-Series (Export Data, Receipt items), Toast (All items / Product Mix and ItemSelectionDetails.csv), Square (Item Sales detail CSV) or any POS CSV. Void flags and refunds are handled per format. Format detection, column mapping, validation report with line numbers, fuzzy matching with a confirm step.
- **Menu engineering** (Kasavana–Smith): Stars, Plowhorses, Puzzles and Dogs with a specific recommendation per item, per-category analysis, and a price what-if with editable elasticity.
- **Theoretical vs actual** food cost from opening inventory, purchases and closing inventory.
- **Distributor price lists** with foodservice pack notation (`6/5 LB`, `4/1 GAL`, Pack + Size columns, `Case $`), with pack changes normalised across units.
- **Reference densities and each-weights** from USDA FoodData Central (SR Legacy, public domain), offered in the ingredient editor with the FDC id.
- **Supplier spike alerts**: import a price list, see the diff, and see which dishes cross your food-cost target, by how much, and which ingredient caused it.
- **Outputs**: printable recipe cards (scaled), an owner’s monthly report, an order guide and prep list from forecast covers, and CSV exports.
- **Workspace**: multiple projects stored locally (IndexedDB), monthly snapshots with compare, undo, optional sign-in to sync across devices.
- A synthetic sample bistro (35 ingredients, 6 sub-recipes, 18 menu items, one month of sales).

Reads the files Lightspeed and other POS systems let you export.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine tests
npm run build
npm run test:e2e # browser tests, see below
```

Optional cloud sync reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `.env`. Without them the app runs fully local.

## Tests

- `npm test` runs the engine unit tests (Node's built-in test runner).
- `npm run test:e2e` builds the app and runs the Playwright (Chromium) suite in `e2e/` against that production build, served by `vite preview` on port 4173 (set `E2E_PORT` to use another). It opens the sample bistro, edits a price, imports a price list and a POS export, feeds the importers unusable files, and reloads to check persistence. Every test runs signed out in a fresh browser profile with all external network traffic blocked, and fails on any uncaught page error. The test data is synthetic.
- First time only: `npx playwright install chromium` (add `--with-deps` on a fresh Linux machine).

GitHub Actions (`.github/workflows/ci.yml`) runs `npm ci`, the build, the unit tests and the E2E suite on every pull request and push to `main`.
