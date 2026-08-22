import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { MAX_RIDERS_PER_SLOT, SLOTS } from "./slots";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "bookings.db");

// A held ("pending") booking counts against the seat cap for this many
// minutes while the rider is on the Stripe Checkout page. Matches the
// `expires_at` we set on the Checkout Session itself.
// Stripe requires Checkout Session `expires_at` to be at least 30 minutes out;
// 31 gives a small safety margin against clock skew.
export const PENDING_HOLD_MINUTES = 31;

declare global {
  // eslint-disable-next-line no-var
  var __shuttleDb: Database.Database | undefined;
}

/** Adds `column` to `table` if it isn't already there — a minimal migration
 * so upgrading this file doesn't require dropping an existing bookings.db. */
function ensureColumn(db: Database.Database, table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

function buildDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      slot_id TEXT NOT NULL,
      riders INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | cancelled | expired
      payment_status TEXT NOT NULL DEFAULT 'unpaid', -- unpaid | paid | paid_manual | refunded
      stripe_session_id TEXT,
      stripe_payment_intent TEXT,
      created_at TEXT NOT NULL,
      paid_at TEXT,
      cancelled_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_bookings_slot ON bookings(slot_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_session ON bookings(stripe_session_id);
  `);

  // Added for booking-code delivery: rider email (collected by Stripe
  // Checkout) plus delivery bookkeeping so confirmations are sent exactly
  // once per held→paid transition and failures are visible to admins.
  ensureColumn(db, "bookings", "email", "email TEXT");
  ensureColumn(db, "bookings", "confirmation_sent_at", "confirmation_sent_at TEXT");
  ensureColumn(db, "bookings", "sms_sent_at", "sms_sent_at TEXT");
  ensureColumn(db, "bookings", "notify_last_error", "notify_last_error TEXT");

  return db;
}

export function getDb(): Database.Database {
  if (!global.__shuttleDb) {
    global.__shuttleDb = buildDb();
  }
  return global.__shuttleDb;
}

function pendingCutoffIso(): string {
  return new Date(Date.now() - PENDING_HOLD_MINUTES * 60_000).toISOString();
}

export interface BookingRow {
  id: number;
  booking_code: string;
  name: string;
  phone: string;
  slot_id: string;
  riders: number;
  amount_cents: number;
  status: "pending" | "paid" | "cancelled" | "expired";
  payment_status: "unpaid" | "paid" | "paid_manual" | "refunded";
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  created_at: string;
  paid_at: string | null;
  cancelled_at: string | null;
  email: string | null;
  confirmation_sent_at: string | null;
  sms_sent_at: string | null;
  notify_last_error: string | null;
}

/** Riders currently holding a seat for a slot: paid, or pending within the hold window. */
export function ridersBookedForSlot(slotId: string): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(riders), 0) as total FROM bookings
       WHERE slot_id = ?
         AND (status = 'paid' OR (status = 'pending' AND created_at > ?))`
    )
    .get(slotId, pendingCutoffIso()) as { total: number };
  return row.total;
}

export function availabilityForAllSlots() {
  return SLOTS.map((slot) => {
    const booked = ridersBookedForSlot(slot.id);
    const remaining = Math.max(0, MAX_RIDERS_PER_SLOT - booked);
    return {
      slot,
      booked,
      remaining,
      soldOut: remaining <= 0,
    };
  });
}

function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 confusion
  let code = "SS-";
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export class NotEnoughSeatsError extends Error {
  constructor(public remaining: number) {
    super(`Only ${remaining} seat(s) left on this trip`);
  }
}

/**
 * Atomically checks capacity and inserts a pending booking hold.
 * Runs inside a single-writer SQLite transaction so it is safe against
 * concurrent requests within this server process.
 */
