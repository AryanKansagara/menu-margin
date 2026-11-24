import type { ProjectRec } from '../store.ts'
import type { Snapshot } from './outputs.ts'

export type BackupRead =
  | { kind: 'backup'; projects: ProjectRec[]; snapshots: Snapshot[] }
  | { kind: 'empty' } // a backup file that contains no projects
  | { kind: 'invalid' } // anything that is not a Menu Margin backup

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

// Just enough of a project for the workspace to list it without crashing.
function isProject(x: unknown): x is ProjectRec {
  if (!isObj(x) || typeof x.id !== 'string' || !x.id || typeof x.name !== 'string' || !isObj(x.data)) return false
  const d = x.data
  return isObj(d.settings) && Array.isArray(d.ingredients) && Array.isArray(d.recipes) && Array.isArray(d.menu)
}

const isSnapshot = (x: unknown): x is Snapshot => isObj(x) && typeof x.id === 'string' && !!x.id && typeof x.projectId === 'string' && isObj(x.data)

/** Read the text of a backup file. Never throws; all-or-nothing, so a half-valid file is `invalid`. */
export function readBackup(text: string): BackupRead {
  let j: unknown
  try { j = JSON.parse(text) } catch { return { kind: 'invalid' } }
  if (!isObj(j) || !Array.isArray(j.projects)) return { kind: 'invalid' }
  if (!j.projects.every(isProject)) return { kind: 'invalid' }
  if (j.snapshots !== undefined && !(Array.isArray(j.snapshots) && j.snapshots.every(isSnapshot))) return { kind: 'invalid' }
  if (j.projects.length === 0) return { kind: 'empty' }
  return { kind: 'backup', projects: j.projects, snapshots: (j.snapshots as Snapshot[] | undefined) ?? [] }
}
