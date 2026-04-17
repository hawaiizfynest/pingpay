const express = require('express');
const auth = require('../middleware/auth');
const { getDb } = require('../db/database');
const { sendPaymentConfirmation } = require('../services/smsService');

const router = express.Router();

// GET all invoices (with optional filters)
router.get('/', auth, (req, res) => {
  const db = getDb();
  const { status, customer_id } = req.query;
  let query = `
    SELECT i.*, c.name as customer_name, c.phone, p.name as plan_name
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    LEFT JOIN plans p ON p.id = c.plan_id
    WHERE 1=1
  `;
  const params = [];
  if (status) { query += ' AND i.status = ?'; params.push(status); }
  if (customer_id) { query += ' AND i.customer_id = ?'; params.push(customer_id); }
  query += ' ORDER BY i.due_date DESC';

  res.json(db.prepare(query).all(...params));
});

// POST create invoice
router.post('/', auth, (req, res) => {
  const { customer_id, amount, due_date, notes } = req.body;
  if (!customer_id || !amount || !due_date) return res.status(400).json({ error: 'customer_id, amount, due_date required' });

  const db = getDb();
  const result = db.prepare(`INSERT INTO invoices (customer_id, amount, due_date, status, notes) VALUES (?, ?, ?, 'pending', ?)`)
    .run(customer_id, amount, due_date, notes || null);

  res.json({ id: result.lastInsertRowid, success: true });
});

// PUT mark invoice paid
router.put('/:id/pay', auth, async (req, res) => {
  const { payment_method, notes, send_receipt } = req.body;
  const db = getDb();

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Not found' });

  const today = new Date().toISOString().split('T')[0];
  db.prepare(`UPDATE invoices SET status='paid', paid_date=?, payment_method=?, notes=? WHERE id=?`)
    .run(today, payment_method || invoice.payment_method, notes || invoice.notes, req.params.id);

  const customer = db.prepare(`SELECT c.*, p.name as plan_name FROM customers c LEFT JOIN plans p ON p.id = c.plan_id WHERE c.id = ?`)
    .get(invoice.customer_id);

  // Advance next_due_date
  if (customer) {
    const nextDue = advanceDueDate(customer.next_due_date, customer.billing_cycle || 'monthly');
    db.prepare('UPDATE customers SET next_due_date = ? WHERE id = ?').run(nextDue, customer.id);
  }

  // Send receipt via SMS
  if (send_receipt !== false && customer) {
    try {
      await sendPaymentConfirmation(customer, { ...invoice, payment_method: payment_method || invoice.payment_method });
    } catch (err) {
      console.error('Receipt SMS failed:', err.message);
    }
  }

  res.json({ success: true });
});

// PUT update invoice
router.put('/:id', auth, (req, res) => {
  const { amount, due_date, status, notes } = req.body;
  const db = getDb();
  db.prepare(`UPDATE invoices SET amount=?, due_date=?, status=?, notes=? WHERE id=?`)
    .run(amount, due_date, status, notes || null, req.params.id);
  res.json({ success: true });
});

// DELETE invoice
router.delete('/:id', auth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST generate invoices for all active customers due soon
router.post('/generate-batch', auth, async (req, res) => {
  const { generateDueInvoices } = require('../jobs/scheduler');
  await generateDueInvoices();
  res.json({ success: true });
});

function advanceDueDate(dateStr, cycle) {
  const d = new Date(dateStr);
  if (cycle === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (cycle === 'quarterly') d.setMonth(d.getMonth() + 3);
  else if (cycle === 'annually') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
}

module.exports = router;
