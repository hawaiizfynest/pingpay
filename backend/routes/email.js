const express = require('express');
const auth = require('../middleware/auth');
const { sendTestEmail } = require('../services/emailService');
const { getCredential } = require('../services/credentials');

const router = express.Router();

// GET Resend status
router.get('/status', auth, (req, res) => {
  const key = getCredential('cred_resend_key', 'RESEND_API_KEY');
  const fromEmail = getCredential('cred_resend_from', 'RESEND_FROM_EMAIL');
  const replyTo = getCredential('cred_resend_replyto', 'RESEND_REPLY_TO');
  res.json({
    configured: !!key,
    from_email: fromEmail || null,
    reply_to: replyTo || null,
  });
});

// POST send a test email
router.post('/test', auth, async (req, res) => {
  const { to } = req.body;
  if (!to || !to.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  try {
    const result = await sendTestEmail(to);
    res.json({ success: true, id: result.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
