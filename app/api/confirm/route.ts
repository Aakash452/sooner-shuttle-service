import { NextResponse } from "next/server";
import { getBookingBySessionId } from "@/lib/db";
import { getSlotById, directionLabel } from "@/lib/slots";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  const booking = getBookingBySessionId(sessionId);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  const slot = getSlotById(booking.slot_id);

  return NextResponse.json({
    status: booking.status, // pending | paid | cancelled | expired
    booking:
      booking.status === "paid"
        ? {
            code: booking.booking_code,
            name: booking.name,
            phone: booking.phone,
            riders: booking.riders,
            amount: booking.amount_cents / 100,
            slot: slot
              ? {
                  direction: directionLabel(slot.direction),
                  label: slot.label,
                  from: slot.from,
                  to: slot.to,
                }
              : null,
          }
        : null,
  });
}
