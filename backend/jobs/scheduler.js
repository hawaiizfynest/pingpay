const cron = require('node-cron');
const { getDb } = require('../db/database');
const { sendBillingReminder, sendOverdueNotice } = require('../services/smsService');

function startJobs() {
  // Run every morning at 9 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('[Cron] Running daily billing reminder check...');
    await runReminderCheck();
  });

  // Run overdue check every day at 10 AM
  cron.schedule('0 10 * * *', async () => {
    console.log('[Cron] Running overdue invoice check...');
    await runOverdueCheck();
  });

  // Generate monthly invoices at midnight on the 1st
  cron.schedule('0 0 1 * *', async () => {
    console.log('[Cron] Generating monthly invoices...');
    await generateDueInvoices();
  });

  console.log('[Cron] All billing jobs scheduled.');
}

async function runReminderCheck() {
  const db = getDb();
  const settings = db.prepare('SELECT value FROM settings WHERE key = ?').get('reminder_days');
  const reminderDays = JSON.parse(settings?.value || '[7,3,1]');

  const today = new Date();

  for (const days of reminderDays) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + days);
    const targetStr = targetDate.toISOString().split('T')[0];

    const invoices = db.prepare(`
      SELECT i.*, c.name, c.phone, c.payment_method, c.id as customer_id
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      WHERE i.status IN ('pending') AND i.due_date = ? AND c.status = 'active'
    `).all(targetStr);

    for (const inv of invoices) {
      try {
        await sendBillingReminder(
          { id: inv.customer_id, name: inv.name, phone: inv.phone, payment_method: inv.payment_method },
          { amount: inv.amount, due_date: inv.due_date },
          days
        );
        console.log(`[Cron] Reminder sent to ${inv.name} (${days} days)`);
      } catch (err) {
        console.error(`[Cron] Failed to remind ${inv.name}:`, err.message);
      }
    }
  }
}

async function runOverdueCheck() {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  // Mark overdue
  db.prepare(`UPDATE invoices SET status = 'overdue' WHERE status = 'pending' AND due_date < ?`).run(today);

  // Send overdue notices
  const overdue = db.prepare(`
    SELECT i.*, c.name, c.phone, c.payment_method, c.id as customer_id
    FROM invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.status = 'overdue' AND c.status = 'active'
    AND date(i.due_date) = date(?, '-1 day')
  `).all(today);

  for (const inv of overdue) {
    try {
      await sendOverdueNotice(
        { id: inv.customer_id, name: inv.name, phone: inv.phone },
        { amount: inv.amount, due_date: inv.due_date, id: inv.id }
      );
      console.log(`[Cron] Overdue notice sent to ${inv.name}`);
    } catch (err) {
      console.error(`[Cron] Failed overdue notice for ${inv.name}:`, err.message);
    }
  }
}

async function generateDueInvoices() {
  const db = getDb();
  const today = new Date();

  const customers = db.prepare(`
    SELECT c.*, p.price, p.billing_cycle
    FROM customers c
    JOIN plans p ON p.id = c.plan_id
    WHERE c.status = 'active'
  `).all();

  for (const customer of customers) {
    const nextDue = new Date(customer.next_due_date);
    const daysUntil = Math.floor((nextDue - today) / (1000 * 60 * 60 * 24));

    // Generate invoice 7 days before due
    if (daysUntil === 7) {
      const existing = db.prepare(`SELECT id FROM invoices WHERE customer_id = ? AND due_date = ? AND status != 'waived'`)
        .get(customer.id, customer.next_due_date);

      if (!existing) {
        db.prepare(`INSERT INTO invoices (customer_id, amount, due_date, status) VALUES (?, ?, ?, 'pending')`)
          .run(customer.id, customer.price, customer.next_due_date);
        console.log(`[Cron] Invoice generated for ${customer.name}`);
      }
    }
  }
}

module.exports = { startJobs, runReminderCheck, runOverdueCheck, generateDueInvoices };
