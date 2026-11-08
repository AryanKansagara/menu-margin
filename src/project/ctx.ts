import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getProject, onStoreChange, putProject, type ProjectRec } from '../store.ts'
import type { ProjectData } from '../engine/types.ts'
import { costMenu, findCycles, type ItemCost } from '../engine/costing.ts'
import { engInputs, engineer, type EngResult } from '../engine/engineering.ts'
import { setCurrency, toast } from '../ui.tsx'

export interface Ctx {
  rec: ProjectRec
  data: ProjectData
  update: (fn: (d: ProjectData) => ProjectData, label?: string) => void
  rename: (name: string) => void
  undo: () => void
  canUndo: boolean
  costs: ItemCost[]
  eng: EngResult | null
  cycles: string[][]
  periodId: string | null
  setPeriodId: (id: string) => void
}

export const ProjectCtx = createContext<Ctx | null>(null)
export const useP = () => useContext(ProjectCtx)!

export function useProjectState(id: string) {
  const [rec, setRec] = useState<ProjectRec | null | undefined>(undefined)
  const undoStack = useRef<{ data: ProjectData; label: string }[]>([])
  const [, force] = useState(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const latest = useRef<ProjectRec | null>(null)
  const [periodId, setPeriodId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const load = () => getProject(id).then((r) => {
      if (!alive) return
      // Only accept store versions that are newer than what we hold (e.g. pulled by sync).
      if (!latest.current || !r || r.updatedAt > latest.current.updatedAt) { latest.current = r ?? null; setRec(r ?? null) }
    }).catch(() => alive && setRec(null))
    load()
    const off = onStoreChange(load)
    return () => { alive = false; off() }
  }, [id])

  const persist = useCallback((r: ProjectRec) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      putProject(r).catch(() => toast('Could not save to this browser’s storage', { kind: 'err' }))
    }, 250)
  }, [])

  useEffect(() => () => { clearTimeout(saveTimer.current); if (latest.current) putProject(latest.current) }, [])

  const commit = useCallback((data: ProjectData, name?: string) => {
    const cur = latest.current
    if (!cur) return
    const next = { ...cur, data, name: name ?? cur.name, updatedAt: new Date().toISOString() }
    latest.current = next
    setRec(next)
    persist(next)
  }, [persist])

  const update = useCallback((fn: (d: ProjectData) => ProjectData, label = 'Change') => {
    const cur = latest.current
    if (!cur) return
    undoStack.current = [...undoStack.current.slice(-49), { data: cur.data, label }]
    commit(fn(cur.data))
    force((n) => n + 1)
  }, [commit])

  const undo = useCallback(() => {
    const last = undoStack.current.pop()
    if (!last) { toast('Nothing to undo'); return }
    commit(last.data)
    force((n) => n + 1)
    toast(`Undid: ${last.label}`)
  }, [commit])

  const rename = useCallback((name: string) => { const cur = latest.current; if (cur) commit(cur.data, name) }, [commit])

  const data = rec?.data
  const derived = useMemo(() => {
    if (!data) return null
    setCurrency(data.settings.currency)
    const cycles = findCycles(data.recipes)
    const costs = costMenu(data)
    const period = data.sales.find((s) => s.id === periodId) ?? data.sales[data.sales.length - 1]
    const eng = period && costs.length ? engineer(engInputs(costs, period), { popularityFactor: data.settings.popularityFactor, targetFcPct: data.settings.targetFcPct }) : null
    return { cycles, costs, eng }
  }, [data, periodId])

  const ctx: Ctx | null = rec && derived ? {
    rec, data: rec.data, update, rename, undo, canUndo: undoStack.current.length > 0,
    costs: derived.costs, eng: derived.eng, cycles: derived.cycles,
    periodId: periodId ?? rec.data.sales[rec.data.sales.length - 1]?.id ?? null, setPeriodId,
  } : null
  return { rec, ctx }
}
