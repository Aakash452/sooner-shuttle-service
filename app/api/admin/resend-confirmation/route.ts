import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminGuard";
import { getBookingById } from "@/lib/db";
import { deliverBookingConfirmation } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const id = Number(body?.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid booking id" }, { status: 400 });
  }

  const booking = getBookingById(id);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (booking.status !== "paid") {
    return NextResponse.json(
      { error: "Booking is not paid yet — nothing to resend" },
      { status: 400 }
    );
  }
  if (!booking.email) {
    return NextResponse.json({ error: "This booking has no email on file" }, { status: 400 });
  }

  const result = await deliverBookingConfirmation(booking);
  if (!result.emailOk) {
    return NextResponse.json({ error: `Resend failed: ${result.emailError}` }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
