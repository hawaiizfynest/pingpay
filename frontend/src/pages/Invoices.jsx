import { useState, useEffect } from 'react'
import { api } from '../hooks/useApi'
import toast from 'react-hot-toast'

const STATUS_BADGE = { pending: 'badge-yellow', paid: 'badge-green', overdue: 'badge-red', waived: 'badge-gray' }

export default function Invoices() {
  const [invoices, setInvoices] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [inv, cust] = await Promise.all([api.get('/invoices'), api.get('/customers')])
      setInvoices(inv)
      setCustomers(cust)
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  async function markPaid(inv) {
    const customer = customers.find(c => c.id === inv.customer_id)
    const method = prompt('Payment method? (zelle / apple_pay / cash)', customer?.payment_method || 'zelle')
    if (!method) return
    try {
      await api.put(`/invoices/${inv.id}/pay`, { payment_method: method, send_receipt: true })
      toast.success('Marked paid — receipt SMS sent ✓')
      load()
    } catch (err) { toast.error(err.message) }
  }

  async function deleteInv(inv) {
    if (!confirm('Delete this invoice?')) return
    try {
      await api.delete(`/invoices/${inv.id}`)
      toast.success('Invoice deleted')
      load()
    } catch (err) { toast.error(err.message) }
  }

  const filtered = filter === 'all' ? invoices : invoices.filter(i => i.status === filter)
  const totals = {
    pending: invoices.filter(i => i.status === 'pending').reduce((s, i) => s + i.amount, 0),
    overdue: invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.amount, 0),
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Invoices</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost btn-sm" onClick={() => setModal('create')}>+ Create Invoice</button>
        </div>
      </div>

      {(totals.pending > 0 || totals.overdue > 0) && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {totals.pending > 0 && (
            <div style={{ background: 'rgba(255,200,74,0.06)', border: '1px solid rgba(255,200,74,0.2)', borderRadius: 6, padding: '10px 16px', fontSize: 13 }}>
              <span style={{ color: 'var(--text3)' }}>Pending: </span>
              <span style={{ color: 'var(--yellow)', fontFamily: 'var(--mono)', fontWeight: 600 }}>${totals.pending.toFixed(2)}</span>
            </div>
          )}
          {totals.overdue > 0 && (
            <div style={{ background: 'rgba(255,74,110,0.06)', border: '1px solid rgba(255,74,110,0.2)', borderRadius: 6, padding: '10px 16px', fontSize: 13 }}>
              <span style={{ color: 'var(--text3)' }}>Overdue: </span>
              <span style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontWeight: 600 }}>${totals.overdue.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {['all', 'pending', 'overdue', 'paid', 'waived'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={filter === s ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
            style={{ textTransform: 'capitalize' }}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty"><div className="empty-icon">◉</div>No invoices</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>#</th><th>Customer</th><th>Amount</th><th>Due Date</th><th>Status</th><th>Paid On</th><th>Method</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id}>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--text3)' }}>#{inv.id}</td>
                  <td style={{ color: 'var(--text)', fontWeight: 500 }}>{inv.customer_name}</td>
                  <td className="mono" style={{ fontWeight: 600 }}>${inv.amount.toFixed(2)}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{inv.due_date}</td>
                  <td><span className={`badge ${STATUS_BADGE[inv.status]}`}>{inv.status}</span></td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{inv.paid_date || '—'}</td>
                  <td style={{ fontSize: 12 }}>{inv.payment_method ? { zelle: '💳 Zelle', cash: '💵 Cash', apple_pay: '🍎 Apple Pay' }[inv.payment_method] : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(inv.status === 'pending' || inv.status === 'overdue') && (
                        <button className="btn-success btn-sm" onClick={() => markPaid(inv)}>✓ Paid</button>
                      )}
                      <button className="btn-danger btn-sm" onClick={() => deleteInv(inv)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal === 'create' && (
        <CreateInvoiceModal customers={customers} onClose={() => setModal(null)} onSave={() => { setModal(null); load() }} />
      )}
    </div>
  )
}

function CreateInvoiceModal({ customers, onClose, onSave }) {
  const [form, setForm] = useState({ customer_id: '', amount: '', due_date: '', notes: '' })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.customer_id || !form.amount || !form.due_date) return toast.error('All fields required')
    setSaving(true)
    try {
      await api.post('/invoices', { ...form, amount: parseFloat(form.amount) })
      toast.success('Invoice created')
      onSave()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  // Auto-fill amount from customer plan
  function onCustomerChange(id) {
    setForm(f => ({ ...f, customer_id: id }))
    const c = customers.find(c => String(c.id) === String(id))
    if (c?.price) setForm(f => ({ ...f, customer_id: id, amount: String(c.price) }))
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>Create Invoice</h2>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label>Customer *</label>
            <select value={form.customer_id} onChange={e => onCustomerChange(e.target.value)}>
              <option value="">— Select customer —</option>
              {customers.filter(c => c.status === 'active').map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
              ))}
            </select>
          </div>
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label>Amount ($) *</label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="form-group">
              <label>Due Date *</label>
              <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional note..." />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <span className="spinner" /> : 'Create Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}
