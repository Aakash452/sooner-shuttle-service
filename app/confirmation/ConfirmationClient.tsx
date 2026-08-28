"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface ConfirmedBooking {
  code: string;
  name: string;
  phone: string;
  riders: number;
  amount: number;
  paymentMethod: "card" | "cash";
  cashCollected: boolean;
  slot: {
    direction: string;
    label: string;
    from: string;
    to: string;
  } | null;
}

type Phase = "loading" | "paid" | "waiting" | "failed" | "error";

const MAX_POLLS = 15; // ~30s of polling if the webhook lags behind the redirect

export default function ConfirmationClient() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const code = searchParams.get("code");

  const [phase, setPhase] = useState<Phase>("loading");
  const [booking, setBooking] = useState<ConfirmedBooking | null>(null);
  const pollCount = useRef(0);

  useEffect(() => {
    if (!sessionId && !code) {
      setPhase("error");
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const query = code
      ? `code=${encodeURIComponent(code)}`
      : `session_id=${encodeURIComponent(sessionId!)}`;

    async function poll() {
      try {
        const res = await fetch(`/api/confirm?${query}`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;

        if (!res.ok) {
          setPhase("error");
          return;
        }

        if (data.status === "paid" && data.booking) {
          setBooking(data.booking);
          setPhase("paid");
          return;
        }

        if (data.status === "cancelled" || data.status === "expired") {
          setPhase("failed");
          return;
        }

        // A cash reservation is confirmed synchronously, so there's nothing
        // to poll for — only the card flow waits on the Stripe webhook.
        if (code) {
          setPhase("error");
          return;
        }

        // still pending — webhook hasn't landed yet, keep polling briefly
        pollCount.current += 1;
        if (pollCount.current >= MAX_POLLS) {
          setPhase("waiting");
          return;
        }
        setPhase("loading");
        timer = setTimeout(poll, 2000);
      } catch {
        if (!cancelled) setPhase("error");
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sessionId, code]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {phase === "loading" && (
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 rounded-full border-2 border-gold border-t-transparent animate-spin" />
            <p className="text-zinc-300">Confirming your {code ? "reservation" : "payment"}…</p>
          </div>
        )}

        {phase === "paid" && booking && (
          <div className="bg-ink-card border border-gold/40 rounded-2xl p-6 shadow-goldglow text-center">
            <p className="text-gold font-display uppercase tracking-widest text-xs mb-2">
              Seat Confirmed
            </p>
            <h1 className="font-display text-3xl font-bold mb-1">You&apos;re booked!</h1>
            <p className="text-zinc-400 text-sm mb-6">Show this code when you board.</p>

            <div className="bg-ink rounded-xl border border-ink-line py-4 mb-6">
              <p className="font-display text-4xl font-bold tracking-widest text-gold">
                {booking.code}
              </p>
            </div>

            <dl className="text-left space-y-3 text-sm">
              {booking.slot && (
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Trip</dt>
                  <dd className="text-right">
                    {booking.slot.direction} — {booking.slot.label}
                  </dd>
                </div>
              )}
              {booking.slot && (
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Route</dt>
                  <dd className="text-right text-zinc-300">
                    {booking.slot.from} <br /> → {booking.slot.to}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-zinc-500">Name</dt>
                <dd>{booking.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Riders</dt>
                <dd>{booking.riders}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">
                  {booking.paymentMethod === "cash" && !booking.cashCollected
                    ? "Amount due (cash)"
                    : "Amount paid"}
                </dt>
                <dd className="font-semibold">${booking.amount.toFixed(2)}</dd>
              </div>
            </dl>

            {booking.paymentMethod === "cash" && !booking.cashCollected && (
              <p className="mt-4 rounded-lg bg-gold/10 border border-gold/30 text-gold text-sm px-4 py-3">
                Please have exact cash ready — pay the driver when you board.
              </p>
            )}

            <Link
              href="/"
              className="inline-block mt-6 text-sm text-zinc-400 hover:text-gold underline underline-offset-4"
            >
              Book another trip
            </Link>
          </div>
        )}

        {phase === "waiting" && (
          <div className="bg-ink-card border border-ink-line rounded-2xl p-6 text-center">
            <h1 className="font-display text-2xl font-bold mb-2">Almost there…</h1>
            <p className="text-zinc-400 text-sm">
              Your payment is still processing. Hang tight — if this doesn&apos;t update in a
              minute, we still have your seat held; try refreshing this page.
            </p>
          </div>
        )}

        {phase === "failed" && (
          <div className="bg-ink-card border border-ink-line rounded-2xl p-6 text-center">
            <h1 className="font-display text-2xl font-bold mb-2">Booking not completed</h1>
            <p className="text-zinc-400 text-sm mb-4">
              This checkout session was canceled or expired, so no payment was taken and no
              seat was reserved.
            </p>
            <Link
              href="/"
              className="inline-block rounded-lg bg-crimson px-4 py-2.5 font-display font-semibold"
            >
              Back to booking
            </Link>
          </div>
        )}

        {phase === "error" && (
          <div className="bg-ink-card border border-ink-line rounded-2xl p-6 text-center">
            <h1 className="font-display text-2xl font-bold mb-2">Couldn&apos;t load booking</h1>
            <p className="text-zinc-400 text-sm mb-4">
              We couldn&apos;t find that booking. If you completed payment or a reservation,
              check for a confirmation email, or contact us directly.
            </p>
            <Link
              href="/"
              className="inline-block rounded-lg bg-crimson px-4 py-2.5 font-display font-semibold"
            >
              Back to booking
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
