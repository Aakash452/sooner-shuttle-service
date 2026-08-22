import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import {
  expireBySessionId,
  getBookingBySessionId,
  markPaidBySessionId,
  setBookingEmailBySessionId,
} from "@/lib/db";
import { deliverBookingConfirmation } from "@/lib/notify";

// Stripe needs the raw request body to verify the webhook signature.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;

      // Store the rider's email on the held booking row as soon as Stripe
      // hands it to us — this fires even for async payment methods whose
      // session "completes" before payment actually clears.
      const email = session.customer_details?.email || null;
      if (email) {
        setBookingEmailBySessionId(session.id, email);
      }

      if (session.payment_status === "paid") {
        const transitioned = markPaidBySessionId(session.id, (session.payment_intent as string) || null);
        // Only the call that actually flips pending/held -> paid sends the
        // confirmation, so a Stripe retry of the same event never resends.
        if (transitioned) {
          const booking = getBookingBySessionId(session.id);
          if (booking && !booking.confirmation_sent_at) {
            try {
              await deliverBookingConfirmation(booking);
            } catch (err) {
              // deliverBookingConfirmation already catches and records its
              // own send failures — this is a last-resort net so nothing
              // here can ever fail the webhook response to Stripe.
              console.error(`[webhook] confirmation delivery threw unexpectedly for session ${session.id}`, err);
            }
          }
        }
      }
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      expireBySessionId(session.id);
      break;
    }
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      expireBySessionId(session.id);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
