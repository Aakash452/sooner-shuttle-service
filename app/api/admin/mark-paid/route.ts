import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminGuard";
import { getBookingById, markPaidManually } from "@/lib/db";

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
  markPaidManually(id);
  return NextResponse.json({ ok: true });
}
