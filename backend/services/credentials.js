const { getDb } = require('../db/database');

/**
 * Get a credential value — checks the settings DB first, falls back to env var.
 * This allows credentials to be updated via the admin UI without restarting.
 */
function getCredential(dbKey, envKey) {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(dbKey);
    if (row && row.value && row.value.trim() !== '') return row.value.trim();
  } catch {}
  return process.env[envKey] || '';
}

/**
 * Mask a credential for display — shows only last 4 chars.
 */
function maskCredential(val) {
  if (!val || val.length < 6) return val ? '••••••••' : '';
  return '••••••••' + val.slice(-4);
}

/**
 * Save credentials to the settings DB.
 * Only saves non-empty values — empty string means "keep existing".
 */
function saveCredentials(creds) {
  const db = getDb();
  const upsert = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const tx = db.transaction((data) => {
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null) {
        upsert.run(key, String(value));
      }
    }
  });
  tx(creds);
}

module.exports = { getCredential, maskCredential, saveCredentials };
