# 🚐 Sooner Shuttle Service

A production booking platform for game-day shuttle rides at the University of Oklahoma. Riders pick a trip, choose cash or card, and get a confirmed seat with an emailed booking code — all in under 60 seconds.

**Built to solve a real problem:** On OU game days, thousands of fans need rides between motels and campus. This app runs a 15-seat van operation with real payments, real seat inventory, and zero overbooking — not a demo, not a prototype.

🔗 **Live at:** _(https://sooner-shuttle-service-production.up.railway.app/)_

---

### Why this project is interesting

- **Atomic seat reservation** — SQLite transactions guarantee no two riders can claim the same seat, even under concurrent bookings. Seats are held during checkout and auto-released if payment is abandoned.
- **Dual payment flow** — Riders choose cash (confirmed instantly, collected by the driver) or card (Stripe Checkout with webhook-driven confirmation). The organizer nets exactly $20/rider either way — card bookings are grossed up to absorb Stripe's processing fee.
- **Webhook-driven architecture** — Card bookings aren't confirmed by the frontend. The only path from "pending" to "paid" is Stripe's `checkout.session.completed` webhook, making the system tamper-proof.
- **Admin dashboard** — Real-time view of every slot: seats booked vs remaining, revenue collected vs cash outstanding, with controls to cancel bookings, mark cash collected, and resend confirmation codes.
- **Email & SMS notifications** — Booking codes sent via Resend (email) and optionally Twilio (SMS), with delivery tracking per booking and one-click resend from admin.

---

### Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS |
| Database | SQLite via `better-sqlite3` |
| Payments | Stripe Checkout + Webhooks |
| Email | Resend |
| SMS (optional) | Twilio |
| Hosting | Railway (persistent disk) |

---

_Everything below is setup and deployment documentation._

---
