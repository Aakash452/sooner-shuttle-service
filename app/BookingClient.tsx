"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  DROPOFF_ADDRESS,
  MAX_RIDERS_PER_SLOT,
  PICKUP_ADDRESS,
  PRICE_PER_RIDER_CENTS,
} from "@/lib/slots";
import { cardTotalCents, type PaymentMethod } from "@/lib/pricing";
import { isValidEmail } from "@/lib/validate";

interface SlotAvailability {
  id: string;
  direction: "to-campus" | "to-motel";
  directionLabel: string;
  label: string;
  from: string;
  to: string;
  booked: number;
  remaining: number;
  soldOut: boolean;
}

const EVENT_DATE_LABEL = process.env.NEXT_PUBLIC_EVENT_DATE_LABEL || "Game Day";
const PRICE_DOLLARS = (PRICE_PER_RIDER_CENTS / 100).toFixed(0);

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function BookingClient() {
  const searchParams = useSearchParams();
  const canceled = searchParams.get("canceled") === "1";

  const [slots, setSlots] = useState<SlotAvailability[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [riders, setRiders] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadAvailability = useCallback(async () => {
    try {
      const res = await fetch("/api/availability", { cache: "no-store" });
      const data = await res.json();
      setSlots(data.slots);
      setLoadError(null);
    } catch {
      setLoadError("Couldn't load seat availability. Pull to refresh.");
    }
  }, []);

  useEffect(() => {
    loadAvailability();
    const interval = setInterval(loadAvailability, 10000);
    return () => clearInterval(interval);
  }, [loadAvailability]);

  const selected = useMemo(
    () => slots?.find((s) => s.id === selectedSlot) || null,
    [slots, selectedSlot]
  );

  const maxRiders = selected ? Math.min(selected.remaining, MAX_RIDERS_PER_SLOT) : MAX_RIDERS_PER_SLOT;

  useEffect(() => {
    if (riders > maxRiders) setRiders(Math.max(1, maxRiders));
  }, [maxRiders, riders]);

  function selectSlot(slot: SlotAvailability) {
    if (slot.soldOut) return;
    setSelectedSlot(slot.id);
    setSubmitError(null);
    setRiders(1);
  }

  const netCents = riders * PRICE_PER_RIDER_CENTS;
  const cardTotal = cardTotalCents(netCents);
  const totalCents = paymentMethod === "card" ? cardTotal : netCents;

  const canSubmit =
    !!selected &&
    !selected.soldOut &&
    name.trim().length > 0 &&
    phone.trim().length >= 7 &&
    isValidEmail(email.trim()) &&
    riders >= 1 &&
    !!paymentMethod;

  async function handleReserve() {
    if (!selected || !canSubmit || !paymentMethod) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (paymentMethod === "cash") {
        const res = await fetch("/api/reserve-cash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slotId: selected.id,
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim(),
            riders,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setSubmitError(data.error || "Something went wrong. Please try again.");
          loadAvailability();
          setSubmitting(false);
          return;
        }
        window.location.href = `/confirmation?code=${encodeURIComponent(data.bookingCode)}`;
        return;
      }

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: selected.id,
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          riders,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Something went wrong. Please try again.");
        loadAvailability();
        setSubmitting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setSubmitError("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  }

  const toCampus = slots?.filter((s) => s.direction === "to-campus") || [];
  const toMotel = slots?.filter((s) => s.direction === "to-motel") || [];

  return (
    <main className="min-h-screen pb-40">
      {/* Header */}
      <header className="px-4 pt-8 pb-6 text-center">
        <p className="text-gold font-display uppercase tracking-[0.2em] text-xs mb-2">
          {EVENT_DATE_LABEL}
        </p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold leading-tight">
          <span className="text-crimson-light">Sooner</span> Shuttle Service
        </h1>
        <p className="text-zinc-400 text-sm mt-2">Reserve your seat — motel to campus and back.</p>
      </header>

      {/* Route + price card */}
      <section className="px-4 mb-6">
        <div className="max-w-md mx-auto bg-ink-card border border-ink-line rounded-2xl p-4 shadow-goldglow">
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center pt-1">
              <span className="w-2.5 h-2.5 rounded-full bg-gold" />
              <span className="w-px flex-1 bg-ink-line my-1" />
              <span className="w-2.5 h-2.5 rounded-full bg-crimson-light" />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Pickup — Motel</p>
                <p className="text-sm text-zinc-200">{PICKUP_ADDRESS}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Drop-off — Campus</p>
                <p className="text-sm text-zinc-200">{DROPOFF_ADDRESS}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-ink-line flex items-center justify-between">
            <span className="text-sm text-zinc-400">Price per rider</span>
            <span className="font-display text-2xl font-bold text-gold">${PRICE_DOLLARS}</span>
          </div>
        </div>
      </section>

      {canceled && (
        <div className="px-4 mb-4">
          <div className="max-w-md mx-auto bg-gold/10 border border-gold/30 text-gold rounded-xl px-4 py-3 text-sm">
            Payment was canceled — your seat wasn&apos;t held. Pick a trip below to try again.
          </div>
        </div>
      )}

      {loadError && (
        <div className="px-4 mb-4">
          <div className="max-w-md mx-auto bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-4 py-3 text-sm">
            {loadError}
          </div>
        </div>
      )}

      {/* Slot board */}
      <section className="px-4 mb-6">
        <div className="max-w-md mx-auto space-y-5">
          <SlotGroup title="To Campus" slots={toCampus} selectedSlot={selectedSlot} onSelect={selectSlot} />
          <SlotGroup title="Return to Motel" slots={toMotel} selectedSlot={selectedSlot} onSelect={selectSlot} />
        </div>
      </section>

      {/* Booking form */}
      <section className="px-4">
        <div className="max-w-md mx-auto bg-ink-card border border-ink-line rounded-2xl p-4 space-y-4">
          <h2 className="font-display text-lg font-semibold">Your info</h2>
          <div>
            <label className="block text-sm text-zinc-400 mb-1" htmlFor="name">
              Full name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Sooner"
              className="w-full rounded-lg bg-ink border border-ink-line px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-crimson"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1" htmlFor="phone">
              Mobile number
            </label>
            <input
              id="phone"
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(405) 555-0123"
              className="w-full rounded-lg bg-ink border border-ink-line px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-crimson"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1" htmlFor="email">
              Email (for your booking code)
            </label>
            <input
              id="email"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              className="w-full rounded-lg bg-ink border border-ink-line px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-crimson"
            />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">Riders</label>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setRiders((r) => Math.max(1, r - 1))}
                disabled={!selected || riders <= 1}
                className="w-11 h-11 rounded-lg bg-ink border border-ink-line text-xl font-semibold disabled:opacity-40 active:bg-white/5"
                aria-label="Decrease riders"
              >
                −
              </button>
              <span className="font-display text-2xl w-8 text-center">{riders}</span>
              <button
                type="button"
                onClick={() => setRiders((r) => Math.min(maxRiders, r + 1))}
                disabled={!selected || riders >= maxRiders}
                className="w-11 h-11 rounded-lg bg-ink border border-ink-line text-xl font-semibold disabled:opacity-40 active:bg-white/5"
                aria-label="Increase riders"
              >
                +
              </button>
              {selected && (
                <span className="text-xs text-zinc-500 ml-auto">
                  up to {maxRiders} on this trip
                </span>
              )}
            </div>
          </div>

          {!selected && (
            <p className="text-sm text-zinc-500">Select a trip above to continue.</p>
          )}

          <div>
            <label className="block text-sm text-zinc-400 mb-2">How will you pay?</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod("cash")}
                className={[
                  "rounded-xl border px-3 py-3 text-left transition-colors",
                  paymentMethod === "cash"
                    ? "border-gold bg-gold/10 shadow-goldglow"
                    : "border-ink-line bg-ink hover:border-crimson-light",
                ].join(" ")}
              >
                <p className="font-display font-semibold text-sm">Pay Cash on Board</p>
                <p className="text-xs text-zinc-500 mt-1">Pay the driver when you board</p>
                <p className="font-display text-lg font-bold mt-2">{money(netCents)}</p>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("card")}
                className={[
                  "rounded-xl border px-3 py-3 text-left transition-colors",
                  paymentMethod === "card"
                    ? "border-gold bg-gold/10 shadow-goldglow"
                    : "border-ink-line bg-ink hover:border-crimson-light",
                ].join(" ")}
              >
                <p className="font-display font-semibold text-sm">Pay by Card Now</p>
                <p className="text-xs text-zinc-500 mt-1">
                  ${PRICE_DOLLARS}/rider + processing fee
                </p>
                <p className="font-display text-lg font-bold mt-2">{money(cardTotal)}</p>
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-ink-line flex items-center justify-between">
            <span className="text-sm text-zinc-400">
              {paymentMethod === "card"
                ? `$${PRICE_DOLLARS} × ${riders} rider${riders > 1 ? "s" : ""} + card fee`
                : `$${PRICE_DOLLARS} × ${riders} rider${riders > 1 ? "s" : ""}`}
            </span>
            <span className="font-display text-xl font-bold">{money(totalCents)}</span>
          </div>

          {submitError && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {submitError}
            </p>
          )}
        </div>
      </section>

      {/* Sticky reserve bar */}
      <div className="fixed bottom-0 inset-x-0 bg-ink/95 backdrop-blur border-t border-ink-line px-4 py-3 safe-bottom">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <div className="flex-shrink-0">
            <p className="text-xs text-zinc-500 leading-none">Total</p>
            <p className="font-display text-xl font-bold leading-tight">{money(totalCents)}</p>
          </div>
          <button
            onClick={handleReserve}
            disabled={!canSubmit || submitting}
            className="flex-1 rounded-xl bg-crimson hover:bg-crimson-light disabled:opacity-40 disabled:cursor-not-allowed text-white font-display font-semibold tracking-wide py-3.5 text-base transition-colors shadow-goldglow"
          >
            {submitting
              ? paymentMethod === "cash"
                ? "Reserving your seat…"
                : "Redirecting to payment…"
              : paymentMethod === "cash"
              ? "Reserve Seat — Pay Cash"
              : "Reserve & Pay"}
          </button>
        </div>
      </div>
    </main>
  );
}

