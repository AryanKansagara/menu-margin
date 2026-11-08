import { emptyProject, sampleProject } from './engine/sample.ts'
import { kpis } from './engine/outputs.ts'
import { newProject, putProject, putSnapshot, type ProjectRec } from './store.ts'
import { navigate, toast } from './ui.tsx'
import type { ProjectData } from './engine/types.ts'

export async function createSample(go = true, tab = ''): Promise<ProjectRec> {
  const p = newProject('Bistro Mirabel (sample)', sampleProject())
  await putProject(p)
  // Seed one month-end snapshot so compare has something to show.
  // Seed a September close (prices before the October invoices) so compare has something to show.
  const sept = { ...p.data, ingredients: p.data.ingredients.map((i) => (i.history.length > 1 ? { ...i, price: i.history[i.history.length - 2].price, history: i.history.slice(0, -1) } : i)) }
  await putSnapshot({ id: crypto.randomUUID(), projectId: p.id, label: 'September 2026 close', createdAt: '2026-10-01T08:00:00.000Z', data: sept })
  if (go) { navigate(`/app/${p.id}${tab ? `/${tab}` : ''}`); toast('Sample bistro loaded. All data is synthetic.', { kind: 'ok' }) }
  return p
}

export async function createEmpty(name: string, go = true): Promise<ProjectRec> {
  const p = newProject(name, emptyProject(name))
  await putProject(p)
  if (go) navigate(`/app/${p.id}`)
  return p
}

export async function snapshot(projectId: string, data: ProjectData, label: string) {
  await putSnapshot({ id: crypto.randomUUID(), projectId, label, createdAt: new Date().toISOString(), data: structuredClone(data) })
  const k = kpis(data)
  toast(`Snapshot "${label}" saved · ${k.items} items`, { kind: 'ok' })
}

export const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`
