const express = require('express');
const auth = require('../middleware/auth');
const { getDb } = require('../db/database');

const router = express.Router();

// GET all customers
router.get('/', auth, (req, res) => {
  const db = getDb();
  const customers = db.prepare(`
    SELECT c.*, p.name as plan_name, p.price, p.billing_cycle,
      (SELECT COUNT(*) FROM invoices WHERE customer_id = c.id AND status IN ('pending','overdue')) as open_invoices,
      (SELECT SUM(amount) FROM invoices WHERE customer_id = c.id AND status IN ('pending','overdue')) as balance_due
    FROM customers c
    LEFT JOIN plans p ON p.id = c.plan_id
    ORDER BY c.name ASC
  `).all();
  res.json(customers);
});

// GET single customer
router.get('/:id', auth, (req, res) => {
  const db = getDb();
  const customer = db.prepare(`
    SELECT c.*, p.name as plan_name, p.price, p.billing_cycle, p.features
    FROM customers c LEFT JOIN plans p ON p.id = c.plan_id WHERE c.id = ?
  `).get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Not found' });
  res.json(customer);
});

// POST create customer
router.post('/', auth, (req, res) => {
  const {
    name, phone, email, plan_id, billing_day, next_due_date,
    status, payment_method, notes, notification_channel,
  } = req.body;
  if (!name || !phone || !next_due_date) return res.status(400).json({ error: 'name, phone, next_due_date required' });

  const db = getDb();
  try {
    const result = db.prepare(`
      INSERT INTO customers (name, phone, email, plan_id, billing_day, next_due_date, status, payment_method, notes, notification_channel)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, phone, email || null, plan_id || null, billing_day || 1,
      next_due_date, status || 'active', payment_method || 'zelle',
      notes || null, notification_channel || 'email'
    );

    res.json({ id: result.lastInsertRowid, success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Phone number already exists' });
    throw err;
  }
});

// PUT update customer
router.put('/:id', auth, (req, res) => {
  const {
    name, phone, email, plan_id, billing_day, next_due_date,
    status, payment_method, notes, notification_channel,
  } = req.body;
  const db = getDb();

  try {
    db.prepare(`
      UPDATE customers SET name=?, phone=?, email=?, plan_id=?, billing_day=?, next_due_date=?,
      status=?, payment_method=?, notes=?, notification_channel=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).run(
      name, phone, email || null, plan_id || null, billing_day || 1,
      next_due_date, status, payment_method, notes || null,
      notification_channel || 'email', req.params.id
    );

    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Phone number already exists' });
    throw err;
  }
});

// DELETE customer (cascades to invoices and sms_log)
router.delete('/:id', auth, (req, res) => {
  const db = getDb();
  const del = db.transaction((id) => {
    db.prepare('DELETE FROM sms_log WHERE customer_id = ?').run(id);
    db.prepare('DELETE FROM invoices WHERE customer_id = ?').run(id);
    db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  });
  del(req.params.id);
  res.json({ success: true });
});

// GET customer invoices
router.get('/:id/invoices', auth, (req, res) => {
  const db = getDb();
  const invoices = db.prepare(`SELECT * FROM invoices WHERE customer_id = ? ORDER BY due_date DESC`).all(req.params.id);
  res.json(invoices);
});

// GET customer SMS log
router.get('/:id/sms', auth, (req, res) => {
  const db = getDb();
  const logs = db.prepare(`SELECT * FROM sms_log WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50`).all(req.params.id);
  res.json(logs);
});

// POST send manual message to customer (email or SMS based on preference)
router.post('/:id/sms', auth, async (req, res) => {
  const { message, subject } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const db = getDb();
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Not found' });

  const { getCustomerChannel } = require('../services/notifyService');
  const channel = getCustomerChannel(customer);

  if (channel === 'email') {
    const { sendEmail } = require('../services/emailService');
    await sendEmail(customer.email, subject || `Message from ${require('../services/credentials').getCredential('business_name', '') || 'PingPay'}`, message, customer.id);
  } else if (channel === 'sms') {
    const { sendSms } = require('../services/smsService');
    await sendSms(customer.phone, message, customer.id);
  } else {
    return res.status(400).json({ error: 'Customer has no email or phone configured' });
  }
  res.json({ success: true, channel });
});

module.exports = router;
