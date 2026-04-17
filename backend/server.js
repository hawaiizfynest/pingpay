require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const { getDb } = require('./db/database');
const { startJobs } = require('./jobs/scheduler');

const app = express();
const PORT = process.env.PORT || 3500;

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/plans', require('./routes/plans'));
app.use('/api/sms', require('./routes/sms'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

async function bootstrap() {
  // Ensure default admin exists
  const db = getDb();
  const existing = db.prepare('SELECT id FROM admins LIMIT 1').get();
  if (!existing) {
    const defaultPass = process.env.ADMIN_PASSWORD || 'changeme123';
    const hash = await bcrypt.hash(defaultPass, 12);
    db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run('admin', hash);
    console.log(`[Bootstrap] Default admin created — username: admin / password: ${defaultPass}`);
    console.log('[Bootstrap] CHANGE YOUR PASSWORD AFTER FIRST LOGIN!');
  }

  // Start cron jobs
  if (process.env.DISABLE_CRON !== 'true') {
    startJobs();
  }

  app.listen(PORT, () => {
    console.log(`[PingPay] Backend running on port ${PORT}`);
  });
}

bootstrap().catch(console.error);
