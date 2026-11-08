import { useEffect, useState } from 'react'
import { allSnapshots, clearAll, listProjects, putProject, putSnapshot } from './store.ts'
import { deleteAccount, deleteCloudData, exportAll, signIn, signOut, signUp, syncNow } from './sync.ts'
import { download, Footer, Header, Icon, Modal, toast, useSync, useTheme } from './ui.tsx'

function Account() {
  const s = useSync()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState<null | 'cloud' | 'account'>(null)
  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true); setErr('')
    try { await fn(); toast(ok, { kind: 'ok' }) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  if (s.email) return (
    <section className="card" id="account">
      <div className="card-head"><div><h2>Account</h2><p className="muted">Signed in as <b>{s.email}</b></p></div><span className={`sync sync-${s.state}`}><span className="sync-dot" />{{ local: 'Local', syncing: 'Syncing…', synced: 'Synced', offline: 'Offline', error: 'Sync failed' }[s.state]}</span></div>
      {s.message && <div className={`notice ${s.state === 'error' ? 'notice-err' : 'notice-warn'}`}><Icon name="alert" /> {s.message}</div>}
      <p className="muted fine">{s.at ? `Last synced ${new Date(s.at).toLocaleTimeString()}. ` : ''}Projects merge by last edit wins; snapshots are kept from every device.</p>
      <div className="inline wrap-gap">
        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(syncNow, 'Sync finished')}><Icon name="cloud" size={15} /> Sync now</button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(signOut, 'Signed out. Your projects stay on this device.')}>Sign out</button>
        <button className="btn btn-ghost btn-sm danger" onClick={() => setConfirm('cloud')}>Delete my cloud data</button>
        <button className="btn btn-ghost btn-sm danger" onClick={() => setConfirm('account')}>Delete my account</button>
      </div>
      {err && <p className="err">{err}</p>}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm === 'account' ? 'Delete your account?' : 'Delete cloud data?'}>
        <p>{confirm === 'account' ? 'This deletes your account and every project and snapshot stored in the cloud. Projects on this device are kept.' : 'This removes every Menu Margin project and snapshot from the cloud. Projects on this device are kept, and will re-upload if you sync again.'}</p>
        <div className="modal-acts">
          <button className="btn btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={() => { const c = confirm; setConfirm(null); run(c === 'account' ? deleteAccount : deleteCloudData, c === 'account' ? 'Account deleted' : 'Cloud data deleted') }}>Delete</button>
        </div>
      </Modal>
    </section>
  )
  return (
    <section className="card" id="account">
      <div className="card-head"><div><h2>Sync across devices (optional)</h2><p className="muted">Everything works signed out. An account copies your projects to the cloud so the office laptop and the kitchen tablet agree.</p></div></div>
      {s.message && <div className="notice notice-warn"><Icon name="alert" /> {s.message}</div>}
      <div className="seg"><button className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>Sign in</button><button className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>Create account</button></div>
      <form className="authform" onSubmit={(e) => { e.preventDefault(); run(() => (mode === 'in' ? signIn(email, pw) : signUp(email, pw)), mode === 'in' ? 'Signed in · syncing' : 'Account created · syncing') }}>
        <label className="field"><span>Email</span><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field"><span>Password</span><input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
      </form>
      {err && <p className="err">{err}</p>}
      <p className="muted fine">What syncs: ingredients, recipes, menu, column mappings, aggregated monthly sales, price-import results and snapshots. What stays on this device: the raw files you upload (they are parsed in the browser and never stored).</p>
    </section>
  )
}

export default function Settings() {
  const [mode, toggle] = useTheme()
  const [counts, setCounts] = useState({ p: 0, s: 0 })
  const [wipe, setWipe] = useState(false)
  useEffect(() => { Promise.all([listProjects(), allSnapshots()]).then(([p, s]) => setCounts({ p: p.length, s: s.length })) }, [wipe])
  useEffect(() => { if (location.hash) document.querySelector(location.hash)?.scrollIntoView() }, [])
  return (
    <>
      <Header inApp />
      <main id="main" className="wrap settings stack narrow">
        <div><p className="preheader dark">Settings</p><h1 className="h1">Settings</h1></div>
        <section className="card">
          <div className="card-head"><h2>Appearance</h2></div>
          <div className="seg"><button className={mode === 'light' ? 'on' : ''} onClick={() => mode !== 'light' && toggle()}><Icon name="sun" size={15} /> Light</button><button className={mode === 'dark' ? 'on' : ''} onClick={() => mode !== 'dark' && toggle()}><Icon name="moon" size={15} /> Dark</button></div>
        </section>
        <Account />
        <section className="card">
          <div className="card-head"><div><h2>Your data</h2><p className="muted">{counts.p} projects and {counts.s} snapshots in this browser.</p></div></div>
          <div className="inline wrap-gap">
            <button className="btn btn-secondary btn-sm" onClick={async () => download(`menu-margin-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportAll(), null, 2), 'application/json')}><Icon name="download" size={15} /> Export all my data (JSON)</button>
            <button className="btn btn-ghost btn-sm danger" onClick={() => setWipe(true)}><Icon name="trash" size={15} /> Clear this browser</button>
          </div>
        </section>
        <Modal open={wipe} onClose={() => setWipe(false)} title="Clear all local data?">
          <p>Removes every project and snapshot from this browser. Cloud copies (if you are signed in) are not touched.</p>
          <div className="modal-acts">
            <button className="btn btn-ghost" onClick={() => setWipe(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={async () => {
              const backup = await exportAll()
              await clearAll(); setWipe(false)
              toast('Local data cleared', { action: { label: 'Undo', run: async () => { for (const p of backup.projects) await putProject(p); for (const s of backup.snapshots) await putSnapshot(s); setCounts({ p: backup.projects.length, s: backup.snapshots.length }) } } })
            }}>Clear</button>
          </div>
        </Modal>
      </main>
      <Footer />
    </>
  )
}
