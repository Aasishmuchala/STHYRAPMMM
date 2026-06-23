"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 13px",
    borderRadius: 9,
    background: "var(--glass)",
    border: "1px solid var(--line)",
    color: "var(--text)",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
  };

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="glass" style={{ width: "100%", maxWidth: 380, borderRadius: 18, padding: 34 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sthyra-logo.png" alt="Sthyra — Redefining Reality" className="logo-img" />

        <h1 className="display" style={{ fontSize: 22, marginBottom: 4, textAlign: "center" }}>Sign in</h1>
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 22, textAlign: "center" }}>Invite-only access.</p>

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="you@sthyra.in" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label htmlFor="password" className="label">Password</label>
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} placeholder="••••••••" />
          </div>

          {error && (
            <div role="alert" style={{ fontSize: 12.5, color: "var(--danger)", background: "rgba(217,102,122,0.08)", border: "1px solid rgba(217,102,122,0.25)", borderRadius: 8, padding: "9px 11px" }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn" disabled={busy} style={{ justifyContent: "center", padding: "11px", marginTop: 4, opacity: busy ? 0.7 : 1 }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p style={{ marginTop: 18, fontSize: 12.5, color: "var(--text-dim)", textAlign: "center" }}>
          Have an invite? <a href="/signup" style={{ color: "var(--accent)" }}>Set up your account</a>
        </p>
      </div>
    </div>
  );
}
