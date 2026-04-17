# PingPay — SMS Billing System

A self-hosted billing and SMS reminder system for NAS service providers. Customers interact entirely through text messages — no app or account needed. You manage everything through a private admin panel.
 
---

## Features

### Customer-Facing (SMS)
Customers text in keywords to get instant responses:

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
- **Payment confirmation receipt** when marked paid

### Admin Panel
- Dashboard with revenue stats, pending/overdue counts, SMS activity
- Full customer CRUD — add, edit, suspend, delete
- Invoice management — create, mark paid, send card payment links
- Service plan builder — name, price, billing cycle, feature list
- Manual SMS sender with quick templates
- SMS log — full inbound/outbound history per customer
- Settings — business name, payment instructions, Twilio status, Stripe status, reminder schedule, password change

### Payment Methods
- **Zelle** — instructions sent via SMS
- **Apple Pay** — instructions sent via SMS
- **Cash** — instructions sent via SMS
- **Card (Stripe)** — send a secure Stripe checkout link via SMS; payment auto-confirmed on completion

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js + Express + SQLite |
| Frontend | React + Vite |
| Reverse Proxy | nginx |
| SMS | Twilio |
| Card Payments | Stripe Checkout |
| Scheduler | node-cron |
| Auth | JWT |
| Docker | Multi-container, amd64 |
| CI/CD | GitHub Actions → GHCR |

---

## Setup

### 1. Point your domain to your NAS

1. Set nameservers to Cloudflare in your registrar
2. Add your domain to Cloudflare
3. In your Cloudflare tunnel, add a public hostname:
   - **Domain**: `yourdomain.com`
   - **Service**: `http://pingpay-nginx:80`

### 2. Configure environment

```bash
cd /share/Container/pingpay/backend
cp .env.example .env
nano .env
```

Fill in at minimum:
```env
JWT_SECRET=your_very_long_random_secret_here
ADMIN_PASSWORD=your_secure_password
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
PUBLIC_URL=https://yourdomain.com
CORS_ORIGIN=https://yourdomain.com
```

Optionally add Stripe for card payments:
```env
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxx
```

### 3. Set up Twilio

1. Sign up at [console.twilio.com](https://console.twilio.com)
2. Buy a phone number with SMS capability (~$1/month)
3. Go to **Phone Numbers → Manage → Active Numbers → your number**
4. Under **Messaging**, set the inbound webhook to:
   ```
   https://yourdomain.com/api/sms/inbound
   ```
   Method: **HTTP POST**

### 4. Set up Stripe (optional)

1. Sign up at [dashboard.stripe.com](https://dashboard.stripe.com)
2. Get your API keys from **Developers → API Keys**
3. Set up a webhook at **Developers → Webhooks → Add endpoint**:
   - URL: `https://yourdomain.com/api/stripe/webhook`
   - Event: `checkout.session.completed`
4. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`

### 5. Deploy on QNAP

```bash
mkdir -p /share/Container/pingpay/nginx
# Place docker-compose.yml, nginx/nginx.conf, and .env in /share/Container/pingpay/
cd /share/Container/pingpay
docker compose pull
docker compose up -d
docker network connect pingpay_pingpay-net cloudflared-1
```

**Important**: Never use `docker compose down` — use `docker restart pingpay-backend` to avoid data loss.

### 6. First login

Default credentials: `admin` / whatever you set as `ADMIN_PASSWORD`
**Change your password immediately** in Settings after first login.

---

## Updating

After pushing changes to `main`, GitHub Actions rebuilds the images automatically. To deploy on the QNAP:

```bash
cd /share/Container/pingpay
docker compose pull
docker restart pingpay-nginx pingpay-backend pingpay-frontend
```

---

## Payment Flow

### Zelle / Apple Pay / Cash
1. Reminders fire automatically at 7, 3, 1 days out
2. Customer pays manually and notifies you
3. Admin → Invoices → **✓ Paid** — receipt SMS sent automatically

### Card (Stripe)
1. Admin → Invoices → **💳 Card Link** — sends customer a Stripe checkout link via SMS
2. Customer pays with their card on Stripe's hosted checkout page
3. Stripe webhook fires → invoice auto-marked paid → receipt SMS sent automatically

---

## Backup

```bash
docker exec pingpay-backend cp /data/pingpay.db /data/pingpay_backup_$(date +%Y%m%d).db
```

---

## Directory Structure

```
pingpay/
├── .github/workflows/
│   └── docker.yml              # GitHub Actions — builds amd64 images on push to main
├── nginx/
│   └── nginx.conf              # Reverse proxy — /api → backend, / → frontend
├── backend/
│   ├── db/database.js          # SQLite schema
│   ├── middleware/auth.js      # JWT middleware
│   ├── routes/
│   │   ├── auth.js             # Login, password change
│   │   ├── customers.js        # Customer CRUD + SMS
│   │   ├── invoices.js         # Invoice management
│   │   ├── plans.js            # Service plans
│   │   ├── sms.js              # Twilio webhook, log, settings, dashboard
│   │   └── stripe.js           # Stripe checkout, payment links, webhook
│   ├── services/smsService.js  # Twilio send/receive + keyword bot
│   ├── jobs/scheduler.js       # Cron reminders
│   ├── server.js
│   ├── .env.example
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   └── hooks/useApi.js
│   └── Dockerfile
├── .gitignore
├── docker-compose.yml
└── README.md
```
