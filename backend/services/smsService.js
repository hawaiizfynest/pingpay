const twilio = require('twilio');
const { getDb } = require('../db/database');

let client;

function getTwilioClient() {
  if (!client) {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return client;
}

function getSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

async function sendSms(to, body, customerId = null) {
  const db = getDb();
  const normalized = normalizePhone(to);

  try {
    const msg = await getTwilioClient().messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: normalized,
    });

    db.prepare(`INSERT INTO sms_log (customer_id, direction, phone, message, twilio_sid) VALUES (?, 'outbound', ?, ?, ?)`)
      .run(customerId, normalized, body, msg.sid);

    return { success: true, sid: msg.sid };
  } catch (err) {
    console.error('SMS send error:', err.message);
    db.prepare(`INSERT INTO sms_log (customer_id, direction, phone, message) VALUES (?, 'outbound', ?, ?, NULL)`)
      .run(customerId, normalized, body);
    throw err;
  }
}

async function handleInbound(from, body) {
  const db = getDb();
  const normalized = normalizePhone(from);
  const text = body.trim().toUpperCase();

  // Log inbound
  const customer = db.prepare(`SELECT c.*, p.name as plan_name, p.price, p.billing_cycle, p.features 
    FROM customers c LEFT JOIN plans p ON c.plan_id = p.id WHERE c.phone = ?`).get(normalized);

  db.prepare(`INSERT INTO sms_log (customer_id, direction, phone, message) VALUES (?, 'inbound', ?, ?)`)
    .run(customer?.id || null, normalized, body);

  if (!customer) {
    return sendSms(normalized, `Sorry, we couldn't find an account linked to this number. Please contact support.`);
  }

  const settings = getSettings();
  const businessName = settings.business_name || 'PingPay';

  // Keyword routing
  if (text === 'BALANCE' || text === 'BAL' || text === 'AMOUNT') {
    return handleBalance(customer, settings);
  } else if (text === 'DUE' || text === 'DUEDATE' || text === 'DATE') {
    return handleDueDate(customer, settings);
  } else if (text === 'PLAN' || text === 'PLANS' || text === 'SERVICE') {
    return handlePlan(customer, settings);
  } else if (text === 'PAY' || text === 'PAYMENT' || text === 'HOWPAY' || text === 'HOW TO PAY') {
    return handlePayInstructions(customer, settings);
  } else if (text === 'RECEIPT' || text === 'RECEIPTS') {
    return handleReceipt(customer, settings);
  } else if (text === 'STATUS' || text === 'ACCOUNT') {
    return handleAccountStatus(customer, settings);
  } else if (text === 'HELP' || text === 'COMMANDS' || text === 'MENU') {
    return handleHelp(customer, businessName);
  } else {
    return handleHelp(customer, businessName);
  }
}

async function handleBalance(customer, settings) {
  const db = getDb();
  const pending = db.prepare(`SELECT SUM(amount) as total FROM invoices WHERE customer_id = ? AND status IN ('pending','overdue')`).get(customer.id);
  const amount = pending?.total || 0;

  let msg = `💰 *${settings.business_name} — Balance*\n\n`;
  msg += `Hi ${customer.name},\n`;
  if (amount > 0) {
    msg += `Your current balance is $${amount.toFixed(2)}.\n`;
    msg += `Due date: ${formatDate(customer.next_due_date)}\n\n`;
    msg += `Reply PAY for payment instructions.`;
  } else {
    msg += `Your account is current — no balance due. ✅\n`;
    msg += `Next billing date: ${formatDate(customer.next_due_date)}`;
  }

  return sendSms(customer.phone, msg, customer.id);
}

async function handleDueDate(customer, settings) {
  const db = getDb();
  const pending = db.prepare(`SELECT amount FROM invoices WHERE customer_id = ? AND status IN ('pending','overdue') ORDER BY due_date ASC LIMIT 1`).get(customer.id);

  let msg = `📅 *${settings.business_name} — Due Date*\n\n`;
  msg += `Hi ${customer.name},\n`;
  msg += `Your next payment is due on ${formatDate(customer.next_due_date)}.\n`;
  if (pending) msg += `Amount due: $${pending.amount.toFixed(2)}\n`;
  msg += `\nReply PAY for payment options.`;

  return sendSms(customer.phone, msg, customer.id);
}

async function handlePlan(customer, settings) {
  let msg = `📋 *${settings.business_name} — Your Plan*\n\n`;
  msg += `Hi ${customer.name},\n`;
  msg += `Plan: ${customer.plan_name || 'N/A'}\n`;
  msg += `Rate: $${customer.price?.toFixed(2) || '0.00'}/${customer.billing_cycle || 'month'}\n`;
  if (customer.features) {
    msg += `\nIncludes:\n${customer.features}`;
  }

  return sendSms(customer.phone, msg, customer.id);
}

async function handlePayInstructions(customer, settings) {
  const method = customer.payment_method;
  let msg = `💳 *${settings.business_name} — Payment*\n\n`;
  msg += `Hi ${customer.name}, here's how to pay:\n\n`;

  if (method === 'zelle' || !method) {
    msg += `📲 Zelle: ${settings.zelle_info}\n`;
  } else if (method === 'apple_pay') {
    msg += `🍎 Apple Pay: ${settings.apple_pay_info}\n`;
  } else if (method === 'cash') {
    msg += `💵 Cash: ${settings.cash_info}\n`;
  }

  msg += `\nPlease include your name in the payment note. Reply BALANCE to confirm once sent.`;

  return sendSms(customer.phone, msg, customer.id);
}

