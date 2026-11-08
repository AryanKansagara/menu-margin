import type { SupabaseClient } from '@supabase/supabase-js'
import { allSnapshots, listProjects, onStoreChange, putProject, putSnapshot, type ProjectRec } from './store.ts'
import type { Snapshot } from './engine/outputs.ts'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
export const APP = 'menu-margin'
const MAX_BYTES = 3_500_000

export type SyncState = 'local' | 'syncing' | 'synced' | 'offline' | 'error'
export interface SyncStatus { state: SyncState; email?: string; message?: string; at?: string }

let status: SyncStatus = { state: 'local' }
const subs = new Set<(s: SyncStatus) => void>()
export const getStatus = () => status
export function onStatus(fn: (s: SyncStatus) => void) { subs.add(fn); return () => { subs.delete(fn) } }
function set(s: Partial<SyncStatus>) { status = { ...status, ...s }; subs.forEach((f) => f(status)) }

let client: Promise<SupabaseClient> | null = null
function sb(): Promise<SupabaseClient> {
  if (!URL || !KEY) return Promise.reject(new Error('Cloud sync is not configured for this build'))
  client ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true } }))
  return client
}

/** True when a saved Supabase session exists, checked without loading the library. */
function hasSavedSession() {
  try { return Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token')) } catch { return false }
}

const PENDING = 'mm.pendingCloudDeletes'
const pending = (): string[] => JSON.parse(localStorage.getItem(PENDING) || '[]')
export function queueCloudDelete(projectId: string) {
  if (status.state === 'local') return
  localStorage.setItem(PENDING, JSON.stringify([...new Set([...pending(), projectId])]))
  schedule()
}

export async function initSync() {
  if (!hasSavedSession()) return
  try {
    const c = await sb()
    const { data } = await c.auth.getSession()
    if (data.session) { set({ state: 'syncing', email: data.session.user.email }); await syncNow() }
  } catch (e) {
    set({ state: 'offline', message: (e as Error).message })
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
let suppress = false
function schedule() {
  if (status.state === 'local' || suppress) return
  clearTimeout(timer)
  timer = setTimeout(() => { syncNow() }, 1500)
}
onStoreChange(schedule)
if (typeof window !== 'undefined') window.addEventListener('online', () => schedule())

function errState(e: unknown) {
  const msg = (e as Error)?.message ?? String(e)
  const offline = typeof navigator !== 'undefined' && !navigator.onLine || /fetch|network|Failed to fetch|timeout/i.test(msg)
  set({ state: offline ? 'offline' : 'error', message: offline ? 'Cloud unreachable; changes are saved on this device and will sync later' : msg })
}

let running: Promise<void> | null = null
export function syncNow(): Promise<void> {
  running ??= doSync().finally(() => { running = null })
  return running
}

async function doSync() {
  const c = await sb()
  const { data: sess } = await c.auth.getSession()
  if (!sess.session) { set({ state: 'local', email: undefined }); return }
  set({ state: 'syncing', email: sess.session.user.email, message: undefined })
  try {
    for (const id of pending()) {
      const { error: ev } = await c.from('project_versions').delete().eq('project_id', id)
      if (ev) throw ev
      const { error } = await c.from('projects').delete().eq('id', id)
      if (error) throw error
    }
    localStorage.removeItem(PENDING)
    const { data: cloud, error } = await c.from('projects').select('id,name,data,created_at,updated_at').eq('app', APP)
    if (error) throw error
    const local = await listProjects()
    const lmap = new Map(local.map((p) => [p.id, p]))
    const cmap = new Map((cloud ?? []).map((r) => [r.id as string, r]))
    const skipped: string[] = []
    suppress = true
    try {
      for (const r of cloud ?? []) {
        const l = lmap.get(r.id)
        if (!l || new Date(r.updated_at).getTime() > new Date(l.updatedAt).getTime()) {
          await putProject({ id: r.id, name: r.name, data: r.data, createdAt: r.created_at, updatedAt: r.updated_at })
        }
      }
      for (const l of local) {
        const r = cmap.get(l.id)
        if (r && new Date(r.updated_at).getTime() >= new Date(l.updatedAt).getTime()) continue
        const body = { id: l.id, app: APP, name: l.name, data: l.data, created_at: l.createdAt, updated_at: l.updatedAt }
        if (JSON.stringify(body).length > MAX_BYTES) { skipped.push(l.name); continue }
        const { error: e2 } = await c.from('projects').upsert(body)
        if (e2) throw e2
      }
      // Snapshots are immutable: union by id.
      const ids = [...new Set([...lmap.keys(), ...cmap.keys()])]
      if (ids.length) {
        const { data: vers, error: e3 } = await c.from('project_versions').select('id,project_id,label,data,created_at').in('project_id', ids)
        if (e3) throw e3
        const have = new Set((vers ?? []).map((v) => v.id))
        const localSnaps = await allSnapshots()
        const localIds = new Set(localSnaps.map((s) => s.id))
        for (const v of vers ?? []) if (!localIds.has(v.id)) await putSnapshot({ id: v.id, projectId: v.project_id, label: v.label, createdAt: v.created_at, data: v.data } as Snapshot)
        const upload = localSnaps.filter((s) => !have.has(s.id) && ids.includes(s.projectId) && JSON.stringify(s.data).length < MAX_BYTES)
        if (upload.length) {
          const { error: e4 } = await c.from('project_versions').insert(upload.map((s) => ({ id: s.id, project_id: s.projectId, label: s.label, data: s.data, created_at: s.createdAt })))
          if (e4) throw e4
        }
      }
    } finally { suppress = false }
    set({ state: 'synced', at: new Date().toISOString(), message: skipped.length ? `Too large to sync: ${skipped.join(', ')}` : undefined })
  } catch (e) {
    suppress = false
    errState(e)
  }
}

export async function signUp(email: string, password: string) {
  const c = await sb()
  const { data, error } = await c.auth.signUp({ email, password })
  if (error) throw error
  if (!data.session) throw new Error('Account created. Sign in to continue.')
  set({ state: 'syncing', email })
  await syncNow()
}

export async function signIn(email: string, password: string) {
  const c = await sb()
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw error
  set({ state: 'syncing', email })
  await syncNow()
}

export async function signOut() {
  const c = await sb()
  await c.auth.signOut()
  set({ state: 'local', email: undefined, message: undefined })
}

export async function deleteCloudData() {
  const c = await sb()
  const { data, error: e1 } = await c.from('projects').select('id').eq('app', APP)
  if (e1) throw e1
  const ids = (data ?? []).map((r) => r.id)
  if (ids.length) {
    const { error: e2 } = await c.from('project_versions').delete().in('project_id', ids)
    if (e2) throw e2
  }
  const { error } = await c.from('projects').delete().eq('app', APP)
  if (error) throw error
}

export async function deleteAccount() {
  const c = await sb()
  const { error } = await c.rpc('delete_my_account')
  if (error) throw error
  await c.auth.signOut()
  set({ state: 'local', email: undefined })
}

export async function exportAll(): Promise<{ app: string; exportedAt: string; projects: ProjectRec[]; snapshots: Snapshot[] }> {
  return { app: APP, exportedAt: new Date().toISOString(), projects: await listProjects(), snapshots: await allSnapshots() }
}
