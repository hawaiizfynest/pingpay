const express = require('express');
const auth = require('../middleware/auth');
const { getDb } = require('../db/database');
const { handleInbound, sendSms, runReminderCheck } = require('../services/smsService');
const twilio = require('twilio');

const router = express.Router();

// Twilio inbound webhook
router.post('/inbound', express.urlencoded({ extended: false }), async (req, res) => {
  // Validate Twilio signature
  if (process.env.NODE_ENV === 'production' && process.env.TWILIO_AUTH_TOKEN) {
    const signature = req.headers['x-twilio-signature'];
    const url = process.env.PUBLIC_URL + '/api/sms/inbound';
    const valid = twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, url, req.body);
    if (!valid) return res.status(403).send('Forbidden');
  }

  const from = req.body.From;
  const body = req.body.Body;

  try {
    await handleInbound(from, body);
  } catch (err) {
    console.error('Inbound SMS handler error:', err.message);
  }

  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');
});

// GET SMS log (admin)
router.get('/log', auth, (req, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit) || 50;
  const logs = db.prepare(`
    SELECT s.*, c.name as customer_name
    FROM sms_log s LEFT JOIN customers c ON c.id = s.customer_id
    ORDER BY s.created_at DESC LIMIT ?
  `).all(limit);
  res.json(logs);
});

// POST trigger reminder run manually
router.post('/run-reminders', auth, async (req, res) => {
  const { runReminderCheck } = require('../jobs/scheduler');
  await runReminderCheck();
  res.json({ success: true });
});

// GET settings
router.get('/settings', auth, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json(settings);
});

// PUT settings
router.put('/settings', auth, (req, res) => {
  const db = getDb();
  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const tx = db.transaction((data) => {
    for (const [key, value] of Object.entries(data)) {
      update.run(key, String(value));
    }
  });
  tx(req.body);
  res.json({ success: true });
});

// GET dashboard stats
router.get('/dashboard', auth, (req, res) => {
  const db = getDb();
  const stats = {
    total_customers: db.prepare(`SELECT COUNT(*) as n FROM customers WHERE status = 'active'`).get().n,
    total_revenue: db.prepare(`SELECT SUM(amount) as n FROM invoices WHERE status = 'paid'`).get().n || 0,
    pending_invoices: db.prepare(`SELECT COUNT(*) as n FROM invoices WHERE status = 'pending'`).get().n,
    overdue_invoices: db.prepare(`SELECT COUNT(*) as n FROM invoices WHERE status = 'overdue'`).get().n,
    pending_amount: db.prepare(`SELECT SUM(amount) as n FROM invoices WHERE status = 'pending'`).get().n || 0,
    overdue_amount: db.prepare(`SELECT SUM(amount) as n FROM invoices WHERE status = 'overdue'`).get().n || 0,
    this_month_revenue: db.prepare(`SELECT SUM(amount) as n FROM invoices WHERE status = 'paid' AND strftime('%Y-%m', paid_date) = strftime('%Y-%m', 'now')`).get().n || 0,
    recent_sms: db.prepare(`SELECT COUNT(*) as n FROM sms_log WHERE created_at > datetime('now', '-24 hours')`).get().n,
  };
  res.json(stats);
});

module.exports = router;
