import { useState, useEffect } from 'react'
import { api } from '../hooks/useApi'
import toast from 'react-hot-toast'

export default function Settings() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pw, setPw] = useState({ current: '', new: '', confirm: '' })
  const [changingPw, setChangingPw] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const s = await api.get('/sms/settings')
      // Parse reminder_days if JSON
      if (s.reminder_days) {
        try { s.reminder_days = JSON.parse(s.reminder_days).join(', ') } catch {}
      }
      setSettings(s)
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  async function save() {
    setSaving(true)
    try {
      // Convert reminder_days back to JSON array
      const payload = { ...settings }
      if (payload.reminder_days) {
        const days = payload.reminder_days.split(',').map(d => parseInt(d.trim())).filter(Boolean)
        payload.reminder_days = JSON.stringify(days)
      }
      await api.put('/sms/settings', payload)
      toast.success('Settings saved')
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  async function changePassword() {
    if (!pw.current || !pw.new) return toast.error('All fields required')
    if (pw.new !== pw.confirm) return toast.error('Passwords do not match')
    if (pw.new.length < 8) return toast.error('Password must be at least 8 characters')
    setChangingPw(true)
    try {
      await api.post('/auth/change-password', { currentPassword: pw.current, newPassword: pw.new })
      toast.success('Password changed successfully')
      setPw({ current: '', new: '', confirm: '' })
    } catch (err) { toast.error(err.message) }
    finally { setChangingPw(false) }
  }

  function set(k, v) { setSettings(s => ({ ...s, [k]: v })) }

  if (loading || !settings) return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>

  return (
    <div style={{ maxWidth: 680 }}>
      <div className="page-header" style={{ marginBottom: 28 }}>
        <div className="page-title">Settings</div>
      </div>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--text2)', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>Business Info</h3>
        <div className="form-grid" style={{ gap: 14 }}>
          <div className="form-group">
            <label>Business Name</label>
            <input value={settings.business_name || ''} onChange={e => set('business_name', e.target.value)} placeholder="My PingPay" />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Appears in all SMS messages sent to customers</div>
          </div>
          <div className="form-grid form-grid-2">
            <div className="form-group">
              <label>Support Phone</label>
              <input value={settings.support_phone || ''} onChange={e => set('support_phone', e.target.value)} placeholder="+1 555-000-0000" />
            </div>
            <div className="form-group">
              <label>Support Email</label>
              <input value={settings.support_email || ''} onChange={e => set('support_email', e.target.value)} placeholder="support@example.com" />
            </div>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--text2)', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>Payment Instructions</h3>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
          These are sent to customers when they reply <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', background: 'rgba(0,212,255,0.08)', padding: '1px 6px', borderRadius: 3 }}>PAY</span> — include your handle/address/instructions.
        </div>
        <div className="form-grid" style={{ gap: 14 }}>
          <div className="form-group">
            <label>💳 Zelle Instructions</label>
            <input value={settings.zelle_info || ''} onChange={e => set('zelle_info', e.target.value)} placeholder="Send to: yourname@email.com or 555-000-0000" />
          </div>
          <div className="form-group">
            <label>🍎 Apple Pay Instructions</label>
            <input value={settings.apple_pay_info || ''} onChange={e => set('apple_pay_info', e.target.value)} placeholder="Apple Pay to: $YourCashtag or 555-000-0000" />
          </div>
          <div className="form-group">
            <label>💵 Cash Instructions</label>
            <input value={settings.cash_info || ''} onChange={e => set('cash_info', e.target.value)} placeholder="Contact us to arrange cash drop-off or pickup" />
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--text2)', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>Reminder Schedule</h3>
        <div className="form-group">
          <label>Send reminders X days before due</label>
          <input value={settings.reminder_days || '7, 3, 1'} onChange={e => set('reminder_days', e.target.value)} placeholder="7, 3, 1" />
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
            Comma-separated list. Example: <span style={{ fontFamily: 'var(--mono)' }}>7, 3, 1</span> sends reminders 7 days, 3 days, and 1 day before the due date.
          </div>
        </div>
      </section>

      <div style={{ marginBottom: 32 }}>
        <button className="btn-primary" onClick={save} disabled={saving} style={{ minWidth: 140, justifyContent: 'center' }}>
          {saving ? <span className="spinner" /> : '✓ Save Settings'}
        </button>
      </div>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ color: 'var(--text2)', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>Change Password</h3>
        <div className="form-grid" style={{ gap: 14, maxWidth: 400 }}>
          <div className="form-group">
            <label>Current Password</label>
            <input type="password" value={pw.current} onChange={e => setPw(p => ({ ...p, current: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>New Password</label>
            <input type="password" value={pw.new} onChange={e => setPw(p => ({ ...p, new: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Confirm New Password</label>
            <input type="password" value={pw.confirm} onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))} />
          </div>
          <button className="btn-ghost" onClick={changePassword} disabled={changingPw} style={{ alignSelf: 'flex-start' }}>
            {changingPw ? <span className="spinner" /> : 'Update Password'}
          </button>
        </div>
      </section>

      <section>
        <h3 style={{ color: 'var(--text2)', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>Twilio Setup</h3>
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: 16, fontSize: 12, color: 'var(--text3)' }}>
          <p style={{ marginBottom: 8 }}>Configure in your <span style={{ fontFamily: 'var(--mono)' }}>.env</span> file:</p>
          <pre style={{ fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.8, color: 'var(--text2)' }}>
{`TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
PUBLIC_URL=https://your-domain.com`}
          </pre>
          <p style={{ marginTop: 10 }}>Set Twilio inbound webhook to: <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>https://your-domain.com/api/sms/inbound</span></p>
        </div>
      </section>
    </div>
  )
}
