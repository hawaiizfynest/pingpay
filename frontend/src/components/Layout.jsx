import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { clearToken } from '../hooks/useApi'
import './Layout.css'

const nav = [
  { to: '/dashboard', icon: '▦', label: 'Dashboard' },
  { to: '/customers', icon: '◈', label: 'Customers' },
  { to: '/invoices', icon: '◉', label: 'Invoices' },
  { to: '/plans', icon: '◎', label: 'Plans' },
  { to: '/sms', icon: '◫', label: 'SMS Log' },
  { to: '/settings', icon: '◬', label: 'Settings' },
]

export default function Layout() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  function logout() {
    clearToken()
    navigate('/login')
  }

  function closeDrawer() {
    setOpen(false)
  }

  return (
    <div className="layout">
      {/* Mobile header */}
      <div className="mobile-header">
        <div className="mobile-brand">
          <span className="mobile-brand-icon">⬡</span>
          PingPay
        </div>
        <button className={`hamburger ${open ? 'open' : ''}`} onClick={() => setOpen(o => !o)} aria-label="Menu">
          <span /><span /><span />
        </button>
      </div>

      {/* Drawer overlay — tap to close */}
      <div className={`drawer-overlay ${open ? 'open' : ''}`} onClick={closeDrawer} />

      {/* Sidebar / Drawer */}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <span className="brand-icon">⬡</span>
          <div>
            <div className="brand-name">PingPay</div>
            <div className="brand-sub">Billing System</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {nav.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={closeDrawer}
            >
              <span className="nav-icon">{icon}</span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button onClick={logout} className="logout-btn">
            <span>⏻</span> Sign Out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
