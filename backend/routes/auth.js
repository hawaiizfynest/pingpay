const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');

const router = express.Router();

// In-memory brute force tracker
// { username: { attempts: N, lockedUntil: timestamp } }
const loginAttempts = {};

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // reset after 10 min of no attempts

function isLocked(username) {
  const rec = loginAttempts[username];
  if (!rec) return false;
  if (rec.lockedUntil && Date.now() < rec.lockedUntil) return true;
  // Lock expired — clear it
  if (rec.lockedUntil && Date.now() >= rec.lockedUntil) {
    delete loginAttempts[username];
    return false;
  }
  return false;
}

function recordFailure(username) {
  if (!loginAttempts[username]) {
    loginAttempts[username] = { attempts: 0, lockedUntil: null, firstAttempt: Date.now() };
  }
  const rec = loginAttempts[username];

  // Reset window if first attempt was too long ago
  if (Date.now() - rec.firstAttempt > ATTEMPT_WINDOW_MS) {
    loginAttempts[username] = { attempts: 1, lockedUntil: null, firstAttempt: Date.now() };
    return;
  }

  rec.attempts++;
  if (rec.attempts >= MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCKOUT_MS;
    console.warn(`[Auth] Account locked after ${MAX_ATTEMPTS} failed attempts: ${username}`);
  }
}

function clearAttempts(username) {
  delete loginAttempts[username];
}

function lockoutMinutesRemaining(username) {
  const rec = loginAttempts[username];
  if (!rec?.lockedUntil) return 0;
  return Math.ceil((rec.lockedUntil - Date.now()) / 60000);
}

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });

  // Check lockout
  if (isLocked(username)) {
    const mins = lockoutMinutesRemaining(username);
    console.warn(`[Auth] Locked account login attempt: ${username}`);
    return res.status(429).json({ error: `Account locked due to too many failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`, attemptsLeft: 0 });
  }

  const db = getDb();
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);

  // Always run bcrypt even if user not found (prevents timing attacks)
  const dummyHash = '$2b$12$invalidhashfortimingprotection00000000000000000000000';
  const hash = admin ? admin.password_hash : dummyHash;
  const valid = await bcrypt.compare(password, hash);

  if (!admin || !valid) {
    recordFailure(username);
    const rec = loginAttempts[username];
    const attemptsLeft = rec ? Math.max(0, MAX_ATTEMPTS - rec.attempts) : MAX_ATTEMPTS - 1;
    console.warn(`[Auth] Failed login for: ${username} (${attemptsLeft} attempts remaining)`);
    return res.status(401).json({
      error: 'Invalid credentials',
      attemptsLeft,
    });
  }

  // Success — clear attempts
  clearAttempts(username);

  const token = jwt.sign(
    { id: admin.id, username: admin.username },
    process.env.JWT_SECRET,
    { expiresIn: '8h' } // Reduced from 24h to 8h
  );

  // Set as httpOnly cookie (XSS-safe) AND return in body for API compatibility
  res.cookie('pp_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
  });

  console.log(`[Auth] Successful login: ${admin.username}`);
  res.json({ token, username: admin.username });
});

router.post('/logout', (req, res) => {
  res.clearCookie('pp_token');
  res.json({ success: true });
});

router.post('/change-password', require('../middleware/auth'), async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const db = getDb();
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);

  const valid = await bcrypt.compare(currentPassword, admin.password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password incorrect' });

  const hash = await bcrypt.hash(newPassword, 12);
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, admin.id);
  console.log(`[Auth] Password changed for: ${admin.username}`);
  res.json({ success: true });
});

// GET — check lockout status (for frontend to show warning)
router.get('/lockout-status', (req, res) => {
  const { username } = req.query;
  if (!username) return res.json({ locked: false });
  const locked = isLocked(username);
  const mins = locked ? lockoutMinutesRemaining(username) : 0;
  res.json({ locked, minutesRemaining: mins });
});

module.exports = router;
