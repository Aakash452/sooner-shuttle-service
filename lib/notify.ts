import { Resend } from "resend";
import {
  BookingRow,
  markConfirmationSent,
  markSmsSent,
  recordNotifyError,
} from "./db";
import { getSlotById, directionLabel } from "./slots";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error("RESEND_API_KEY is not set in the environment");
  }
  _resend = new Resend(key);
  return _resend;
}

type SendOutcome = { ok: true } | { ok: false; error: string };

function bookingContent(booking: BookingRow) {
  const slot = getSlotById(booking.slot_id);
  const slotLabel = slot ? `${directionLabel(slot.direction)} — ${slot.label}` : booking.slot_id;
  const route = slot ? `${slot.from} → ${slot.to}` : "";
  const amount = (booking.amount_cents / 100).toFixed(2);
  return { slot, slotLabel, route, amount };
}

function buildEmail(booking: BookingRow) {
  const { slotLabel, route, amount } = bookingContent(booking);
  const subject = `Your Sooner Shuttle booking code: ${booking.booking_code}`;
  const text = [
    "You're booked!",
    "",
    `Booking code: ${booking.booking_code}`,
    `Trip: ${slotLabel}`,
    `Route: ${route}`,
    `Riders: ${booking.riders}`,
    `Amount paid: $${amount}`,
    "",
    "Show this code when you board. See you at the shuttle!",
  ].join("\n");
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
      <p style="color: #841617; font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase; font-size: 12px; margin-bottom: 4px;">
        Sooner Shuttle Service
      </p>
      <h1 style="margin: 4px 0 16px; font-size: 24px;">You&rsquo;re booked!</h1>
      <p style="background: #0b0b0d; color: #FDB927; font-size: 28px; font-weight: bold; letter-spacing: 0.1em; padding: 16px; border-radius: 12px; text-align: center;">
        ${booking.booking_code}
      </p>
      <table style="width: 100%; font-size: 14px; margin-top: 16px; border-collapse: collapse;">
        <tr><td style="color: #666; padding: 4px 0;">Trip</td><td style="text-align: right;">${slotLabel}</td></tr>
        <tr><td style="color: #666; padding: 4px 0;">Route</td><td style="text-align: right;">${route}</td></tr>
        <tr><td style="color: #666; padding: 4px 0;">Riders</td><td style="text-align: right;">${booking.riders}</td></tr>
        <tr><td style="color: #666; padding: 4px 0;">Amount paid</td><td style="text-align: right; font-weight: bold;">$${amount}</td></tr>
      </table>
      <p style="color: #666; font-size: 12px; margin-top: 24px;">
        Show this code when you board. See you at the shuttle!
      </p>
    </div>`;
  return { subject, text, html };
}

export async function sendBookingConfirmationEmail(booking: BookingRow): Promise<SendOutcome> {
  const to = booking.email;
  if (!to) return { ok: false, error: "No email on file for this booking" };
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) return { ok: false, error: "RESEND_FROM_EMAIL is not configured" };

  try {
    const { subject, text, html } = buildEmail(booking);
    const resend = getResend();
    const result = await resend.emails.send({ from, to, subject, text, html });
    if (result.error) {
      return { ok: false, error: result.error.message || String(result.error) };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function sendBookingConfirmationSms(booking: BookingRow): Promise<SendOutcome> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) {
    return { ok: false, error: "Twilio env vars are not fully configured" };
  }

  const { slotLabel, amount } = bookingContent(booking);
  const body = `Sooner Shuttle: you're booked! Code ${booking.booking_code} — ${slotLabel}, ${booking.riders} rider(s), $${amount} paid. Show this code to board.`;

  try {
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const params = new URLSearchParams({ To: booking.phone, From: from, Body: body });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Twilio ${res.status}: ${detail.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface DeliveryResult {
  emailOk: boolean;
  emailError?: string;
  smsAttempted: boolean;
  smsOk?: boolean;
  smsError?: string;
}

/**
 * Sends the booking-code email (and, if ENABLE_SMS=true, a text) and
 * persists the outcome on the booking row. Never throws — a delivery
 * failure is logged and recorded on `notify_last_error` for admins to see
 * and retry from the dashboard, but must never break the caller (the
 * Stripe webhook still needs to return 200 either way).
 */
export async function deliverBookingConfirmation(booking: BookingRow): Promise<DeliveryResult> {
  const result: DeliveryResult = { emailOk: false, smsAttempted: false };
  const errors: string[] = [];

  const emailResult = await sendBookingConfirmationEmail(booking);
  result.emailOk = emailResult.ok;
  if (emailResult.ok) {
    markConfirmationSent(booking.id);
  } else {
    result.emailError = emailResult.error;
    console.error(`[notify] booking ${booking.booking_code}: email failed — ${emailResult.error}`);
    errors.push(`email: ${emailResult.error}`);
  }

  if (process.env.ENABLE_SMS === "true") {
    result.smsAttempted = true;
    const smsResult = await sendBookingConfirmationSms(booking);
    result.smsOk = smsResult.ok;
    if (smsResult.ok) {
      markSmsSent(booking.id);
    } else {
      result.smsError = smsResult.error;
      console.error(`[notify] booking ${booking.booking_code}: sms failed — ${smsResult.error}`);
      errors.push(`sms: ${smsResult.error}`);
    }
  }

  if (errors.length > 0) {
    recordNotifyError(booking.id, errors.join(" | "));
  }

  return result;
}
