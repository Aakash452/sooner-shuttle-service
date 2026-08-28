import { NextResponse } from "next/server";
import { getSlotById, MAX_RIDERS_PER_SLOT, PRICE_PER_RIDER_CENTS, directionLabel } from "@/lib/slots";
import { cardTotalCents } from "@/lib/pricing";
import { isValidEmail, isValidPhone } from "@/lib/validate";
import { attachStripeSession, cancelBooking, createPendingBooking, NotEnoughSeatsError, PENDING_HOLD_MINUTES } from "@/lib/db";
import { getSiteUrl, getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const slotId = String(body?.slotId || "");
  const name = String(body?.name || "").trim();
  const phone = String(body?.phone || "").trim();
  const email = String(body?.email || "").trim();
  const riders = Number(body?.riders);

  const slot = getSlotById(slotId);
  if (!slot) {
    return NextResponse.json({ error: "Unknown time slot" }, { status: 400 });
  }
  if (!name || name.length > 100) {
    return NextResponse.json({ error: "Please enter your name" }, { status: 400 });
  }
  if (!isValidPhone(phone)) {
    return NextResponse.json({ error: "Please enter a valid mobile number" }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email" }, { status: 400 });
  }
  if (!Number.isInteger(riders) || riders < 1 || riders > MAX_RIDERS_PER_SLOT) {
    return NextResponse.json({ error: "Invalid number of riders" }, { status: 400 });
  }

  // Gross the total up so that after Stripe's processing fee is taken out,
  // we still net $PRICE_PER_RIDER_CENTS × riders — the same amount a cash
  // rider pays. The fixed portion of the fee applies once per charge, so
  // this must be computed on the whole-cart total, not per rider.
  const netCents = riders * PRICE_PER_RIDER_CENTS;
  const totalCents = cardTotalCents(netCents);

  let booking;
  try {
    booking = createPendingBooking({ slotId, name, phone, email, riders, amountCents: totalCents });
  } catch (err) {
    if (err instanceof NotEnoughSeatsError) {
      return NextResponse.json(
        { error: `Only ${err.remaining} seat(s) left on that trip. Please refresh and pick a smaller party size or another slot.` },
        { status: 409 }
      );
    }
    console.error(err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  try {
    const stripe = getStripe();
    const siteUrl = getSiteUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      // We already collected the rider's email on our own form, so prefill
      // it (Stripe locks the field when customer_email is set, avoiding a
      // re-type) rather than relying solely on Stripe to collect it.
      customer_email: email,
      // A single line item for the whole-cart total (base price + card fee)
      // rather than a per-rider unit price, since the fee's fixed portion
      // doesn't divide evenly per rider.
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: totalCents,
            product_data: {
              name: `Sooner Shuttle — ${directionLabel(slot.direction)} (${slot.label}) × ${riders} rider${riders > 1 ? "s" : ""}`,
              description: `${slot.from} → ${slot.to} · includes card processing fee`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        bookingId: String(booking.id),
        bookingCode: booking.booking_code,
        slotId: slot.id,
        riders: String(riders),
        name,
        phone,
      },
      expires_at: Math.floor(Date.now() / 1000) + PENDING_HOLD_MINUTES * 60,
      success_url: `${siteUrl}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/?canceled=1`,
    });

    attachStripeSession(booking.id, session.id);

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error(err);
    // Stripe never got a valid session going, so release the seat hold
    // immediately instead of leaving it tied up for the full TTL.
    cancelBooking(booking.id);
    return NextResponse.json(
      { error: "Could not start payment. Please try again in a moment." },
      { status: 500 }
    );
  }
}
