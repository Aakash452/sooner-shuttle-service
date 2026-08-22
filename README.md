# Sooner Shuttle Service

Mobile-first booking site for a one-day game-day shuttle between:

- **Pickup (motel):** 770 Copperfield Dr, Norman, OK 73072
- **Drop-off (campus):** 900 College Ave, Norman, OK 73072
- **Price:** $25/person, 14 paying riders per trip (15-seat van incl. driver)

Trips (each a separate 14-seat hold):

| Direction | Times |
|---|---|
| To campus | 3:00 PM, 4:30 PM, 6:00 PM |
| Return to motel | 10:30 PM, 12:00 AM |

Stack: Next.js 16 (App Router) + Tailwind, SQLite (`better-sqlite3`) for the
`bookings` table, Stripe Checkout for payment, Resend for the booking-code
confirmation email (optional Twilio SMS).

## 1. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in:

- `STRIPE_SECRET_KEY` — from the [Stripe dashboard](https://dashboard.stripe.com/apikeys). Use a `sk_test_...` key first to test, swap to `sk_live_...` on game day.
- `STRIPE_WEBHOOK_SECRET` — see step 3.
- `ADMIN_PASSWORD` — the password you'll use to log into `/admin`.
- `ADMIN_SESSION_SECRET` — a long random string, e.g. `openssl rand -hex 32`.
- `NEXT_PUBLIC_EVENT_DATE_LABEL` — shown at the top of the page, e.g. `"Saturday, Sept 5, 2026"`.
- `NEXT_PUBLIC_SITE_URL` — your real deployed URL (Stripe redirects back here). Keep as `http://localhost:3000` for local dev.
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` — see step 1a below.
- `ENABLE_SMS`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` — optional, see step 1b.

### 1a. Set up Resend (booking-code email)

1. Create a free account at [resend.com](https://resend.com).
2. **Verify a sending domain or address** at
   [resend.com/domains](https://resend.com/domains) — add the DNS records
   Resend gives you (SPF/DKIM) at your domain registrar. Until a domain is
   verified you can only send test emails to your own Resend account email,
   so this step is required before real riders can receive confirmations.
3. Create an API key at [resend.com/api-keys](https://resend.com/api-keys)
   and put it in `RESEND_API_KEY`.
4. Set `RESEND_FROM_EMAIL` to an address on your verified domain, e.g.
   `"Sooner Shuttle Service <bookings@yourdomain.com>"`.

Stripe Checkout collects the rider's email automatically (it's a required
field on the Checkout page) — there's nothing else to configure for that
part.

### 1b. Optional: also text the code via Twilio

Off by default. To turn it on:

1. Get a Twilio account SID, auth token, and a phone number capable of
   sending SMS from [twilio.com](https://www.twilio.com).
2. Set `ENABLE_SMS=true`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and
   `TWILIO_FROM` (the Twilio number, e.g. `+15555550123`).

If `ENABLE_SMS` isn't `"true"`, SMS is skipped entirely and only Twilio vars
you don't set are simply ignored.

## 2. Install & run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`. The SQLite file is created automatically at
`data/bookings.db` on first run.

To test payments locally, forward Stripe webhooks with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhook
```

That command prints a `whsec_...` value — put it in `.env.local` as
`STRIPE_WEBHOOK_SECRET` and restart `npm run dev`. Use Stripe's test card
`4242 4242 4242 4242`, any future expiry, any CVC.

## 3. Set up the Stripe webhook (production)

In the Stripe dashboard → **Developers → Webhooks**, add an endpoint pointing
at `https://<your-domain>/api/webhook` and subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

Copy the endpoint's signing secret into `STRIPE_WEBHOOK_SECRET` on your host.

The webhook is what actually confirms a booking — a seat is only marked
`paid` once Stripe confirms payment there, so it must be reachable from the
internet before you go live.

## 4. Deploy

This app writes to a local SQLite file, so **it needs a host with a
persistent disk and a single running instance** — plain serverless platforms
(e.g. Vercel's default Node functions) won't keep the file around between
requests. Good fits: **Railway, Render, Fly.io, or a small VPS.**

General steps on any of those:

1. Push this project to a Git repo and connect it to the host.
2. Set the environment variables from `.env.example` in the host's dashboard.
3. Make sure `data/` is on a persistent volume (Render/Fly/Railway all support
   this — mount a volume at `<project>/data`).
4. Build command: `npm run build`. Start command: `npm run start`.
5. Point `NEXT_PUBLIC_SITE_URL` at the deployed domain, and point the Stripe
   webhook endpoint at `https://<that-domain>/api/webhook`.
6. Switch Stripe keys from test (`sk_test_...`) to live (`sk_live_...`) when
   you're ready to take real payments, and re-create the webhook endpoint
   for live mode (test and live webhooks are separate).

Back up `data/bookings.db` after the event if you want a permanent record —
it's just a SQLite file, so `sqlite3 data/bookings.db .dump` works, or export
everything from the admin dashboard.

## How booking/payment works

1. Rider picks a slot + enters name/phone/riders → `POST /api/checkout`.
2. The server atomically checks remaining seats and inserts a `pending`
   booking row holding those seats for 31 minutes, then creates a Stripe
   Checkout Session and redirects the rider to Stripe.
3. Stripe calls `POST /api/webhook` when payment succeeds, which flips the
   booking to `paid` — this is the only way a seat becomes permanently
   confirmed. If the rider abandons checkout, the session expires and the
   hold is released automatically.
4. The success page (`/confirmation`) polls until the webhook has landed,
   then shows the booking code and trip details.
5. Availability shown on the booking page = 14 − (paid riders + riders
   currently mid-checkout for that slot), so seats can never be oversold.
6. The same webhook call that flips a booking to `paid` — and only on the
   actual pending/held → paid transition, never on a retried/duplicate
   webhook event — sends the rider a confirmation email (via Resend) with
   their booking code, trip, pickup/drop-off, riders, and amount paid. If
   `ENABLE_SMS=true` it also texts the code via Twilio. A delivery failure
   is logged and recorded on the booking, but never fails the webhook or
   un-confirms the seat — payment success is what matters, notification is
   best-effort.

## Admin panel

Go to `/admin`, log in with `ADMIN_PASSWORD`. The dashboard groups bookings
by slot, shows seats booked/remaining and revenue per slot and overall, and
lets you:

- **Cancel** a booking (frees its seats immediately).
- **Mark paid** manually (e.g. a cash rider you're tracking by hand).
- **Resend code** — re-sends the confirmation email for any paid booking,
  for a rider who lost their code. Each row also shows a small "✓ code
  emailed" / "✗ email failed" note so you can see who still needs one sent
  by hand.

## Notes / limitations

- Overbooking protection relies on SQLite transactions inside a single
  Node.js process — don't run multiple instances behind a load balancer
  without moving to a real multi-writer database first.
- Phone/name are not verified beyond basic format checks.
- SMS is off by default and only sent alongside the email, never instead of
  it — there's no way to book without providing an email today, since
  Stripe Checkout requires one.
