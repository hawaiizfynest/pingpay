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

// GET Twilio account info (phone number + wallet balance)
router.get('/twilio-info', auth, async (req, res) => {
  const { getCredential } = require('../services/credentials');
  const sid = getCredential('cred_twilio_sid', 'TWILIO_ACCOUNT_SID');
  const token = getCredential('cred_twilio_token', 'TWILIO_AUTH_TOKEN');
  const number = getCredential('cred_twilio_number', 'TWILIO_PHONE_NUMBER');

  if (!sid || !token) {
    return res.json({ configured: false });
  }

  try {
    const client = twilio(sid, token);

    const [balance, account] = await Promise.all([
      client.balance.fetch(),
      client.api.accounts(sid).fetch(),
    ]);

    res.json({
      configured: true,
      phone_number: number || null,
      balance: parseFloat(balance.balance).toFixed(2),
      currency: balance.currency,
      account_name: account.friendlyName,
      account_status: account.status,
    });
  } catch (err) {
    console.error('Twilio info fetch error:', err.message);
    res.json({ configured: true, error: err.message });
  }
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

// GET credentials (masked for display)
router.get('/credentials', auth, (req, res) => {
  const { getCredential, maskCredential } = require('../services/credentials');
  res.json({
    twilio_sid: maskCredential(getCredential('cred_twilio_sid', 'TWILIO_ACCOUNT_SID')),
    twilio_token: maskCredential(getCredential('cred_twilio_token', 'TWILIO_AUTH_TOKEN')),
    twilio_number: getCredential('cred_twilio_number', 'TWILIO_PHONE_NUMBER'),
    stripe_secret: maskCredential(getCredential('cred_stripe_secret', 'STRIPE_SECRET_KEY')),
    stripe_publishable: maskCredential(getCredential('cred_stripe_publishable', 'STRIPE_PUBLISHABLE_KEY')),
    stripe_webhook: maskCredential(getCredential('cred_stripe_webhook', 'STRIPE_WEBHOOK_SECRET')),
    resend_key: maskCredential(getCredential('cred_resend_key', 'RESEND_API_KEY')),
    resend_from: getCredential('cred_resend_from', 'RESEND_FROM_EMAIL'),
    resend_replyto: getCredential('cred_resend_replyto', 'RESEND_REPLY_TO'),
  });
});

// PUT credentials (only saves non-empty, non-masked values)
router.put('/credentials', auth, (req, res) => {
  const { saveCredentials } = require('../services/credentials');
  const {
    twilio_sid, twilio_token, twilio_number,
    stripe_secret, stripe_publishable, stripe_webhook,
    resend_key, resend_from, resend_replyto,
  } = req.body;
  const toSave = {};
  if (twilio_sid && !twilio_sid.includes('•')) toSave.cred_twilio_sid = twilio_sid;
  if (twilio_token && !twilio_token.includes('•')) toSave.cred_twilio_token = twilio_token;
  if (twilio_number) toSave.cred_twilio_number = twilio_number;
  if (stripe_secret && !stripe_secret.includes('•')) toSave.cred_stripe_secret = stripe_secret;
  if (stripe_publishable && !stripe_publishable.includes('•')) toSave.cred_stripe_publishable = stripe_publishable;
  if (stripe_webhook && !stripe_webhook.includes('•')) toSave.cred_stripe_webhook = stripe_webhook;
  if (resend_key && !resend_key.includes('•')) toSave.cred_resend_key = resend_key;
  if (resend_from) toSave.cred_resend_from = resend_from;
  if (resend_replyto) toSave.cred_resend_replyto = resend_replyto;
  saveCredentials(toSave);
  res.json({ success: true, saved: Object.keys(toSave) });
});

module.exports = router;
