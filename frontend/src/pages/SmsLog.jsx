import { useState, useEffect } from 'react'
import { api } from '../hooks/useApi'
import toast from 'react-hot-toast'

export default function SmsLog() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => { load() }, [])

  async function load() {
    try { setLogs(await api.get('/sms/log?limit=200')) }
    catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const filtered = filter === 'all' ? logs : logs.filter(l => l.direction === filter)

  return (
    <div>
      <div className="page-header">
        <div className="page-title">SMS Log</div>
        <button className="btn-ghost btn-sm" onClick={load}>↺ Refresh</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {['all', 'inbound', 'outbound'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={filter === f ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
            style={{ textTransform: 'capitalize' }}>
            {f}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text3)', alignSelf: 'center' }}>{filtered.length} messages</span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty"><div className="empty-icon">◫</div>No messages yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(log => (
            <div key={log.id} style={{
              padding: '12px 16px',
              borderRadius: 6,
              background: 'var(--bg2)',
              border: `1px solid ${log.direction === 'inbound' ? 'rgba(0,212,255,0.2)' : 'var(--border)'}`,
              borderLeft: `3px solid ${log.direction === 'inbound' ? 'var(--accent)' : 'var(--border2)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{
                    fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: '0.08em',
                    color: log.direction === 'inbound' ? 'var(--accent)' : 'var(--text3)',
                    background: log.direction === 'inbound' ? 'rgba(0,212,255,0.08)' : 'var(--bg3)',
                    padding: '2px 6px', borderRadius: 3
                  }}>
                    {log.direction.toUpperCase()}
                  </span>
                  <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)' }}>
                    {log.customer_name || log.phone}
                  </span>
                  {log.customer_name && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{log.phone}</span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text2)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {log.message}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
