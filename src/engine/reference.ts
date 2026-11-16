// Household-measure weights from USDA FoodData Central, SR Legacy (April 2018 release, public domain / CC0).
// https://fdc.nal.usda.gov/download-datasets  ·  values copied from food_portion.csv, FDC id in each row.
import { norm, similarity } from './csv.ts'

const CUP_ML = 236.5882365

// [names to match, grams in 1 US cup, FDC id, USDA description]
const CUPS: [string[], number, number, string][] = [
  [['all purpose flour', 'flour', 'pastry flour'], 125, 168894, 'Wheat flour, white, all-purpose, enriched, bleached'],
  [['bread flour'], 137, 168896, 'Wheat flour, white, bread, enriched'],
  [['granulated sugar', 'sugar', 'white sugar'], 200, 169655, 'Sugars, granulated'],
  [['brown sugar'], 220, 168833, 'Sugars, brown (cup packed)'],
  [['icing sugar', 'powdered sugar', 'confectioners sugar'], 120, 169656, 'Sugars, powdered (cup unsifted)'],
  [['butter', 'unsalted butter', 'salted butter'], 227, 173430, 'Butter, without salt'],
  [['milk', 'whole milk', 'milk 3 25'], 244, 171265, 'Milk, whole, 3.25% milkfat'],
  [['cream', 'heavy cream', 'whipping cream', 'cream 35'], 238, 170859, 'Cream, fluid, heavy whipping'],
  [['sour cream'], 230, 171257, 'Cream, sour, cultured'],
  [['yogurt', 'plain yogurt'], 245, 171284, 'Yogurt, plain, whole milk'],
  [['olive oil', 'extra virgin olive oil'], 216, 171413, 'Oil, olive, salad or cooking'],
  [['canola oil', 'vegetable oil', 'fryer oil'], 218, 172336, 'Oil, canola'],
  [['honey'], 339, 169640, 'Honey'],
  [['maple syrup'], 315, 169661, 'Syrups, maple'],
  [['molasses'], 337, 168820, 'Molasses'],
  [['water', 'stock', 'broth'], 237, 174158, 'Water, bottled, generic'],
  [['white vinegar', 'vinegar'], 238, 172237, 'Vinegar, distilled'],
  [['red wine vinegar'], 239, 172240, 'Vinegar, red wine'],
  [['soy sauce'], 255, 174277, 'Soy sauce made from soy and wheat (shoyu)'],
  [['ketchup'], 240, 168556, 'Catsup'],
  [['rice', 'long grain rice', 'white rice'], 185, 169756, 'Rice, white, long-grain, regular, raw'],
  [['rolled oats', 'oats'], 156, 169705, 'Oats'],
  [['cornstarch', 'corn starch'], 128, 169698, 'Cornstarch'],
  [['cocoa powder', 'cocoa'], 86, 169593, 'Cocoa, dry powder, unsweetened'],
  [['table salt', 'fine salt'], 292, 173468, 'Salt, table'],
  [['grated parmesan', 'parmesan'], 100, 171247, 'Cheese, parmesan, grated'],
]

// [names to match, grams for one, FDC id, USDA measure]
const EACH: [string[], number, number, string][] = [
  [['egg', 'eggs', 'large egg'], 50, 171287, 'Egg, whole, raw, fresh: 1 large'],
  [['lemon', 'lemons'], 84, 167746, 'Lemons, raw, without peel: 1 fruit (2-3/8" dia)'],
  [['lime', 'limes'], 67, 168155, 'Limes, raw: 1 fruit (2" dia)'],
  [['onion', 'onions', 'yellow onion'], 110, 170000, 'Onions, raw: 1 medium (2-1/2" dia)'],
  [['garlic', 'garlic clove'], 3, 169230, 'Garlic, raw: 1 clove'],
  [['potato', 'potatoes', 'russet potato'], 213, 170027, 'Potatoes, russet, raw: 1 medium'],
  [['carrot', 'carrots'], 61, 170393, 'Carrots, raw: 1 medium'],
  [['celery', 'celery stalk'], 40, 169988, 'Celery, raw: 1 stalk, medium'],
  [['tomato', 'tomatoes'], 123, 170457, 'Tomatoes, red, ripe, raw: 1 medium'],
  [['red pepper', 'bell pepper', 'red bell pepper'], 119, 170108, 'Peppers, sweet, red, raw: 1 medium'],
  [['avocado', 'avocados'], 201, 171705, 'Avocados, raw: 1 avocado'],
  [['banana', 'bananas'], 118, 173944, 'Bananas, raw: 1 medium'],
  [['apple', 'apples'], 182, 171688, 'Apples, raw, with skin: 1 medium (3" dia)'],
  [['mushroom', 'mushrooms', 'white mushrooms'], 18, 169251, 'Mushrooms, white, raw: 1 medium'],
]

export interface RefHit { value: number; source: string; fdcId: number }

// Words that turn a matched food into a different one: "peanut butter", "lemon juice", "garlic powder".
const CHANGES = new Set('peanut almond cashew hazelnut coconut snap pea peas leaf leaves zest juice paste powder powdered dried smoked syrup soy oat rice wine vinegar flour sauce starch milk cream sugar oil cheese'.split(' '))

function best(name: string, table: [string[], number, number, string][]) {
  const n = norm(name)
  const words = n.split(' ')
  let top: [string[], number, number, string] | undefined
  let score = 0
  for (const row of table) {
    for (const k of row[0]) {
      const kw = k.split(' ')
      if (words.some((w) => CHANGES.has(w) && !kw.includes(w))) continue
      // Whole-word containment ("Butter, unsalted" contains "butter") counts as a strong match.
      const s = ` ${n} `.includes(` ${k} `) ? 0.9 + k.length / 1000 : similarity(n, k)
      if (s > score) { score = s; top = row }
    }
  }
  return score >= 0.8 ? top : undefined
}

/** USDA density (g/ml) for a common ingredient name, or undefined. */
export function refDensity(name: string): RefHit | undefined {
  const r = best(name, CUPS)
  return r && { value: Math.round((r[1] / CUP_ML) * 1000) / 1000, source: `USDA FDC ${r[2]}: ${r[3]}, 1 cup = ${r[1]} g`, fdcId: r[2] }
}

/** USDA weight of one piece (g) for a common ingredient name, or undefined. */
export function refEach(name: string): RefHit | undefined {
  const r = best(name, EACH)
  return r && { value: r[1], source: `USDA FDC ${r[2]}: ${r[3]} = ${r[1]} g`, fdcId: r[2] }
}