function SlotGroup({
  title,
  slots,
  selectedSlot,
  onSelect,
}: {
  title: string;
  slots: SlotAvailability[];
  selectedSlot: string | null;
  onSelect: (slot: SlotAvailability) => void;
}) {
  if (slots.length === 0) return null;
  return (
    <div>
      <h3 className="font-display text-sm uppercase tracking-widest text-zinc-500 mb-2">{title}</h3>
      <div className="grid grid-cols-3 gap-2">
        {slots.map((slot) => {
          const isSelected = selectedSlot === slot.id;
          return (
            <button
              key={slot.id}
              type="button"
              onClick={() => onSelect(slot)}
              disabled={slot.soldOut}
              className={[
                "rounded-xl border px-2 py-3 text-center transition-colors",
                slot.soldOut
                  ? "border-ink-line bg-ink-card/50 opacity-40 cursor-not-allowed"
                  : isSelected
                  ? "border-gold bg-gold/10 shadow-goldglow"
                  : "border-ink-line bg-ink-card hover:border-crimson-light",
              ].join(" ")}
            >
              <p className="font-display text-lg font-semibold">{slot.label}</p>
              {slot.soldOut ? (
                <p className="text-xs text-zinc-500 mt-1">Sold out</p>
              ) : (
                <p className={`text-xs mt-1 ${slot.remaining <= 3 ? "text-gold" : "text-zinc-400"}`}>
                  {slot.remaining} seat{slot.remaining === 1 ? "" : "s"} left
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
