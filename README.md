# PingPay — SMS Billing System

A self-hosted billing and SMS reminder system for NAS service providers. Customers interact entirely through text messages — no app or account needed. You manage everything through a private admin panel at `https://pingpay.cc`.

---

## Features

### Customer-Facing (SMS)
Customers text in keywords to get instant info:

| Command | Response |
|---|---|
| `BALANCE` | Current amount owed |
| `DUE` | Next payment due date |
| `PLAN` | Their service plan details |
| `PAY` | Payment instructions (Zelle/Apple Pay/Cash) |
| `RECEIPT` | Last payment receipt |
| `STATUS` | Full account overview |
| `HELP` | All available commands |

Customers also receive automatic texts:
- **7, 3, and 1 day** before their due date
- **Day-of** reminder if still unpaid
- **Overdue notice** if payment is late
- **Payment confirmation receipt** when you mark them paid

### Admin Panel
- Dashboard with revenue stats, pending/overdue counts, SMS activity
- Full customer CRUD — add, edit, suspend, delete
- Invoice management — create, mark paid, delete
- Service plan builder — name, price, billing cycle, feature list
- Manual SMS sender with quick templates
- SMS log — view all inbound/outbound history per customer
- Settings — business name, payment instructions, reminder schedule
- Password management

---

## Stack

- **Backend**: Node.js + Express + SQLite (better-sqlite3)
- **SMS**: Twilio (inbound + outbound)
- **Scheduler**: node-cron
- **Frontend**: React + Vite
- **Reverse Proxy**: nginx (routes `/api` to backend, `/` to frontend)
- **Auth**: JWT (24h sessions)
- **Docker**: Multi-container, QNAP-ready

---

## Setup

### 1. Point pingpay.cc to your NAS

1. In Namecheap, set nameservers to Cloudflare's (e.g. `lena.ns.cloudflare.com` / `miles.ns.cloudflare.com`)
2. In Cloudflare, add `pingpay.cc` as a site
3. In your Cloudflare tunnel, add a public hostname:
   - **Domain**: `pingpay.cc`
   - **Service**: `http://localhost:3500`

That's the only tunnel entry needed — nginx handles routing from there.

### 2. Configure environment

```bash
cd /share/Container/pingpay/backend
cp .env.example .env
nano .env
```

Fill in:

```env
JWT_SECRET=your_very_long_random_secret_here
ADMIN_PASSWORD=your_secure_password
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
```

### 3. Get a Twilio number

1. Sign up at [console.twilio.com](https://console.twilio.com)
2. Buy a phone number with SMS capability (~$1/month)
3. Set the inbound webhook to: `https://pingpay.cc/api/sms/inbound` (HTTP POST)

### 4. Deploy on QNAP

```bash
# Place project at /share/Container/pingpay/
cd /share/Container/pingpay
docker-compose up -d
```

- Admin panel: `https://pingpay.cc`
- Twilio webhook: `https://pingpay.cc/api/sms/inbound`

**Important**: Never use `docker-compose down` — use `docker restart pingpay-backend` to avoid volume data loss.

### 5. First login

Default credentials: `admin` / whatever you set as `ADMIN_PASSWORD`
**Change your password immediately** in Settings after first login.

---

## Payment Flow

1. Customer's billing date arrives → invoice created 7 days prior automatically
2. Reminders fire at 7, 3, 1 days out via SMS
3. Customer pays via Zelle / Apple Pay / Cash
4. You open Admin → Invoices → click **✓ Paid**
5. System marks it paid, advances their next due date, texts them a receipt

---

## Backup

```bash
docker exec pingpay-backend cp /data/pingpay.db /data/pingpay_backup_$(date +%Y%m%d).db
```

---

## Directory Structure

```
pingpay/
├── nginx/
│   └── nginx.conf              # Reverse proxy — /api → backend, / → frontend
├── backend/
│   ├── db/database.js          # SQLite schema + init
│   ├── middleware/auth.js       # JWT middleware
│   ├── routes/
│   │   ├── auth.js             # Login, password change
│   │   ├── customers.js        # Customer CRUD + SMS
│   │   ├── invoices.js         # Invoice management
│   │   ├── plans.js            # Service plans
│   │   └── sms.js              # Webhook, log, settings, dashboard
│   ├── services/smsService.js  # Twilio + inbound keyword bot
│   ├── jobs/scheduler.js       # Cron reminders
│   ├── server.js               # App entry point
│   ├── .env.example
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/              # Dashboard, Customers, Invoices, Plans, SMS, Settings
│   │   ├── components/         # Layout + sidebar
│   │   ├── hooks/useApi.js     # API client
│   │   └── App.jsx
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```
