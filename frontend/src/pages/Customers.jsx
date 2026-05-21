import { useState, useEffect } from 'react'
import { api } from '../hooks/useApi'
import toast from 'react-hot-toast'

const STATUS_BADGE = {
  active: 'badge-green',
  suspended: 'badge-yellow',
  cancelled: 'badge-gray',
}
const METHOD_LABEL = { zelle: '💳 Zelle', cash: '💵 Cash', apple_pay: '🍎 Apple Pay', card: '💳 Card (Stripe)' }
const CHANNEL_LABEL = { email: '✉ Email', sms: '💬 SMS' }

function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length > 0) return `+${digits}`
  return raw
}

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [c, p] = await Promise.all([api.get('/customers'), api.get('/plans')])
      setCustomers(c)
      setPlans(p)
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  function openAdd() { setSelected(null); setModal('add') }
  function openEdit(c) { setSelected(c); setModal('edit') }
  function openSms(c) { setSelected(c); setModal('sms') }
  function openView(c) { setSelected(c); setModal('view') }
  function close() { setModal(null); setSelected(null) }

  async function handleDelete(c) {
    if (!confirm(`Delete ${c.name}? This cannot be undone.`)) return
    try {
      await api.delete(`/customers/${c.id}`)
      toast.success('Customer deleted')
      load()
    } catch (err) { toast.error(err.message) }
  }

  const filtered = customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) || c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.plan_name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Customers <span style={{ color: 'var(--text3)', fontSize: 13, fontWeight: 400 }}>({customers.length})</span></div>
        <button className="btn-primary btn-sm" onClick={openAdd}>+ Add Customer</button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input placeholder="Search by name, phone, email, or plan..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 340 }} />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty"><div className="empty-icon">◈</div>No customers yet</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Channel</th>
                <th>Plan</th>
                <th>Next Due</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Payment</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td style={{ color: 'var(--text)', fontWeight: 500 }}>{c.name}</td>
                  <td className="mono" style={{ fontSize: 11 }}>
                    {c.email || ''}
                    {c.email && c.phone && <br />}
                    {c.phone || ''}
                  </td>
                  <td style={{ fontSize: 12 }}>{CHANNEL_LABEL[c.notification_channel] || CHANNEL_LABEL.email}</td>
                  <td>{c.plan_name || <span style={{ color: 'var(--text3)' }}>—</span>}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{c.next_due_date}</td>
                  <td>
                    {c.balance_due > 0
                      ? <span style={{ color: 'var(--yellow)', fontFamily: 'var(--mono)', fontSize: 12 }}>${c.balance_due.toFixed(2)}</span>
                      : <span style={{ color: 'var(--text3)' }}>$0.00</span>}
                  </td>
                  <td><span className={`badge ${STATUS_BADGE[c.status]}`}>{c.status}</span></td>
                  <td style={{ fontSize: 12 }}>{METHOD_LABEL[c.payment_method] || c.payment_method}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-ghost btn-sm" onClick={() => openView(c)} title="View">👁</button>
                      <button className="btn-ghost btn-sm" onClick={() => openSms(c)} title="Send message">✉</button>
                      <button className="btn-ghost btn-sm" onClick={() => openEdit(c)} title="Edit">✏</button>
                      <button className="btn-danger btn-sm" onClick={() => handleDelete(c)} title="Delete">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(modal === 'add' || modal === 'edit') && (
        <CustomerModal customer={selected} plans={plans} onClose={close} onSave={() => { close(); load() }} />
      )}
      {modal === 'sms' && selected && <SendSmsModal customer={selected} onClose={close} />}
      {modal === 'view' && selected && (
        <ViewCustomerModal customer={selected} onClose={close} onEdit={() => { setModal('edit') }} />
      )}
    </div>
  )
}

