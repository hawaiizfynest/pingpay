const express = require('express');
const auth = require('../middleware/auth');
const { getDb } = require('../db/database');
const { sendPaymentConfirmation } = require('../services/smsService');

const router = express.Router();

function getStripe() {
  const { getCredential } = require('../services/credentials');
  const key = getCredential('cred_stripe_secret', 'STRIPE_SECRET_KEY');
  if (!key) throw new Error('Stripe not configured');
  return require('stripe')(key);
}

// POST — create a Stripe checkout session for an invoice
router.post('/checkout/:invoiceId', auth, async (req, res) => {
  const db = getDb();
  const invoice = db.prepare(`
    SELECT i.*, c.name as customer_name, c.phone, c.email, c.payment_method
    FROM invoices i JOIN customers c ON c.id = i.customer_id
    WHERE i.id = ?
  `).get(req.params.invoiceId);

  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.status === 'paid') return res.status(400).json({ error: 'Invoice already paid' });

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Invoice #${invoice.id}`,
            description: `Payment for ${invoice.customer_name} — Due ${invoice.due_date}`,
          },
          unit_amount: Math.round(invoice.amount * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      customer_email: invoice.email || undefined,
      metadata: {
        invoice_id: String(invoice.id),
        customer_id: String(invoice.customer_id),
      },
      success_url: `${process.env.PUBLIC_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.PUBLIC_URL}/payment-cancelled`,
    });

    // Store session ID on invoice
    db.prepare('UPDATE invoices SET stripe_session_id = ? WHERE id = ?').run(session.id, invoice.id);

    res.json({ url: session.url, session_id: session.id });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST — send customer a payment link via SMS
router.post('/send-link/:invoiceId', auth, async (req, res) => {
  const db = getDb();
  const invoice = db.prepare(`
    SELECT i.*, c.name as customer_name, c.phone, c.email
    FROM invoices i JOIN customers c ON c.id = i.customer_id
    WHERE i.id = ?
  `).get(req.params.invoiceId);

  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  try {
    const stripe = getStripe();

    // Create or reuse session
    let sessionUrl;
    if (invoice.stripe_session_id) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(invoice.stripe_session_id);
        if (existing.status === 'open') {
          sessionUrl = existing.url;
        }
      } catch {}
    }

    if (!sessionUrl) {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Invoice #${invoice.id}`,
              description: `Payment for ${invoice.customer_name}`,
            },
            unit_amount: Math.round(invoice.amount * 100),
          },
          quantity: 1,
        }],
        mode: 'payment',
        customer_email: invoice.email || undefined,
        metadata: {
          invoice_id: String(invoice.id),
          customer_id: String(invoice.customer_id),
        },
        success_url: `${process.env.PUBLIC_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.PUBLIC_URL}/payment-cancelled`,
        expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
      });
      db.prepare('UPDATE invoices SET stripe_session_id = ? WHERE id = ?').run(session.id, invoice.id);
      sessionUrl = session.url;
    }

    // Send SMS with link
    const { sendSms } = require('../services/smsService');
    const settings = Object.fromEntries(
      db.prepare('SELECT key, value FROM settings').all().map(r => [r.key, r.value])
    );
    const businessName = settings.business_name || 'PingPay';

    const msg = `💳 *${businessName} — Pay Online*\n\nHi ${invoice.customer_name},\n\nYour invoice of $${invoice.amount.toFixed(2)} is due ${invoice.due_date}.\n\nPay securely by card here:\n${sessionUrl}\n\nLink expires in 24 hours.`;
    await sendSms(invoice.phone, msg, invoice.customer_id);

    res.json({ success: true, url: sessionUrl });
  } catch (err) {
    console.error('Send payment link error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST — Stripe webhook (raw body required)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const { getCredential } = require('../services/credentials');
  const webhookSecret = getCredential('cred_stripe_webhook', 'STRIPE_WEBHOOK_SECRET');

  let event;
  try {
    const stripe = getStripe();
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body);
    }
  } catch (err) {
    console.error('Stripe webhook error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.payment_status === 'paid') {
      await handleStripePayment(session);
    }
  }

  res.json({ received: true });
});

async function handleStripePayment(session) {
  const db = getDb();
  const invoiceId = session.metadata?.invoice_id;
  if (!invoiceId) return;

  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  if (!invoice || invoice.status === 'paid') return;

  const today = new Date().toISOString().split('T')[0];
  db.prepare(`UPDATE invoices SET status='paid', paid_date=?, payment_method='card', stripe_session_id=? WHERE id=?`)
    .run(today, session.id, invoiceId);

  // Advance next_due_date
  const customer = db.prepare(`SELECT c.*, p.billing_cycle FROM customers c LEFT JOIN plans p ON p.id = c.plan_id WHERE c.id = ?`)
    .get(invoice.customer_id);

  if (customer) {
    const nextDue = advanceDueDate(customer.next_due_date, customer.billing_cycle || 'monthly');
    db.prepare('UPDATE customers SET next_due_date = ? WHERE id = ?').run(nextDue, customer.id);

    try {
      await sendPaymentConfirmation(customer, { ...invoice, payment_method: 'card' });
    } catch (err) {
      console.error('Receipt SMS after Stripe payment failed:', err.message);
    }
  }

  console.log(`[Stripe] Invoice #${invoiceId} paid via card`);
}

// GET — Stripe config check
router.get('/config', auth, (req, res) => {
  const { getCredential } = require('../services/credentials');
  const secretKey = getCredential('cred_stripe_secret', 'STRIPE_SECRET_KEY');
  const pubKey = getCredential('cred_stripe_publishable', 'STRIPE_PUBLISHABLE_KEY');
  const webhookSecret = getCredential('cred_stripe_webhook', 'STRIPE_WEBHOOK_SECRET');
  res.json({
    configured: !!(secretKey && pubKey),
    publishable_key: pubKey || null,
    webhook_configured: !!webhookSecret,
  });
});

function advanceDueDate(dateStr, cycle) {
  const d = new Date(dateStr);
  if (cycle === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (cycle === 'quarterly') d.setMonth(d.getMonth() + 3);
  else if (cycle === 'annually') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
}

module.exports = router;
