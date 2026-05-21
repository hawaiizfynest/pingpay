const { Resend } = require('resend');
const { getDb } = require('../db/database');
const { getCredential } = require('./credentials');

function getResendClient() {
  const key = getCredential('cred_resend_key', 'RESEND_API_KEY');
  if (!key) throw new Error('Resend not configured');
  return new Resend(key);
}

function getSettings() {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function getFromAddress() {
  const settings = getSettings();
  const businessName = settings.business_name || 'PingPay';
  const fromEmail = getCredential('cred_resend_from', 'RESEND_FROM_EMAIL') || 'billing@pingpay.cc';
  return `${businessName} <${fromEmail}>`;
}

async function sendEmail(to, subject, body, customerId = null) {
  const db = getDb();
  const settings = getSettings();
  const replyTo = getCredential('cred_resend_replyto', 'RESEND_REPLY_TO') || settings.support_email || null;

  console.log(`[Email] Sending to ${to} — Subject: ${subject}`);

  try {
    const client = getResendClient();
    const opts = {
      from: getFromAddress(),
      to: [to],
      subject,
      html: wrapInTemplate(body, settings),
    };
    if (replyTo) opts.reply_to = replyTo;

    const result = await client.emails.send(opts);

    if (result.error) {
      throw new Error(result.error.message || JSON.stringify(result.error));
    }

    console.log(`[Email] Sent OK — ID: ${result.data?.id}`);
    db.prepare(`INSERT INTO sms_log (customer_id, direction, phone, message, twilio_sid) VALUES (?, 'outbound', ?, ?, ?)`)
      .run(customerId, to, `[EMAIL: ${subject}]\n\n${body}`, result.data?.id || null);

    return { success: true, id: result.data?.id };
  } catch (err) {
    console.error(`[Email] SEND FAILED to ${to} — ${err.message}`);
    db.prepare(`INSERT INTO sms_log (customer_id, direction, phone, message) VALUES (?, 'outbound', ?, ?)`)
      .run(customerId, to, `[EMAIL FAILED: ${subject}]\n\n${body}`);
    throw err;
  }
}

function wrapInTemplate(body, settings) {
  const businessName = settings.business_name || 'PingPay';
  const supportEmail = settings.support_email || '';
  const supportPhone = settings.support_phone || '';
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${businessName}</title></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#0a0a0c;color:#00d4ff;padding:20px 24px;border-radius:8px 8px 0 0;font-weight:600;font-size:18px;letter-spacing:0.04em;font-family:'IBM Plex Mono',monospace;">
      ⬡ ${businessName}
    </div>
    <div style="background:#ffffff;padding:32px 28px;border-radius:0 0 8px 8px;border:1px solid #e5e5ea;border-top:none;color:#1a1a1f;line-height:1.6;font-size:15px;">
      ${body.replace(/\n/g, '<br>')}
    </div>
    <div style="text-align:center;padding:20px;font-size:12px;color:#90909a;">
      ${supportEmail ? `Questions? Reply to this email or contact <a href="mailto:${supportEmail}" style="color:#0099cc;">${supportEmail}</a>` : 'Reply to this email for support'}
      ${supportPhone ? `<br>${supportPhone}` : ''}
    </div>
  </div>
</body></html>`;
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatMethod(method) {
  return { zelle: 'Zelle', cash: 'Cash', apple_pay: 'Apple Pay', card: 'Card' }[method] || method || 'Unknown';
}

// === Reminder functions (mirror smsService signatures) ===

async function sendBillingReminder(customer, invoice, daysUntilDue) {
  const settings = getSettings();
  const subject = daysUntilDue === 0
    ? `Payment due today — ${formatDate(invoice.due_date)}`
    : `Payment reminder — Due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}`;

  let body = `<strong>Hi ${customer.name},</strong>\n\n`;
  if (daysUntilDue === 0) {
    body += `Your payment of <strong>$${invoice.amount.toFixed(2)}</strong> is due today.\n\n`;
  } else {
    body += `Your payment of <strong>$${invoice.amount.toFixed(2)}</strong> is due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}.\n`;
    body += `Due date: <strong>${formatDate(invoice.due_date)}</strong>\n\n`;
  }
  body += `Reply with <strong>PAY</strong> for payment instructions or <strong>BALANCE</strong> for full details.`;

  return sendEmail(customer.email, subject, body, customer.id);
}

async function sendOverdueNotice(customer, invoice) {
  const daysOverdue = Math.floor((new Date() - new Date(invoice.due_date)) / (1000 * 60 * 60 * 24));
  const subject = `⚠ Payment overdue — $${invoice.amount.toFixed(2)}`;

  let body = `<strong>Hi ${customer.name},</strong>\n\n`;
  body += `Your payment is now overdue.\n\n`;
  body += `Amount: <strong>$${invoice.amount.toFixed(2)}</strong>\n`;
  body += `Was due: ${formatDate(invoice.due_date)} (${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} ago)\n\n`;
  body += `Please pay as soon as possible to avoid service interruption.\nReply <strong>PAY</strong> for instructions.`;

  return sendEmail(customer.email, subject, body, customer.id);
}

async function sendPaymentConfirmation(customer, invoice) {
  const subject = `✓ Payment received — $${invoice.amount.toFixed(2)}`;

  let body = `<strong>Hi ${customer.name},</strong>\n\n`;
  body += `We've received your payment. Thank you!\n\n`;
  body += `<strong>Amount:</strong> $${invoice.amount.toFixed(2)}\n`;
  body += `<strong>Method:</strong> ${formatMethod(invoice.payment_method)}\n`;
  body += `<strong>Date:</strong> ${formatDate(new Date().toISOString())}\n`;
  body += `<strong>Invoice:</strong> #${invoice.id}\n\n`;
  body += `Your next bill is due ${formatDate(customer.next_due_date)}.`;

  return sendEmail(customer.email, subject, body, customer.id);
}

// === Stripe payment link email ===
async function sendPaymentLinkEmail(customer, invoice, paymentUrl) {
  const settings = getSettings();
  const subject = `Pay your invoice — $${invoice.amount.toFixed(2)}`;

  let body = `<strong>Hi ${customer.name},</strong>\n\n`;
  body += `Your invoice of $${invoice.amount.toFixed(2)} is due ${formatDate(invoice.due_date)}.\n\n`;
  body += `<a href="${paymentUrl}" style="display:inline-block;background:#00d4ff;color:#0a0a0c;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;margin:16px 0;">Pay Now with Card</a>\n\n`;
  body += `Or copy this link: ${paymentUrl}\n\n`;
  body += `Link expires in 24 hours.`;

  return sendEmail(customer.email, subject, body, customer.id);
}

// === Test email ===
async function sendTestEmail(to) {
  const settings = getSettings();
  return sendEmail(to, 'PingPay test email', `<strong>This is a test from ${settings.business_name || 'PingPay'}.</strong>\n\nIf you received this, your Resend email integration is working correctly. ✓`);
}

module.exports = {
  sendEmail,
  sendBillingReminder,
  sendOverdueNotice,
  sendPaymentConfirmation,
  sendPaymentLinkEmail,
  sendTestEmail,
};
