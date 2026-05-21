// Run with: docker exec pingpay-backend node /app/migrate-email.js
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'pingpay.db');
const db = new Database(DB_PATH);

console.log('Adding notification_channel column to customers...');
try {
  db.exec(`ALTER TABLE customers ADD COLUMN notification_channel TEXT DEFAULT 'email' CHECK(notification_channel IN ('email','sms','both'))`);
  console.log('Column added.');
} catch (err) {
  if (err.message.includes('duplicate column')) {
    console.log('Column already exists, skipping.');
  } else {
    throw err;
  }
}

// Set existing customers with no email to use SMS
const updated = db.prepare(`UPDATE customers SET notification_channel = 'sms' WHERE (email IS NULL OR email = '') AND notification_channel = 'email'`).run();
console.log(`Updated ${updated.changes} customers to SMS (no email on file)`);

console.log('Migration complete.');
db.close();
