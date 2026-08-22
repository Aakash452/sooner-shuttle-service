import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminGuard";
import { listAllBookings } from "@/lib/db";
import { SLOTS, MAX_RIDERS_PER_SLOT, directionLabel } from "@/lib/slots";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bookings = listAllBookings();

  const bySlot = SLOTS.map((slot) => {
    const rows = bookings.filter((b) => b.slot_id === slot.id);
    const activeRows = rows.filter(
      (b) => b.status === "paid" || b.status === "pending"
    );
    const booked = activeRows.reduce((sum, b) => sum + b.riders, 0);
    return {
      slot: {
        id: slot.id,
        label: slot.label,
        direction: slot.direction,
        directionLabel: directionLabel(slot.direction),
        from: slot.from,
        to: slot.to,
      },
      capacity: MAX_RIDERS_PER_SLOT,
      booked,
      remaining: Math.max(0, MAX_RIDERS_PER_SLOT - booked),
      revenueCents: rows
        .filter((b) => b.status === "paid")
        .reduce((sum, b) => sum + b.amount_cents, 0),
      bookings: rows.map((b) => ({
        id: b.id,
        code: b.booking_code,
        name: b.name,
        phone: b.phone,
        email: b.email,
        riders: b.riders,
        amountCents: b.amount_cents,
        status: b.status,
        paymentStatus: b.payment_status,
        createdAt: b.created_at,
        paidAt: b.paid_at,
        confirmationSentAt: b.confirmation_sent_at,
        smsSentAt: b.sms_sent_at,
        notifyLastError: b.notify_last_error,
      })),
    };
  });

  const totalRevenueCents = bookings
    .filter((b) => b.status === "paid")
    .reduce((sum, b) => sum + b.amount_cents, 0);

  const totalRidersBooked = bookings
    .filter((b) => b.status === "paid" || b.status === "pending")
    .reduce((sum, b) => sum + b.riders, 0);

  return NextResponse.json({
    bySlot,
    totalRevenueCents,
    totalRidersBooked,
  });
}
