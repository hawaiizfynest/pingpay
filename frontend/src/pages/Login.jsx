import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api, setToken, getToken } from '../hooks/useApi'
import { Navigate } from 'react-router-dom'
import './Login.css'

export default function Login() {
  if (getToken()) return <Navigate to="/dashboard" replace />

  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attemptsLeft, setAttemptsLeft] = useState(null)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api.post('/auth/login', form)
      setToken(data.token)
      navigate('/dashboard')
    } catch (err) {
      const msg = err.message || 'Login failed'
      setError(msg)

      // Extract attempts remaining from error if present
      if (msg.includes('locked')) {
        setAttemptsLeft(0)
      } else if (err.attemptsLeft !== undefined) {
        setAttemptsLeft(err.attemptsLeft)
      }

      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const isLocked = attemptsLeft === 0 || (error && error.includes('locked'))

  return (
    <div className="login-page">
      <div className="login-bg">
        <div className="login-grid" />
      </div>
      <div className="login-card">
        <div className="login-brand">
          <span className="login-icon">⬡</span>
          <h1>PingPay</h1>
          <p>Billing Management System</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              placeholder="admin"
              value={form.username}
              onChange={e => { setForm(f => ({ ...f, username: e.target.value })); setError('') }}
              required
              autoFocus
              disabled={isLocked}
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setError('') }}
              required
              disabled={isLocked}
            />
          </div>

          {error && (
            <div style={{
              background: isLocked ? 'rgba(255,74,110,0.1)' : 'rgba(255,200,74,0.08)',
              border: `1px solid ${isLocked ? 'rgba(255,74,110,0.3)' : 'rgba(255,200,74,0.25)'}`,
              borderRadius: 6,
              padding: '10px 14px',
              fontSize: 12,
              color: isLocked ? 'var(--red)' : 'var(--yellow)',
              lineHeight: 1.5,
            }}>
              {error}
              {attemptsLeft !== null && attemptsLeft > 0 && (
                <div style={{ marginTop: 4, opacity: 0.8 }}>
                  {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining before lockout
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary login-submit"
            disabled={loading || isLocked}
          >
            {loading ? <span className="spinner" /> : isLocked ? '🔒 Account Locked' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
