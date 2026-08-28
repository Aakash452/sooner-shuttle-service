"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface BookingItem {
  id: number;
  code: string;
  name: string;
  phone: string;
  email: string | null;
  riders: number;
  amountCents: number;
  status: "pending" | "paid" | "cancelled" | "expired";
  paymentStatus: "unpaid" | "paid" | "paid_manual" | "refunded";
  paymentMethod: "card" | "cash";
  createdAt: string;
  paidAt: string | null;
  confirmationSentAt: string | null;
  smsSentAt: string | null;
  notifyLastError: string | null;
}

function isCollected(b: BookingItem): boolean {
  return b.paymentStatus === "paid" || b.paymentStatus === "paid_manual";
}

interface SlotGroup {
  slot: {
    id: string;
    label: string;
    direction: string;
    directionLabel: string;
    from: string;
    to: string;
  };
  capacity: number;
  booked: number;
  remaining: number;
  revenueCents: number;
  cashDueCents: number;
  bookings: BookingItem[];
}

interface BookingsResponse {
  bySlot: SlotGroup[];
  totalRevenueCents: number;
  totalCashDueCents: number;
  totalRidersBooked: number;
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function statusBadge(b: BookingItem) {
  const { status, paymentStatus, paymentMethod } = b;
  if (status === "paid") {
    if (paymentMethod === "cash") {
      if (paymentStatus === "unpaid") {
        return (
          <span className="inline-flex items-center rounded-full bg-gold/15 text-gold px-2 py-0.5 text-xs font-medium">
            Cash due
          </span>
        );
      }
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-400 px-2 py-0.5 text-xs font-medium">
          Cash collected
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/15 text-emerald-400 px-2 py-0.5 text-xs font-medium">
        {paymentStatus === "paid_manual" ? "Paid (manual)" : "Paid"}
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center rounded-full bg-gold/15 text-gold px-2 py-0.5 text-xs font-medium">
        Awaiting payment
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="inline-flex items-center rounded-full bg-zinc-500/15 text-zinc-400 px-2 py-0.5 text-xs font-medium">
        Cancelled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-zinc-700/30 text-zinc-500 px-2 py-0.5 text-xs font-medium">
      Expired
    </span>
  );
}

function notificationNote(b: BookingItem) {
  if (b.status !== "paid") return null;
  if (b.confirmationSentAt) {
    return <p className="text-[11px] text-emerald-500 mt-1">✓ code emailed</p>;
  }
  if (b.notifyLastError) {
    return <p className="text-[11px] text-red-400 mt-1">✗ email failed</p>;
  }
  return null;
}

export default function DashboardClient() {
  const router = useRouter();
  const [data, setData] = useState<BookingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/bookings", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/admin");
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load bookings");
        return;
      }
      setData(json);
      setError(null);
    } catch {
      setError("Network error while loading bookings");
    }
  }, [router]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleCancel(id: number) {
    if (!confirm("Cancel this booking and free the seats?")) return;
    setBusyId(id);
    try {
      await fetch("/api/admin/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleMarkPaid(id: number) {
    setBusyId(id);
    try {
      await fetch("/api/admin/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleResend(id: number) {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Resend failed");
      }
      await load();
    } catch {
      alert("Network error while resending");
    } finally {
      setBusyId(null);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin");
  }

  return (
    <main className="min-h-screen px-4 py-6 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <p className="text-gold font-display uppercase tracking-widest text-xs mb-1">
            Sooner Shuttle Service
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">Admin Dashboard</h1>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-zinc-400 hover:text-zinc-200 border border-ink-line rounded-lg px-3 py-2"
        >
          Log out
        </button>
      </header>

      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {!data ? (
        <p className="text-zinc-400">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-ink-card border border-ink-line rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500 mb-1">
                Revenue collected
              </p>
              <p className="font-display text-2xl sm:text-3xl font-bold text-gold">
                {money(data.totalRevenueCents)}
              </p>
            </div>
            <div className="bg-ink-card border border-ink-line rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500 mb-1">
                Cash due
              </p>
              <p className="font-display text-2xl sm:text-3xl font-bold">
                {money(data.totalCashDueCents)}
              </p>
            </div>
            <div className="bg-ink-card border border-ink-line rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500 mb-1">
                Riders booked
              </p>
              <p className="font-display text-2xl sm:text-3xl font-bold">{data.totalRidersBooked}</p>
            </div>
          </div>

          <div className="space-y-6">
            {data.bySlot.map((group) => (
              <section
                key={group.slot.id}
                className="bg-ink-card border border-ink-line rounded-2xl overflow-hidden"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-ink-line bg-white/[0.02]">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-zinc-500">
                      {group.slot.directionLabel}
                    </p>
                    <h2 className="font-display text-xl font-semibold">{group.slot.label}</h2>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-zinc-400">
                      <span className="text-zinc-100 font-semibold">{group.booked}</span> /{" "}
                      {group.capacity} seats
                    </p>
                    <p className="text-xs text-zinc-500">
                      {group.remaining} remaining · {money(group.revenueCents)} collected
                      {group.cashDueCents > 0 && <> · {money(group.cashDueCents)} cash due</>}
                    </p>
                  </div>
                </div>

                {group.bookings.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-zinc-500">No bookings yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-zinc-500 text-xs uppercase tracking-wide">
                          <th className="px-4 py-2 font-medium">Code</th>
                          <th className="px-4 py-2 font-medium">Name</th>
                          <th className="px-4 py-2 font-medium">Phone</th>
                          <th className="px-4 py-2 font-medium">Email</th>
                          <th className="px-4 py-2 font-medium">Method</th>
                          <th className="px-4 py-2 font-medium">Riders</th>
                          <th className="px-4 py-2 font-medium">Amount</th>
                          <th className="px-4 py-2 font-medium">Status</th>
                          <th className="px-4 py-2 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.bookings.map((b) => (
                          <tr key={b.id} className="border-t border-ink-line/60">
                            <td className="px-4 py-2.5 font-mono text-xs text-zinc-300 whitespace-nowrap">
                              {b.code}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap">{b.name}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              <a href={`tel:${b.phone}`} className="text-zinc-300 hover:text-gold">
                                {b.phone}
                              </a>
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap text-zinc-300">
                              {b.email || <span className="text-zinc-600">—</span>}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap text-zinc-400 capitalize">
                              {b.paymentMethod}
                            </td>
                            <td className="px-4 py-2.5">{b.riders}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap">{money(b.amountCents)}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              {statusBadge(b)}
                              {notificationNote(b)}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex justify-end gap-2">
                                {b.status === "paid" && (
                                  <button
                                    onClick={() => handleResend(b.id)}
                                    disabled={busyId === b.id || !b.email}
                                    title={b.email ? "Resend the booking code" : "No email on file"}
                                    className="text-xs rounded-md bg-white/10 text-zinc-200 px-2.5 py-1.5 hover:bg-white/20 disabled:opacity-50 whitespace-nowrap"
                                  >
                                    Resend code
                                  </button>
                                )}
                                {!isCollected(b) && b.status !== "cancelled" && (
                                  <button
                                    onClick={() => handleMarkPaid(b.id)}
                                    disabled={busyId === b.id}
                                    className="text-xs rounded-md bg-gold/15 text-gold px-2.5 py-1.5 hover:bg-gold/25 disabled:opacity-50 whitespace-nowrap"
                                  >
                                    {b.paymentMethod === "cash" ? "Mark cash collected" : "Mark paid"}
                                  </button>
                                )}
                                {b.status !== "cancelled" && (
                                  <button
                                    onClick={() => handleCancel(b.id)}
                                    disabled={busyId === b.id}
                                    className="text-xs rounded-md bg-crimson/20 text-crimson-light px-2.5 py-1.5 hover:bg-crimson/30 disabled:opacity-50 whitespace-nowrap"
                                  >
                                    Cancel
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