async function handleReceipt(customer, settings) {
  const db = getDb();
  const last = db.prepare(`SELECT * FROM invoices WHERE customer_id = ? AND status = 'paid' ORDER BY paid_date DESC LIMIT 1`).get(customer.id);

  let msg = `🧾 *${settings.business_name} — Receipt*\n\n`;
  msg += `Hi ${customer.name},\n`;
  if (last) {
    msg += `Last payment: $${last.amount.toFixed(2)}\n`;
    msg += `Paid on: ${formatDate(last.paid_date)}\n`;
    msg += `Method: ${formatMethod(last.payment_method)}\n`;
    msg += `Invoice #${last.id}\n\nThank you for your payment! ✅`;
  } else {
    msg += `No payment history found on your account.`;
  }

  return sendSms(customer.phone, msg, customer.id);
}

async function handleAccountStatus(customer, settings) {
  const db = getDb();
  const unpaid = db.prepare(`SELECT COUNT(*) as cnt FROM invoices WHERE customer_id = ? AND status IN ('pending','overdue')`).get(customer.id);
  const totalPaid = db.prepare(`SELECT SUM(amount) as total FROM invoices WHERE customer_id = ? AND status = 'paid'`).get(customer.id);

  let msg = `👤 *${settings.business_name} — Account*\n\n`;
  msg += `Name: ${customer.name}\n`;
  msg += `Plan: ${customer.plan_name || 'N/A'}\n`;
  msg += `Status: ${customer.status.toUpperCase()}\n`;
  msg += `Next due: ${formatDate(customer.next_due_date)}\n`;
  msg += `Open invoices: ${unpaid.cnt}\n`;
  msg += `Lifetime paid: $${(totalPaid?.total || 0).toFixed(2)}`;

  return sendSms(customer.phone, msg, customer.id);
}

async function handleHelp(customer, businessName) {
  const msg = `👋 Hi ${customer.name}! Welcome to ${businessName} billing.\n\nReply with:\n• BALANCE — what you owe\n• DUE — next due date\n• PLAN — your service plan\n• PAY — how to pay\n• RECEIPT — last payment\n• STATUS — account overview`;
  return sendSms(customer.phone, msg, customer.id);
}

// === Reminder functions ===

async function sendBillingReminder(customer, invoice, daysUntilDue) {
  const settings = getSettings();
  const businessName = settings.business_name || 'PingPay';

  let msg = `🔔 *${businessName} — Payment Reminder*\n\n`;
  msg += `Hi ${customer.name},\n`;

  if (daysUntilDue === 0) {
    msg += `Your payment of $${invoice.amount.toFixed(2)} is DUE TODAY.\n`;
  } else {
    msg += `Your payment of $${invoice.amount.toFixed(2)} is due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}.\n`;
    msg += `Due date: ${formatDate(invoice.due_date)}\n`;
  }

  msg += `\nReply PAY for payment instructions or BALANCE for details.`;

  return sendSms(customer.phone, msg, customer.id);
}

async function sendOverdueNotice(customer, invoice) {
  const settings = getSettings();
  const businessName = settings.business_name || 'PingPay';

  const daysOverdue = Math.floor((new Date() - new Date(invoice.due_date)) / (1000 * 60 * 60 * 24));

  let msg = `⚠️ *${businessName} — Overdue Notice*\n\n`;
  msg += `Hi ${customer.name}, your payment is overdue.\n\n`;
  msg += `Amount: $${invoice.amount.toFixed(2)}\n`;
  msg += `Was due: ${formatDate(invoice.due_date)} (${daysOverdue} days ago)\n\n`;
  msg += `Please pay as soon as possible to avoid service interruption.\nReply PAY for instructions.`;

  return sendSms(customer.phone, msg, customer.id);
}

async function sendPaymentConfirmation(customer, invoice) {
  const settings = getSettings();
  const businessName = settings.business_name || 'PingPay';

  let msg = `✅ *${businessName} — Payment Confirmed*\n\n`;
  msg += `Hi ${customer.name},\n\n`;
  msg += `We've recorded your payment of $${invoice.amount.toFixed(2)}.\n`;
  msg += `Invoice #${invoice.id} — ${formatDate(new Date().toISOString())}\n`;
  msg += `Method: ${formatMethod(invoice.payment_method)}\n\n`;
  msg += `Thank you! Your next bill is due ${formatDate(customer.next_due_date)}.\nReply HELP for account options.`;

  return sendSms(customer.phone, msg, customer.id);
}

// === Helpers ===

function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatMethod(method) {
  const map = { zelle: 'Zelle', cash: 'Cash', apple_pay: 'Apple Pay' };
  return map[method] || method || 'Unknown';
}

module.exports = {
  sendSms,
  handleInbound,
  sendBillingReminder,
  sendOverdueNotice,
  sendPaymentConfirmation,
  normalizePhone,
};
