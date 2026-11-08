import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { Landing } from './Landing.tsx'
import { Footer, Header, Link, Toasts, usePath } from './ui.tsx'
import { initSync } from './sync.ts'

const Workspace = lazy(() => import('./Workspace.tsx'))
const Project = lazy(() => import('./project/Project.tsx'))
const Docs = lazy(() => import('./Docs.tsx'))
const Settings = lazy(() => import('./Settings.tsx'))

function Loading() {
  return <div className="page-loading" aria-busy="true"><span className="spinner" /> Loading…</div>
}

function NotFound() {
  return (
    <>
      <Header />
      <main className="wrap notfound">
        <p className="preheader dark">404</p>
        <h1 className="h1">This page is off the menu.</h1>
        <p className="lede">The link may be old, or the project was deleted on another device.</p>
        <div className="hero-ctas"><Link to="/" className="btn btn-primary">Home</Link><Link to="/app" className="btn btn-secondary">Workspace</Link></div>
      </main>
      <Footer />
    </>
  )
}

function App() {
  const path = usePath().replace(/\/+$/, '') || '/'
  let page
  const m = path.match(/^\/app\/([0-9a-f-]{36})(?:\/([a-z-]+))?(?:\/([a-z0-9-]+))?$/)
  if (path === '/') page = <Landing />
  else if (path === '/app') page = <Workspace />
  else if (m) page = <Project id={m[1]} tab={m[2] ?? 'overview'} sub={m[3]} />
  else if (path === '/docs') page = <Docs />
  else if (path === '/settings') page = <Settings />
  else page = <NotFound />
  return (
    <>
      <a href="#main" className="skip">Skip to content</a>
      <Suspense fallback={<Loading />}>{page}</Suspense>
      <Toasts />
    </>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
initSync()
