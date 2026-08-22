import { NextResponse } from "next/server";
import { availabilityForAllSlots } from "@/lib/db";
import { directionLabel } from "@/lib/slots";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = availabilityForAllSlots().map((a) => ({
    id: a.slot.id,
    direction: a.slot.direction,
    directionLabel: directionLabel(a.slot.direction),
    label: a.slot.label,
    from: a.slot.from,
    to: a.slot.to,
    booked: a.booked,
    remaining: a.remaining,
    soldOut: a.soldOut,
  }));
  return NextResponse.json({ slots: data });
}
