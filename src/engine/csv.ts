/** Decode file bytes, honouring UTF-8 and UTF-16 byte-order marks (Excel on Windows often writes UTF-16). */
export function decodeBytes(buf: Uint8Array): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2))
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2))
  const text = new TextDecoder('utf-8').decode(buf)
  // Fall back to Windows-1252 if UTF-8 decoding produced replacement characters.
  if (text.includes('�')) return new TextDecoder('windows-1252').decode(buf)
  return text.replace(/^﻿/, '')
}

export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20)
  let best = ','
  let bestScore = -1
  for (const d of [',', ';', '\t', '|']) {
    const counts = lines.map((l) => countOutsideQuotes(l, d))
    const max = Math.max(0, ...counts)
    // Prefer the delimiter that appears consistently in the most lines.
    const score = counts.filter((c) => c === max && c > 0).length * 100 + max
    if (score > bestScore) { best = d; bestScore = score }
  }
  return best
}

function countOutsideQuotes(line: string, d: string): number {
  let n = 0
  let q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === d && !q) n++
  }
  return n
}

/** RFC 4180 style parser: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let q = false
  const t = text.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (q) {
      if (ch === '"') {
        if (t[i + 1] === '"') { cell += '"'; i++ } else q = false
      } else cell += ch
    } else if (ch === '"') q = true
    else if (ch === delimiter) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''))
}

/** Parse money/quantity cells: "$1,234.50", "1.234,50", "1 234,5", "(12.00)", "12%". Returns NaN when not numeric. */
export function parseNumber(raw: string | undefined): number {
  if (raw == null) return NaN
  let s = raw.trim()
  if (!s) return NaN
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  s = s.replace(/[\s  ']/g, '').replace(/[$€£¥%]|CAD|USD|EUR|GBP|AUD/gi, '')
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1) }
  if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1) }
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  }
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return NaN
  const n = parseFloat(s)
  return neg ? -n : n
}

export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((r) => r.map((c) => {
      const s = typeof c === 'number' ? (Number.isInteger(c) ? String(c) : c.toFixed(2)) : c
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(','))
    .join('\n')
}

export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Find the header row: the row (in the first 25) matching the most known header keywords. */
export function findHeaderRow(rows: string[][], keywords: string[]): number {
  let best = 0
  let bestScore = -1
  rows.slice(0, 25).forEach((r, i) => {
    const cells = r.map(norm)
    const score = keywords.filter((k) => cells.some((c) => c === k || c.includes(k))).length * 10 + r.filter(Boolean).length
    if (score > bestScore && r.filter(Boolean).length >= 2) { best = i; bestScore = score }
  })
  return best
}

/** Index of the first header that matches any candidate (exact normalised match first, then contains). */
export function pickColumn(headers: string[], candidates: string[], exclude: number[] = []): number {
  const h = headers.map(norm)
  for (const c of candidates) {
    const i = h.findIndex((x, j) => x === c && !exclude.includes(j))
    if (i >= 0) return i
  }
  for (const c of candidates) {
    const i = h.findIndex((x, j) => x.includes(c) && !exclude.includes(j))
    if (i >= 0) return i
  }
  return -1
}

// ---------- fuzzy matching ----------

function bigrams(s: string): string[] {
  const t = ` ${s} `
  const out: string[] = []
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2))
  return out
}

/** Sørensen–Dice on character bigrams blended with token overlap; 0..1. */
export function similarity(a: string, b: string): number {
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const bx = bigrams(x)
  const by = new Map<string, number>()
  for (const g of bigrams(y)) by.set(g, (by.get(g) ?? 0) + 1)
  let hit = 0
  for (const g of bx) {
    const n = by.get(g) ?? 0
    if (n > 0) { hit++; by.set(g, n - 1) }
  }
  const dice = (2 * hit) / (bx.length + bigrams(y).length)
  const tx = new Set(x.split(' '))
  const ty = new Set(y.split(' '))
  const inter = [...tx].filter((t) => ty.has(t)).length
  const contain = inter / Math.min(tx.size, ty.size)
  return Math.max(dice, 0.6 * dice + 0.4 * contain)
}

export interface Candidate { id: string; name: string; score: number }

export function rankMatches(query: string, options: { id: string; names: string[] }[], limit = 3): Candidate[] {
  return options
    .map((o) => {
      let best = 0
      let name = o.names[0]
      for (const n of o.names) {
        const s = similarity(query, n)
        if (s > best) { best = s; name = n }
      }
      return { id: o.id, name, score: best }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
