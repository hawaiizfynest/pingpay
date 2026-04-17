import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { getToken } from './hooks/useApi'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import Invoices from './pages/Invoices'
import Plans from './pages/Plans'
import SmsLog from './pages/SmsLog'
import Settings from './pages/Settings'

function Protected({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#18181e',
            color: '#e8e8f0',
            border: '1px solid #2a2a35',
            fontFamily: 'IBM Plex Sans, sans-serif',
            fontSize: '13px',
          },
          success: { iconTheme: { primary: '#00e89a', secondary: '#0a0a0c' } },
          error: { iconTheme: { primary: '#ff4a6e', secondary: '#0a0a0c' } },
        }}
      />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Protected><Layout /></Protected>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="customers" element={<Customers />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="plans" element={<Plans />} />
          <Route path="sms" element={<SmsLog />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
