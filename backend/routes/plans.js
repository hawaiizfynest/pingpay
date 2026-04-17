const express = require('express');
const auth = require('../middleware/auth');
const { getDb } = require('../db/database');

const router = express.Router();

router.get('/', auth, (req, res) => {
  const db = getDb();
  const plans = db.prepare(`
    SELECT p.*, COUNT(c.id) as customer_count
    FROM plans p LEFT JOIN customers c ON c.plan_id = p.id AND c.status = 'active'
    GROUP BY p.id ORDER BY p.price ASC
  `).all();
  res.json(plans);
});

router.post('/', auth, (req, res) => {
  const { name, description, price, billing_cycle, features } = req.body;
  if (!name || !price || !billing_cycle) return res.status(400).json({ error: 'name, price, billing_cycle required' });

  const db = getDb();
  const result = db.prepare(`INSERT INTO plans (name, description, price, billing_cycle, features) VALUES (?, ?, ?, ?, ?)`)
    .run(name, description || null, price, billing_cycle, features || null);

  res.json({ id: result.lastInsertRowid, success: true });
});

router.put('/:id', auth, (req, res) => {
  const { name, description, price, billing_cycle, features } = req.body;
  const db = getDb();
  db.prepare(`UPDATE plans SET name=?, description=?, price=?, billing_cycle=?, features=? WHERE id=?`)
    .run(name, description || null, price, billing_cycle, features || null, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', auth, (req, res) => {
  const db = getDb();
  const inUse = db.prepare('SELECT COUNT(*) as cnt FROM customers WHERE plan_id = ?').get(req.params.id);
  if (inUse.cnt > 0) return res.status(409).json({ error: 'Plan is in use by customers' });
  db.prepare('DELETE FROM plans WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
