"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }
      router.push("/admin/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-gold font-display uppercase tracking-widest text-xs mb-1">
            Sooner Shuttle Service
          </p>
          <h1 className="font-display text-3xl font-bold">Admin Login</h1>
        </div>
        <form
          onSubmit={handleSubmit}
          className="bg-ink-card border border-ink-line rounded-2xl p-6 space-y-4 shadow-goldglow"
        >
          <div>
            <label className="block text-sm text-zinc-400 mb-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-ink border border-ink-line px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-crimson"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-lg bg-crimson hover:bg-crimson-light disabled:opacity-50 disabled:cursor-not-allowed text-white font-display font-semibold tracking-wide py-3 transition-colors"
          >
            {loading ? "Checking…" : "Log In"}
          </button>
        </form>
      </div>
    </main>
  );
}
