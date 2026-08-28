import { NextResponse } from "next/server";
import { getSlotById, MAX_RIDERS_PER_SLOT, PRICE_PER_RIDER_CENTS } from "@/lib/slots";
import { isValidEmail, isValidPhone } from "@/lib/validate";
import { createCashBooking, NotEnoughSeatsError } from "@/lib/db";
import { deliverBookingConfirmation } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * Reserves a seat to be paid in cash on board. No Stripe involved — the
 * seat is confirmed immediately, same as a successful card payment, and
 * the rider gets a booking code back synchronously instead of being
 * redirected anywhere.
 */
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

  const amountCents = riders * PRICE_PER_RIDER_CENTS;

  let booking;
  try {
    booking = createCashBooking({ slotId, name, phone, email, riders, amountCents });
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

  // Best-effort confirmation email — the reservation already succeeded and
  // holds the seat regardless of whether this send works.
  try {
    await deliverBookingConfirmation(booking);
  } catch (err) {
    console.error(`[reserve-cash] confirmation delivery threw unexpectedly for ${booking.booking_code}`, err);
  }

  return NextResponse.json({ bookingCode: booking.booking_code });
}
