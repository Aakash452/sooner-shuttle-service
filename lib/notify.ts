import {
  BookingRow,
  markConfirmationSent,
  markSmsSent,
  recordNotifyError,
} from "./db";
import { getSlotById, directionLabel } from "./slots";

// Gmail over raw SMTP (ports 465/587) times out from inside Railway's
// network — a common cloud-host restriction — so email sends through
// Gmail's REST API over HTTPS instead (port 443, never blocked), using an
// OAuth2 refresh token instead of an app password.

function b64url(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function encodeHeader(text: string): string {
  // RFC 2047 encoded-word, so non-ASCII subjects (em dashes, etc) survive.
  return `=?UTF-8?B?${Buffer.from(text, "utf-8").toString("base64")}?=`;
}

async function getGmailAccessToken(): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN are not set");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gmail token refresh failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Gmail token refresh returned no access_token");
  return data.access_token;
}

/** Sends a MIME email via the Gmail API. `from` must be the authenticated
 * account (GMAIL_USER) — the Gmail API won't let a regular account send as
 * a different address, only the display name is customizable. */
async function sendViaGmailApi(params: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const accessToken = await getGmailAccessToken();
  const boundary = "sooner-shuttle-boundary";
  const message = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${encodeHeader(params.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(params.text, "utf-8").toString("base64"),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(params.html, "utf-8").toString("base64"),
    "",
    `--${boundary}--`,
  ].join("\r\n");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: b64url(message) }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gmail API send failed (${res.status}): ${detail.slice(0, 300)}`);
  }
}

type SendOutcome = { ok: true } | { ok: false; error: string };

function bookingContent(booking: BookingRow) {
  const slot = getSlotById(booking.slot_id);
  const slotLabel = slot ? `${directionLabel(slot.direction)} — ${slot.label}` : booking.slot_id;
  const route = slot ? `${slot.from} → ${slot.to}` : "";
  const amount = (booking.amount_cents / 100).toFixed(2);
  const isCash = booking.payment_method === "cash";
  const amountLabel = isCash ? "Amount due (cash)" : "Amount paid";
  return { slot, slotLabel, route, amount, isCash, amountLabel };
}

function buildEmail(booking: BookingRow) {
  const { slotLabel, route, amount, isCash, amountLabel } = bookingContent(booking);
  const subject = `Your Sooner Shuttle booking code: ${booking.booking_code}`;
  const cashNote = isCash ? "Please have exact cash ready — pay the driver when you board." : "";
  const text = [
    "You're booked!",
    "",
    `Booking code: ${booking.booking_code}`,
    `Trip: ${slotLabel}`,
    `Route: ${route}`,
    `Riders: ${booking.riders}`,
    `${amountLabel}: $${amount}`,
    "",
    isCash ? cashNote : "",
    "Show this code when you board. See you at the shuttle!",
  ]
    .filter(Boolean)
    .join("\n");
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
        <tr><td style="color: #666; padding: 4px 0;">${amountLabel}</td><td style="text-align: right; font-weight: bold;">$${amount}</td></tr>
      </table>
      ${isCash ? `<p style="color: #841617; font-size: 13px; margin-top: 16px; font-weight: bold;">${cashNote}</p>` : ""}
      <p style="color: #666; font-size: 12px; margin-top: 24px;">
        Show this code when you board. See you at the shuttle!
      </p>
    </div>`;
  return { subject, text, html };
}

export async function sendBookingConfirmationEmail(booking: BookingRow): Promise<SendOutcome> {
  const to = booking.email;
  if (!to) return { ok: false, error: "No email on file for this booking" };
  const user = process.env.GMAIL_USER;
  if (!user) return { ok: false, error: "GMAIL_USER is not configured" };

  try {
    const { subject, text, html } = buildEmail(booking);
    await sendViaGmailApi({
      from: `"Sooner Shuttle Service" <${user}>`,
      to,
      subject,
      text,
      html,
    });
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

  const { slotLabel, amount, isCash } = bookingContent(booking);
  const moneyPhrase = isCash ? `$${amount} due in cash` : `$${amount} paid`;
  const body = `Sooner Shuttle: you're booked! Code ${booking.booking_code} — ${slotLabel}, ${booking.riders} rider(s), ${moneyPhrase}. Show this code to board.`;

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
