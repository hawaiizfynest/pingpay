import { useState, useEffect } from 'react'
import { api } from '../hooks/useApi'
import toast from 'react-hot-toast'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    try {
      const data = await api.get('/sms/dashboard')
      setStats(data)
    } catch (err) {
      toast.error('Failed to load stats')
    } finally {
      setLoading(false)
    }
  }

  async function triggerReminders() {
    setTriggering(true)
    try {
      await api.post('/sms/run-reminders')
      toast.success('Reminder check triggered')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setTriggering(false)
    }
  }

  if (loading) return <div style={{ color: 'var(--text3)', padding: '40px' }}><span className="spinner" /></div>

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 4 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
        <button className="btn-ghost btn-sm" onClick={triggerReminders} disabled={triggering}>
          {triggering ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '↺'}
          Run Reminders Now
        </button>
      </div>

      <div className="stat-grid" style={{ marginBottom: 28 }}>
        <StatCard label="Active Customers" value={stats.total_customers} color="accent" />
        <StatCard label="This Month" value={`$${stats.this_month_revenue.toFixed(2)}`} color="green" />
        <StatCard label="Pending Invoices" value={stats.pending_invoices} sub={`$${stats.pending_amount.toFixed(2)} owed`} color="yellow" />
        <StatCard label="Overdue Invoices" value={stats.overdue_invoices} sub={`$${stats.overdue_amount.toFixed(2)} overdue`} color="red" />
        <StatCard label="Total Revenue" value={`$${stats.total_revenue.toFixed(2)}`} color="purple" />
        <StatCard label="SMS (24h)" value={stats.recent_sms} color="accent" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <QuickActions />
        <CommandGuide />
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, color }) {
  const colorMap = {
    accent: 'var(--accent)',
    green: 'var(--green)',
    yellow: 'var(--yellow)',
    red: 'var(--red)',
    purple: 'var(--purple)',
  }
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: colorMap[color] }}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

function QuickActions() {
  return (
    <div className="card">
      <h3 style={{ marginBottom: 14, color: 'var(--text2)' }}>Quick Actions</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <a href="/customers" style={{ textDecoration: 'none' }}>
          <div className="quick-action-item">◈ Add New Customer</div>
        </a>
        <a href="/invoices" style={{ textDecoration: 'none' }}>
          <div className="quick-action-item">◉ Create Invoice</div>
        </a>
        <a href="/invoices?status=overdue" style={{ textDecoration: 'none' }}>
          <div className="quick-action-item" style={{ color: 'var(--red)' }}>⚠ View Overdue Invoices</div>
        </a>
        <a href="/sms" style={{ textDecoration: 'none' }}>
          <div className="quick-action-item">◫ View SMS Log</div>
        </a>
        <a href="/plans" style={{ textDecoration: 'none' }}>
          <div className="quick-action-item">◎ Manage Plans</div>
        </a>
      </div>
    </div>
  )
}

function CommandGuide() {
  const cmds = [
    { cmd: 'BALANCE', desc: 'Current balance & amount owed' },
    { cmd: 'DUE', desc: 'Next payment due date' },
    { cmd: 'PLAN', desc: 'Their service plan details' },
    { cmd: 'PAY', desc: 'Payment instructions for their method' },
    { cmd: 'RECEIPT', desc: 'Last payment receipt' },
    { cmd: 'STATUS', desc: 'Full account overview' },
    { cmd: 'HELP', desc: 'Show all commands' },
  ]
  return (
    <div className="card">
      <h3 style={{ marginBottom: 14, color: 'var(--text2)' }}>Customer SMS Commands</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {cmds.map(c => (
          <div key={c.cmd} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, background: 'var(--bg3)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 4, minWidth: 70, textAlign: 'center' }}>{c.cmd}</span>
            <span style={{ color: 'var(--text3)', fontSize: 12 }}>{c.desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Inject quick action style
const style = document.createElement('style')
style.textContent = `.quick-action-item { padding: 10px 14px; border-radius: 6px; background: var(--bg3); color: var(--text2); font-size: 13px; cursor: pointer; transition: all 0.12s; } .quick-action-item:hover { background: var(--border); color: var(--text); }`
document.head.appendChild(style)
