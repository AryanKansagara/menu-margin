import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readBackup } from './backup.ts'
import { emptyProject, sampleProject } from './sample.ts'

const project = (id = 'p1') => ({
  id, name: 'Test Kitchen', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
  data: { restaurant: 'Test Kitchen', settings: { targetFcPct: 30 }, ingredients: [], recipes: [], menu: [], sales: [], actuals: [], priceImports: [] },
})
const snapshot = (id = 's1') => ({ id, projectId: 'p1', label: '2026-10', createdAt: '2026-11-01T00:00:00Z', data: project().data })

test('a real backup is read in full', () => {
  const r = readBackup(JSON.stringify({ app: 'menu-margin', projects: [project('a'), project('b')], snapshots: [snapshot()] }))
  assert.equal(r.kind, 'backup')
  if (r.kind === 'backup') { assert.equal(r.projects.length, 2); assert.equal(r.snapshots.length, 1) }
})

test('a single-project export has no snapshots and still restores', () => {
  const r = readBackup(JSON.stringify({ app: 'menu-margin', projects: [project()] }))
  assert.equal(r.kind, 'backup')
  if (r.kind === 'backup') assert.deepEqual(r.snapshots, [])
})

test('a backup with no projects is reported as empty, not as a restore', () => {
  assert.equal(readBackup('{"projects":[]}').kind, 'empty')
  assert.equal(readBackup('{"app":"menu-margin","projects":[],"snapshots":[]}').kind, 'empty')
})

test('anything that is not a backup is invalid, and never throws', () => {
  const odd = [
    '', '   ', 'Hello, not json', '{', '{"projects":', '\u0000\u0001\u0002', '\ufeff', '\x89PNG\r\n\x1a\n',
    'null', 'true', '0', '"projects"', '[]', '[{"id":"a"}]', '{}', '{"hello":"world"}',
    '{"projects":null}', '{"projects":{}}', '{"projects":"x"}', '{"projects":[1]}', '{"projects":[null]}', '{"projects":[[]]}',
    '{"projects":[{}]}', '{"projects":[{"id":"a"}]}', '{"projects":[{"id":"","name":"x","data":{}}]}',
    '{"projects":[{"id":"a","name":"x","data":null}]}', '{"projects":[{"id":"a","name":"x","data":{}}]}',
    '{"projects":[{"id":1,"name":"x","data":{"settings":{},"ingredients":[],"recipes":[],"menu":[]}}]}',
    JSON.stringify({ projects: [{ ...project(), data: { ...project().data, ingredients: {} } }] }),
    JSON.stringify({ projects: [project(), { id: 'bad' }] }), // one bad project rejects the whole file
    JSON.stringify({ projects: [project()], snapshots: {} }),
    JSON.stringify({ projects: [project()], snapshots: [{ id: 's' }] }),
    JSON.stringify({ projects: [project()], snapshots: [null] }),
    JSON.stringify({ projects: [project()], snapshots: null }),
  ]
  for (const t of odd) assert.equal(readBackup(t).kind, 'invalid', JSON.stringify(t))
})

test('the app\'s own sample and blank projects are valid backups', () => {
  for (const data of [sampleProject(), emptyProject('Blank')]) {
    assert.equal(readBackup(JSON.stringify({ projects: [{ ...project(), data }] })).kind, 'backup')
  }
})