export function createPendingBooking(params: {
  slotId: string;
  name: string;
  phone: string;
  riders: number;
  amountCents: number;
}): BookingRow {
  const db = getDb();
  const insert = db.transaction(() => {
    const booked = ridersBookedForSlot(params.slotId);
    const remaining = MAX_RIDERS_PER_SLOT - booked;
    if (params.riders > remaining) {
      throw new NotEnoughSeatsError(Math.max(0, remaining));
    }
    let code = generateCode();
    // extremely unlikely collision loop, just in case
    while (db.prepare("SELECT 1 FROM bookings WHERE booking_code = ?").get(code)) {
      code = generateCode();
    }
    const now = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO bookings
          (booking_code, name, phone, slot_id, riders, amount_cents, status, payment_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', 'unpaid', ?)`
      )
      .run(code, params.name, params.phone, params.slotId, params.riders, params.amountCents, now);
    return db.prepare("SELECT * FROM bookings WHERE id = ?").get(info.lastInsertRowid) as BookingRow;
  });
  return insert();
}

export function attachStripeSession(bookingId: number, sessionId: string) {
  getDb()
    .prepare("UPDATE bookings SET stripe_session_id = ? WHERE id = ?")
    .run(sessionId, bookingId);
}

export function getBookingBySessionId(sessionId: string): BookingRow | undefined {
  return getDb()
    .prepare("SELECT * FROM bookings WHERE stripe_session_id = ?")
    .get(sessionId) as BookingRow | undefined;
}

export function getBookingByCode(code: string): BookingRow | undefined {
  return getDb()
    .prepare("SELECT * FROM bookings WHERE booking_code = ?")
    .get(code) as BookingRow | undefined;
}

/**
 * Flips a held booking to paid. Returns true only if this call actually
 * performed the pending/held → paid transition (i.e. it's the first time
 * we've seen this session succeed) — callers use that to decide whether to
 * send the confirmation, so a duplicate/retried webhook event never resends.
 */
export function markPaidBySessionId(sessionId: string, paymentIntentId: string | null): boolean {
  const now = new Date().toISOString();
  const info = getDb()
    .prepare(
      `UPDATE bookings SET status = 'paid', payment_status = 'paid',
        stripe_payment_intent = ?, paid_at = ?
       WHERE stripe_session_id = ? AND status != 'paid'`
    )
    .run(paymentIntentId, now, sessionId);
  return info.changes > 0;
}

/** Stores the rider's email as soon as Stripe Checkout collects it — called
 * on the still-held booking row, before (or independent of) payment success. */
export function setBookingEmailBySessionId(sessionId: string, email: string | null) {
  if (!email) return;
  getDb().prepare("UPDATE bookings SET email = ? WHERE stripe_session_id = ?").run(email, sessionId);
}

export function markConfirmationSent(id: number) {
  const now = new Date().toISOString();
  getDb()
    .prepare("UPDATE bookings SET confirmation_sent_at = ?, notify_last_error = NULL WHERE id = ?")
    .run(now, id);
}

export function markSmsSent(id: number) {
  const now = new Date().toISOString();
  getDb().prepare("UPDATE bookings SET sms_sent_at = ? WHERE id = ?").run(now, id);
}

export function recordNotifyError(id: number, message: string) {
  getDb()
    .prepare("UPDATE bookings SET notify_last_error = ? WHERE id = ?")
    .run(message.slice(0, 500), id);
}

export function expireBySessionId(sessionId: string) {
  getDb()
    .prepare(
      `UPDATE bookings SET status = 'expired'
       WHERE stripe_session_id = ? AND status = 'pending'`
    )
    .run(sessionId);
}

export function listAllBookings(): BookingRow[] {
  return getDb()
    .prepare("SELECT * FROM bookings ORDER BY created_at DESC")
    .all() as BookingRow[];
}

export function getBookingById(id: number): BookingRow | undefined {
  return getDb().prepare("SELECT * FROM bookings WHERE id = ?").get(id) as
    | BookingRow
    | undefined;
}

export function cancelBooking(id: number) {
  const now = new Date().toISOString();
  getDb()
    .prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE id = ?")
    .run(now, id);
}

export function markPaidManually(id: number) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE bookings SET status = 'paid', payment_status = 'paid_manual', paid_at = ?
       WHERE id = ?`
    )
    .run(now, id);
}
