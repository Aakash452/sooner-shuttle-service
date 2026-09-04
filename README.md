# Sooner Shuttle Service

A production booking platform for game-day shuttle rides at the University of Oklahoma. Riders pick a trip, choose cash or card, and get a confirmed seat with an emailed booking code — all in under 60 seconds.

**Built to solve a real problem:** On OU game days, thousands of fans need rides between motels and campus. This app runs a 15-seat van operation with real payments, real seat inventory, and zero overbooking — not a demo, not a prototype.

🔗 **Live at:** _(https://sooner-shuttle-service-production.up.railway.app/)_

---

### Why this project is interesting

- **Atomic seat reservation** — SQLite transactions guarantee no two riders can claim the same seat, even under concurrent bookings. Seats are held during checkout and auto-released if payment is abandoned.
- **Dual payment flow** — Riders choose cash (confirmed instantly, collected by the driver) or card (Stripe Checkout with webhook-driven confirmation). The organizer nets exactly $20/rider either way — card bookings are grossed up to absorb Stripe's processing fee.
- **Webhook-driven architecture** — Card bookings aren't confirmed by the frontend. The only path from "pending" to "paid" is Stripe's `checkout.session.completed` webhook, making the system tamper-proof.
- **Admin dashboard** — Real-time view of every slot: seats booked vs remaining, revenue collected vs cash outstanding, with controls to cancel bookings, mark cash collected, and resend confirmation codes.
- **Email & SMS notifications** — Booking codes sent via Gmail SMTP (Nodemailer) and optionally Twilio (SMS), with delivery tracking per booking and one-click resend from admin.

---

### Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS |
| Database | SQLite via `better-sqlite3` |
| Payments | Stripe Checkout + Webhooks |
| Email | Gmail SMTP (Nodemailer) |
| SMS (optional) | Twilio |
| Hosting | Railway (persistent disk) |

---

### Route & Schedule

| | Details |
|---|---|
| **Pickup** | 770 Copperfield Dr, Norman, OK 73072 |
| **Drop-off** | 900 College Ave, Norman, OK 73072 |
| **Price** | $20/person (14 paying riders per trip, 15-seat van incl. driver) |

| Direction | Trip Times |
|---|---|
| To campus | 3:00 PM · 4:30 PM · 6:00 PM |
| Return to motel | 10:30 PM · 12:00 AM |

---

## Getting Started

### 1. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in:

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | From the [Stripe dashboard](https://dashboard.stripe.com/apikeys). Use `sk_test_...` first, swap to `sk_live_...` on game day. |
| `STRIPE_WEBHOOK_SECRET` | See [Stripe webhook setup](#3-set-up-the-stripe-webhook-production). |
| `ADMIN_PASSWORD` | Password for the `/admin` dashboard. |
| `ADMIN_SESSION_SECRET` | A long random string — generate with `openssl rand -hex 32`. |
| `NEXT_PUBLIC_EVENT_DATE_LABEL` | Displayed at the top of the page, e.g. `"Saturday, Sept 5, 2026"`. |
| `NEXT_PUBLIC_SITE_URL` | Your deployed URL (Stripe redirects here). Use `http://localhost:3000` for local dev. |
| `GMAIL_USER` | See [Gmail SMTP setup](#1a-set-up-gmail-smtp-booking-code-email). |
| `GMAIL_APP_PASSWORD` | 16-character App Password for that Gmail account (not your normal password). |
| `ENABLE_SMS` | Set to `true` to enable Twilio SMS (off by default). |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` | Optional — see [Twilio setup](#1b-optional-text-the-code-via-twilio). |

#### 1a. Set up Gmail SMTP (booking-code email)

Emails send through Nodemailer over Gmail's SMTP, using the Gmail account
you point it at:

1. Turn on **2-Step Verification** on the Gmail account you want to send from, if it isn't already: [myaccount.google.com/security](https://myaccount.google.com/security).
2. Generate an **App Password**: Google Account → Security → 2-Step Verification → **App passwords**. Create one (any name, e.g. "Sooner Shuttle") — Google gives you a 16-character password. Your normal Gmail password won't work for SMTP.
3. Set `GMAIL_USER` to that Gmail address, and `GMAIL_APP_PASSWORD` to the 16-character app password (spaces are fine either way).

Emails send as `"Sooner Shuttle Service" <GMAIL_USER>`. Gmail's SMTP has a sending-volume limit (roughly 500/day on a normal account) — plenty for a one-day event, but not something to build a bigger product on.

Stripe Checkout collects the rider's email automatically — no additional configuration needed.

#### 1b. Optional: text the code via Twilio

1. Get a Twilio account SID, auth token, and SMS-capable phone number from [twilio.com](https://www.twilio.com).
2. Set `ENABLE_SMS=true`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM`.

If `ENABLE_SMS` isn't `"true"`, SMS is skipped entirely and unset Twilio vars are ignored.

### 2. Install & run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`. The SQLite file is created automatically at `data/bookings.db` on first run.

To test payments locally, forward Stripe webhooks with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhook
```

That command prints a `whsec_...` value — put it in `.env.local` as `STRIPE_WEBHOOK_SECRET` and restart the dev server. Use Stripe's test card `4242 4242 4242 4242`, any future expiry, any CVC.

### 3. Set up the Stripe webhook (production)

In the Stripe dashboard → **Developers → Webhooks**, add an endpoint pointing at `https://<your-domain>/api/webhook` and subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

Copy the endpoint's signing secret into `STRIPE_WEBHOOK_SECRET` on your host. The webhook is what actually confirms a booking — a seat is only marked `paid` once Stripe confirms payment, so it must be internet-reachable before you go live.

### 4. Deploy

This app writes to a local SQLite file, so **it needs a host with a persistent disk and a single running instance** — plain serverless platforms (e.g. Vercel's default Node functions) won't keep the file between requests. Good fits: **Railway, Render, Fly.io, or a small VPS.**

1. Push this repo to GitHub and connect it to your host.
2. Set all environment variables from `.env.example` in the host's dashboard.
3. Mount a persistent volume at `<project>/data` (Railway/Render/Fly all support this).
4. Build command: `npm run build` · Start command: `npm run start`.
5. Point `NEXT_PUBLIC_SITE_URL` at the deployed domain.
6. Point the Stripe webhook at `https://<your-domain>/api/webhook`.
7. Switch from test (`sk_test_...`) to live (`sk_live_...`) Stripe keys when ready for real payments — test and live webhooks are separate, so re-create the endpoint for live mode.

Back up `data/bookings.db` after the event — `sqlite3 data/bookings.db .dump` works, or export from the admin dashboard.

---

## How It Works

### Booking & payment flow

```
Rider selects slot → enters name / phone / email → picks Cash or Card → chooses rider count
                          │                                    │
                    ┌─────┘                                    └─────┐
                    ▼                                                ▼
              CASH PATH                                        CARD PATH
         POST /api/reserve-cash                           POST /api/checkout
     Atomically checks seats,                         Atomically checks seats,
     inserts confirmed booking,                       inserts pending booking
     sends email immediately                          (31-min hold), creates
              │                                       Stripe Checkout Session
              ▼                                              │
     /confirmation?code=...                                  ▼
     Rider gets booking code                          Rider pays on Stripe
                                                             │
                                                             ▼
                                                    POST /api/webhook
                                                  (checkout.session.completed)
                                                    Flips booking to paid,
                                                    sends confirmation email
                                                             │
                                                             ▼
                                                    /confirmation?code=...
                                                    (polls until webhook lands)
```

**Seat availability** = 14 − (confirmed riders + riders mid-checkout for that slot), so seats can never be oversold regardless of payment method.

**Email delivery** happens once per booking — immediately for cash, on the pending→paid webhook for card, never re-sent on duplicate webhook events. A delivery failure is logged but never blocks the reservation.

### Pricing logic

`PRICE_PER_RIDER_CENTS` in `lib/slots.ts` = $20.00 — what the organizer nets per rider:

- **Cash on board** — exactly $20 × riders, collected by the driver. Shows as "Cash due" in admin until marked collected.
- **Card now** — $20 × riders, grossed up so that after Stripe's fee the organizer still nets $20/rider. The gross-up uses Stripe's standard US rate (2.9% + $0.30, configurable in `lib/pricing.ts`). Actual fees vary slightly by card type.

### Admin panel

`/admin` → log in with `ADMIN_PASSWORD`. The dashboard groups bookings by slot and shows seats booked/remaining, revenue collected, and outstanding cash due. Actions available:

- **Cancel** a booking (frees seats immediately)
- **Mark cash collected** / **Mark paid** (flips payment status)
- **Resend code** (re-sends confirmation email, with delivery status visible per row)

---

## Known Limitations

- Overbooking protection relies on SQLite transactions inside a single Node.js process — don't run multiple instances behind a load balancer without switching to a multi-writer database.
- Phone/name/email are not verified beyond basic format checks.
- SMS is sent alongside the email only, never instead of it — email is always required.
- The card processing fee is an estimate (Stripe's published rate), not recalculated from actual per-charge fees — some card types (Amex, international) may net a few cents less than $20/rider.

---

## License

MIT
