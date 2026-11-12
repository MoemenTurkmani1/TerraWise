import { useEffect, useRef, useState } from 'react'
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom'
import { ArrowUpRight, Bell, ChevronDown, CircleHelp, Database, History, LayoutDashboard, Leaf, Map, Menu, PanelLeftClose, ScanLine, Search, Settings, Sprout, Workflow, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'

const navigation = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/fields', label: 'My fields', icon: Map },
  { to: '/analysis', label: 'Analyze my land', icon: ScanLine },
  { to: '/recommendations', label: 'Crop recommendations', icon: Sprout },
  { to: '/planner', label: 'Rotation planner', icon: Workflow },
  { to: '/history', label: 'Analysis history', icon: History },
]
export function Logo({ compact = false }: { compact?: boolean }) { return <Link to="/" className="brand" aria-label="TerraWise home"><span className="brand-symbol"><Sprout size={27} strokeWidth={1.7} /></span>{!compact && <span>Terra<span className="brand-light">Wise</span><span className="brand-dot">.</span></span>}</Link> }
export default function Layout() {
  const [open, setOpen] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const [notifications, setNotifications] = useState(false)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInput = useRef<HTMLInputElement>(null)
  const { fields, preferences, storageError, syncState, retrySync } = useApp()
  const { user } = useAuth()
  const location = useLocation()
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)')
    const update = () => setMobile(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!open || !mobile) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open, mobile])
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && window.innerWidth > 1190) { event.preventDefault(); searchInput.current?.focus(); setSearchOpen(true) }
      if (event.key === 'Escape') { setOpen(false); setSearchOpen(false); setNotifications(false) }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [])
  const section = location.pathname === '/' ? 'Overview' : location.pathname.startsWith('/fields') ? 'My fields' : location.pathname.startsWith('/analysis') ? 'Analyze my land' : location.pathname.startsWith('/history') ? 'Analysis history' : location.pathname.startsWith('/recommendations') ? 'Crop recommendations' : location.pathname.startsWith('/planner') ? 'Rotation planner' : location.pathname.startsWith('/settings') ? 'Settings' : 'Data & sources'
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    {open && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${open ? 'is-open' : ''}`} inert={mobile && !open} aria-hidden={mobile && !open ? true : undefined}>
      <div className="sidebar-brand"><Logo /><button className="icon-btn mobile-only" onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button></div>
      <div className="workspace-label">YOUR WORKSPACE <span>FARMER</span></div>
      <nav className="main-navigation" aria-label="Main navigation">{navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={19} strokeWidth={1.7} /><span>{label}</span>{to === '/fields' && <span className="nav-count">{fields.filter(field => !field.archived).length}</span>}</NavLink>)}</nav>
      <div className="nav-divider" />
      <nav className="secondary-navigation" aria-label="Account navigation"><NavLink to="/data-sources" onClick={() => setOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Database size={18} strokeWidth={1.7} />Data & sources<span className="tiny-dot" /></NavLink><NavLink to="/settings" onClick={() => setOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Settings size={19} strokeWidth={1.7} />Settings</NavLink></nav>
      <div className="sidebar-bottom"><div className="grow-card"><div className="grow-icon"><Leaf size={21} /></div><h3>Good for your land.<br />Better for your future.</h3><p>Small decisions today.<br />Healthier harvests tomorrow.</p><Link to="/about">Meet TerraWise <ArrowUpRight size={15} /></Link></div><Link to="/data-sources" className="help-link"><CircleHelp size={17} />Help & getting started<ArrowUpRight size={14} /></Link><div className="sidebar-footer"><span className="tiny-dot" />{user ? 'Account workspace' : 'Local workspace'}<span>v1.0</span><PanelLeftClose size={14} /></div></div>
    </aside>
    <div className="app-main">
      <header className="topbar"><div className="topbar-breadcrumb"><button className="icon-btn mobile-only" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={22} /></button><span className="breadcrumb-home">My workspace</span><span className="breadcrumb-slash">/</span><span>{section}</span></div><div className="topbar-controls"><div className="global-search"><Search size={16} /><input ref={searchInput} aria-label="Search fields" placeholder="Search your fields..." value={search} onFocus={() => setSearchOpen(true)} onChange={event => { setSearch(event.target.value); setSearchOpen(true) }} onKeyDown={event => { if (event.key === 'Escape') setSearchOpen(false) }} /><kbd>⌘ K</kbd>{searchOpen && <><button className="search-dismiss" aria-label="Close search results" onClick={() => setSearchOpen(false)} /><div className="search-results"><p>YOUR FIELDS</p>{fields.filter(f => f.name.toLowerCase().includes(search.toLowerCase()) || f.location.toLowerCase().includes(search.toLowerCase())).map(f => <Link key={f.id} to={`/fields/${f.id}`} onClick={() => { setSearchOpen(false); setSearch('') }}><Map size={16} /><span>{f.name}<small>{f.location}</small></span><ArrowUpRight size={14} /></Link>)}{!fields.some(f => f.name.toLowerCase().includes(search.toLowerCase()) || f.location.toLowerCase().includes(search.toLowerCase())) && <span className="search-empty">No fields found. Try another name.</span>}</div></>}</div><span className="topbar-divider" /><div className="notification-wrap"><button className="icon-btn notification-btn" aria-label="View notifications" aria-expanded={notifications} onClick={() => setNotifications(!notifications)}><Bell size={19} /><span /></button>{notifications && <div className="notification-popover"><strong>You’re all caught up</strong><p>{user ? 'Your account workspace is ready. Add a field or explore a rotation.' : 'Your local workspace is ready. Add a field or explore your first rotation.'}</p><Link to="/fields/new" onClick={() => setNotifications(false)}>Add a field <ArrowUpRight size={14} /></Link></div>}</div><Link to="/settings" className="user-menu"><span className="avatar">{preferences.name.slice(0, 1).toUpperCase() || 'F'}</span><span className="user-text"><strong>{preferences.name || 'Farmer'}</strong><small>{user ? syncState === 'synced' ? 'Account synced' : syncState === 'syncing' ? 'Syncing' : 'Check sync' : 'Local workspace'}</small></span><ChevronDown size={14} /></Link></div></header>
      <main id="main-content" className="main-content">{!online && <div className="notice notice-warning" role="status">You are offline. Local guest records and previously loaded pages may be available; NASA and cloud services require a connection.</div>}{user && syncState === 'syncing' && <div className="notice notice-info" role="status">Saving changes to your account workspace…</div>}{storageError && <div className="notice notice-warning" role="alert">{storageError} {user && syncState === 'error' && <button className="sync-retry" onClick={() => { void retrySync().catch(() => {}) }}>Retry saving</button>}</div>}<Outlet /></main>
      <footer className="app-footer"><span>Thoughtful decisions. Thriving land.</span><span><span className="tiny-dot" />{user ? 'Account workspace · Your field entries' : 'Local workspace · Your field entries'}<Link to="/data-sources">About your data <ArrowUpRight size={12} /></Link></span></footer>
    </div>
  </div>
}
