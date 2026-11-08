import type { ProjectData } from './engine/types.ts'
import type { Snapshot } from './engine/outputs.ts'

export interface ProjectRec {
  id: string
  name: string
  data: ProjectData
  createdAt: string
  updatedAt: string
}

const DB = 'menu-margin'
let dbp: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      const d = req.result
      d.createObjectStore('projects', { keyPath: 'id' })
      d.createObjectStore('snapshots', { keyPath: 'id' }).createIndex('projectId', 'projectId')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const t = d.transaction(store, mode)
    const r = fn(t.objectStore(store))
    t.oncomplete = () => resolve(r ? r.result : (undefined as T))
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  }))
}

export const listProjects = () => tx<ProjectRec[]>('projects', 'readonly', (s) => s.getAll())
export const getProject = (id: string) => tx<ProjectRec | undefined>('projects', 'readonly', (s) => s.get(id))
export const putProject = (p: ProjectRec) => tx<IDBValidKey>('projects', 'readwrite', (s) => s.put(p)).then(() => notify())
export const deleteProject = async (id: string) => {
  const snaps = await listSnapshots(id)
  await tx('projects', 'readwrite', (s) => { s.delete(id) })
  await tx('snapshots', 'readwrite', (s) => { for (const x of snaps) s.delete(x.id) })
  notify()
}
export const listSnapshots = (projectId: string) =>
  tx<Snapshot[]>('snapshots', 'readonly', (s) => s.index('projectId').getAll(projectId)).then((r) => r.sort((a, b) => a.createdAt.localeCompare(b.createdAt)))
export const allSnapshots = () => tx<Snapshot[]>('snapshots', 'readonly', (s) => s.getAll())
export const putSnapshot = (x: Snapshot) => tx<IDBValidKey>('snapshots', 'readwrite', (s) => s.put(x)).then(() => notify())
export const deleteSnapshot = (id: string) => tx('snapshots', 'readwrite', (s) => { s.delete(id) }).then(() => notify())
export const clearAll = async () => {
  await tx('projects', 'readwrite', (s) => { s.clear() })
  await tx('snapshots', 'readwrite', (s) => { s.clear() })
  notify()
}

// Tiny change bus so views and the sync engine react to writes.
const subs = new Set<() => void>()
export function onStoreChange(fn: () => void) { subs.add(fn); return () => { subs.delete(fn) } }
function notify() { subs.forEach((f) => f()) }

export function newProject(name: string, data: ProjectData): ProjectRec {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), name, data, createdAt: now, updatedAt: now }
}
