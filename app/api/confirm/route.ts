import { NextResponse } from "next/server";
import { BookingRow, getBookingByCode, getBookingBySessionId } from "@/lib/db";
import { getSlotById, directionLabel } from "@/lib/slots";

export const dynamic = "force-dynamic";

function serializeBooking(booking: BookingRow) {
  const slot = getSlotById(booking.slot_id);
  return {
    code: booking.booking_code,
    name: booking.name,
    phone: booking.phone,
    riders: booking.riders,
    amount: booking.amount_cents / 100,
    paymentMethod: booking.payment_method, // 'card' | 'cash'
    cashCollected: booking.payment_method === "cash" && booking.payment_status !== "unpaid",
    slot: slot
      ? {
          direction: directionLabel(slot.direction),
          label: slot.label,
          from: slot.from,
          to: slot.to,
        }
      : null,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id");
  const code = searchParams.get("code");

  let booking;
  if (code) {
    // Cash bookings are confirmed synchronously — no Stripe session involved.
    booking = getBookingByCode(code.trim().toUpperCase());
  } else if (sessionId) {
    booking = getBookingBySessionId(sessionId);
  } else {
    return NextResponse.json({ error: "Missing session_id or code" }, { status: 400 });
  }

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: booking.status, // pending | paid | cancelled | expired
    booking: booking.status === "paid" ? serializeBooking(booking) : null,
  });
}