function CustomerModal({ customer, plans, onClose, onSave }) {
  const isEdit = !!customer
  const [form, setForm] = useState({
    name: customer?.name || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    plan_id: customer?.plan_id || '',
    billing_day: customer?.billing_day || 1,
    next_due_date: customer?.next_due_date || new Date().toISOString().split('T')[0],
    status: customer?.status || 'active',
    payment_method: customer?.payment_method || 'zelle',
    notification_channel: customer?.notification_channel || 'email',
    notes: customer?.notes || '',
  })
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    if (!form.name || !form.phone) return toast.error('Name and phone required')
    if (form.notification_channel === 'email' && !form.email) return toast.error('Email required for email notifications')
    const normalized = normalizePhone(form.phone)
    if (normalized.length < 10) return toast.error('Invalid phone number')
    setSaving(true)
    try {
      const payload = { ...form, phone: normalized }
      if (isEdit) await api.put(`/customers/${customer.id}`, payload)
      else await api.post('/customers', payload)
      toast.success(isEdit ? 'Customer updated' : 'Customer added')
      onSave()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{isEdit ? 'Edit Customer' : 'Add Customer'}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="form-grid">
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label>Full Name *</label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="John Smith" />
            </div>
            <div className="form-group">
              <label>Phone *</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="720-555-0000" />
              {form.phone && <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4, fontFamily: 'var(--mono)' }}>→ {normalizePhone(form.phone)}</div>}
            </div>
          </div>

          <div className="form-group">
            <label>Email {form.notification_channel === 'email' && <span style={{ color: 'var(--accent)' }}>*</span>}</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="john@example.com" />
          </div>

          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label>Notification Channel</label>
              <select value={form.notification_channel} onChange={e => set('notification_channel', e.target.value)}>
                <option value="email">✉ Email</option>
                <option value="sms">💬 SMS</option>
              </select>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                How customer receives reminders & receipts
              </div>
            </div>
            <div className="form-group">
              <label>Payment Method</label>
              <select value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
                <option value="zelle">Zelle</option>
                <option value="apple_pay">Apple Pay</option>
                <option value="cash">Cash</option>
                <option value="card">Card (Stripe)</option>
              </select>
            </div>
          </div>

          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label>Service Plan</label>
              <select value={form.plan_id} onChange={e => set('plan_id', e.target.value)}>
                <option value="">— No plan —</option>
                {plans.map(p => <option key={p.id} value={p.id}>{p.name} (${p.price}/{p.billing_cycle})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Next Due Date *</label>
            <input type="date" value={form.next_due_date} onChange={e => set('next_due_date', e.target.value)} />
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Internal notes..." style={{ resize: 'vertical' }} />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" /> : (isEdit ? 'Save Changes' : 'Add Customer')}
          </button>
        </div>
      </div>
    </div>
  )
}

