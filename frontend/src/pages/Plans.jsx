import { useState, useEffect } from 'react'
import { api } from '../hooks/useApi'
import toast from 'react-hot-toast'

export default function Plans() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    try { setPlans(await api.get('/plans')) }
    catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  async function deletePlan(p) {
    if (!confirm(`Delete plan "${p.name}"?`)) return
    try {
      await api.delete(`/plans/${p.id}`)
      toast.success('Plan deleted')
      load()
    } catch (err) { toast.error(err.message) }
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Service Plans</div>
        <button className="btn-primary btn-sm" onClick={() => { setSelected(null); setModal('form') }}>+ New Plan</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>
      ) : plans.length === 0 ? (
        <div className="empty"><div className="empty-icon">◎</div>No plans yet — create one to get started</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {plans.map(p => (
            <div key={p.id} className="card" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{p.description}</div>
                </div>
                <span className="badge badge-blue" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                  ${p.price}/{p.billing_cycle === 'monthly' ? 'mo' : p.billing_cycle === 'quarterly' ? 'qtr' : 'yr'}
                </span>
              </div>

              {p.features && (
                <div style={{ fontSize: 12, color: 'var(--text2)', borderTop: '1px solid var(--border)', paddingTop: 10, marginBottom: 10, whiteSpace: 'pre-line' }}>
                  {p.features}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{p.customer_count} active customer{p.customer_count !== 1 ? 's' : ''}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-ghost btn-sm" onClick={() => { setSelected(p); setModal('form') }}>✏ Edit</button>
                  <button className="btn-danger btn-sm" onClick={() => deletePlan(p)}>✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal === 'form' && (
        <PlanModal plan={selected} onClose={() => setModal(null)} onSave={() => { setModal(null); load() }} />
      )}
    </div>
  )
}

function PlanModal({ plan, onClose, onSave }) {
  const isEdit = !!plan
  const [form, setForm] = useState({
    name: plan?.name || '',
    description: plan?.description || '',
    price: plan?.price || '',
    billing_cycle: plan?.billing_cycle || 'monthly',
    features: plan?.features || '',
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!form.name || !form.price) return toast.error('Name and price required')
    setSaving(true)
    try {
      if (isEdit) await api.put(`/plans/${plan.id}`, form)
      else await api.post('/plans', { ...form, price: parseFloat(form.price) })
      toast.success(isEdit ? 'Plan updated' : 'Plan created')
      onSave()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2>{isEdit ? 'Edit Plan' : 'New Plan'}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label>Plan Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Basic NAS, Pro Storage..." />
          </div>
          <div className="form-group">
            <label>Description</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description" />
          </div>
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label>Price ($) *</label>
              <input type="number" step="0.01" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="form-group">
              <label>Billing Cycle *</label>
              <select value={form.billing_cycle} onChange={e => setForm(f => ({ ...f, billing_cycle: e.target.value }))}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Features (shown to customers via SMS)</label>
            <textarea rows={4} value={form.features} onChange={e => setForm(f => ({ ...f, features: e.target.value }))} placeholder="• 1TB Storage&#10;• 24/7 Access&#10;• Daily Backups" style={{ resize: 'vertical' }} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? <span className="spinner" /> : (isEdit ? 'Save Changes' : 'Create Plan')}
          </button>
        </div>
      </div>
    </div>
  )
}
