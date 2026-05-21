const { getDb } = require('../db/database');

/**
 * Hybrid notification dispatcher.
 * Picks delivery channel based on customer's preference.
 * Falls back to SMS if no email, or email if no phone.
 * Default is 'email' going forward.
 */

function getCustomerChannel(customer) {
  // Explicit preference wins
  if (customer.notification_channel === 'sms') return 'sms';
  if (customer.notification_channel === 'email') return 'email';
  // Default: email if available, fall back to SMS
  if (customer.email && customer.email.trim()) return 'email';
  if (customer.phone && customer.phone.trim()) return 'sms';
  return null;
}

async function sendBillingReminder(customer, invoice, daysUntilDue) {
  const channel = getCustomerChannel(customer);
  if (channel === 'email') {
    const { sendBillingReminder } = require('./emailService');
    return sendBillingReminder(customer, invoice, daysUntilDue);
  } else if (channel === 'sms') {
    const { sendBillingReminder } = require('./smsService');
    return sendBillingReminder(customer, invoice, daysUntilDue);
  } else {
    console.warn(`[Notify] No channel for customer ${customer.id} (${customer.name})`);
  }
}

async function sendOverdueNotice(customer, invoice) {
  const channel = getCustomerChannel(customer);
  if (channel === 'email') {
    const { sendOverdueNotice } = require('./emailService');
    return sendOverdueNotice(customer, invoice);
  } else if (channel === 'sms') {
    const { sendOverdueNotice } = require('./smsService');
    return sendOverdueNotice(customer, invoice);
  }
}

async function sendPaymentConfirmation(customer, invoice) {
  const channel = getCustomerChannel(customer);
  if (channel === 'email') {
    const { sendPaymentConfirmation } = require('./emailService');
    return sendPaymentConfirmation(customer, invoice);
  } else if (channel === 'sms') {
    const { sendPaymentConfirmation } = require('./smsService');
    return sendPaymentConfirmation(customer, invoice);
  }
}

async function sendPaymentLink(customer, invoice, paymentUrl) {
  const channel = getCustomerChannel(customer);
  if (channel === 'email') {
    const { sendPaymentLinkEmail } = require('./emailService');
    return sendPaymentLinkEmail(customer, invoice, paymentUrl);
  } else if (channel === 'sms') {
    const { sendSms } = require('./smsService');
    const db = getDb();
    const settings = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(r => [r.key, r.value]));
    const businessName = settings.business_name || 'PingPay';
    const msg = `💳 *${businessName}*\n\nHi ${customer.name},\n\nYour invoice of $${invoice.amount.toFixed(2)} is due ${invoice.due_date}.\n\nPay securely by card:\n${paymentUrl}\n\nLink expires in 24 hours.`;
    return sendSms(customer.phone, msg, customer.id);
  }
}

module.exports = {
  getCustomerChannel,
  sendBillingReminder,
  sendOverdueNotice,
  sendPaymentConfirmation,
  sendPaymentLink,
};