function SendSmsModal({ customer, onClose }) {
  const [msg, setMsg] = useState('')
  const [subject, setSubject] = useState('')
  const [sending, setSending] = useState(false)
  const isEmail = customer.notification_channel === 'email'

  async function send() {
    if (!msg.trim()) return toast.error('Message required')
    if (isEmail && !subject.trim()) return toast.error('Subject required for email')
    setSending(true)
    try {
      await api.post(`/customers/${customer.id}/sms`, { message: msg, subject })
      toast.success(`${isEmail ? 'Email' : 'SMS'} sent!`)
      onClose()
    } catch (err) { toast.error(err.message) }
    finally { setSending(false) }
  }

  const templates = [
    `Hi ${customer.name}, your payment is due soon. Reply PAY for instructions.`,
    `Hi ${customer.name}, we noticed your invoice is overdue. Please reply PAY to see payment options.`,
    `Hi ${customer.name}, your service has been renewed. Thank you!`,
    `Hi ${customer.name}, please contact us at your earliest convenience regarding your account.`,
  ]

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>Send {isEmail ? 'Email' : 'SMS'} to {customer.name}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>QUICK TEMPLATES</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {templates.map((t, i) => (
              <button key={i} className="btn-ghost btn-sm" style={{ textAlign: 'left', whiteSpace: 'normal', height: 'auto', padding: '8px 12px' }} onClick={() => setMsg(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {isEmail && (
          <div className="form-group">
            <label>Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Message subject..." />
          </div>
        )}

        <div className="form-group">
          <label>Message</label>
          <textarea rows={4} value={msg} onChange={e => setMsg(e.target.value)} placeholder="Type a custom message..." style={{ resize: 'vertical' }} />
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
            {msg.length} chars — To: {isEmail ? customer.email : customer.phone}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={send} disabled={sending || !msg.trim()}>
            {sending ? <span className="spinner" /> : `↑ Send ${isEmail ? 'Email' : 'SMS'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function ViewCustomerModal({ customer, onClose, onEdit }) {
  const [invoices, setInvoices] = useState([])
  const [smsLog, setSmsLog] = useState([])
  const [tab, setTab] = useState('invoices')

  useEffect(() => {
    api.get(`/customers/${customer.id}/invoices`).then(setInvoices).catch(() => {})
    api.get(`/customers/${customer.id}/sms`).then(setSmsLog).catch(() => {})
  }, [customer.id])

  async function markPaid(inv) {
    const method = prompt('Payment method? (zelle / apple_pay / cash / card)', customer.payment_method)
    if (!method) return
    try {
      await api.put(`/invoices/${inv.id}/pay`, { payment_method: method, send_receipt: true })
      toast.success('Marked paid & receipt sent')
      api.get(`/customers/${customer.id}/invoices`).then(setInvoices)
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-wide">
        <div className="modal-header">
          <div>
            <h2>{customer.name}</h2>
            <div style={{ color: 'var(--text3)', fontSize: 12 }}>
              {customer.email && <span>{customer.email} · </span>}
              {customer.phone} · {customer.plan_name || 'No plan'} · {CHANNEL_LABEL[customer.notification_channel] || 'Email'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost btn-sm" onClick={onEdit}>✏ Edit</button>
            <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['invoices', 'sms'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={tab === t ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
              style={{ textTransform: 'capitalize' }}>
              {t === 'invoices' ? `Invoices (${invoices.length})` : `Messages (${smsLog.length})`}
            </button>
          ))}
        </div>

        {tab === 'invoices' && (
          <table>
            <thead><tr><th>Invoice</th><th>Amount</th><th>Due</th><th>Status</th><th>Paid</th><th></th></tr></thead>
            <tbody>
              {invoices.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text3)', padding: 24 }}>No invoices</td></tr>}
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td className="mono" style={{ fontSize: 11 }}>#{inv.id}</td>
                  <td className="mono">${inv.amount.toFixed(2)}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{inv.due_date}</td>
                  <td><span className={`badge ${inv.status === 'paid' ? 'badge-green' : inv.status === 'overdue' ? 'badge-red' : inv.status === 'waived' ? 'badge-gray' : 'badge-yellow'}`}>{inv.status}</span></td>
                  <td className="mono" style={{ fontSize: 11 }}>{inv.paid_date || '—'}</td>
                  <td>
                    {(inv.status === 'pending' || inv.status === 'overdue') &&
                      <button className="btn-success btn-sm" onClick={() => markPaid(inv)}>✓ Mark Paid</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'sms' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
            {smsLog.length === 0 && <div className="empty"><div>No message history</div></div>}
            {smsLog.map(s => (
              <div key={s.id} style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: s.direction === 'inbound' ? 'rgba(0,212,255,0.06)' : 'var(--bg3)',
                borderLeft: `3px solid ${s.direction === 'inbound' ? 'var(--accent)' : 'var(--border2)'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: s.direction === 'inbound' ? 'var(--accent)' : 'var(--text3)' }}>
                    {s.direction.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text3)' }}>{new Date(s.created_at).toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{s.message}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
