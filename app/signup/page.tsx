"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 13px", borderRadius: 9, background: "var(--glass)",
  border: "1px solid var(--line)", color: "var(--text)", fontSize: 14, fontFamily: "inherit", outline: "none",
};

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("email");
    if (p) setEmail(p);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) { setErr("Use at least 8 characters."); return; }
    if (pw !== pw2) { setErr("Passwords don't match."); return; }
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pw,
      options: { data: { full_name: name.trim() } },
    });
    if (error) {
      setBusy(false);
      setErr(/not.*allow|database error|saving new user/i.test(error.message)
        ? "This email hasn't been invited yet. Ask your admin to add you in Settings."
        : error.message);
      return;
    }
    if (data.session) { router.push("/"); router.refresh(); return; }
    // No session returned — sign in directly (allowlisted signups are auto-confirmed).
    const { error: e2 } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (e2) { setErr("Account created, but sign-in needs email confirmation. Contact your admin."); return; }
    router.push("/");
    router.refresh();
  }

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="glass" style={{ width: "100%", maxWidth: 380, borderRadius: 18, padding: 34 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sthyra-logo.png" alt="Sthyra — Redefining Reality" className="logo-img" />

        <h1 className="display" style={{ fontSize: 22, marginBottom: 4, textAlign: "center" }}>Set up your account</h1>
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 22 }}>Use the email you were invited with.</p>

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label htmlFor="name" className="label">Full name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="Your name" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="you@sthyra.in" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label htmlFor="pw" className="label">Password</label>
            <input id="pw" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} style={inputStyle} placeholder="At least 8 characters" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label htmlFor="pw2" className="label">Confirm password</label>
            <input id="pw2" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} style={inputStyle} placeholder="••••••••" />
          </div>

          {err && (
            <div role="alert" style={{ fontSize: 12.5, color: "var(--danger)", background: "color-mix(in srgb, var(--danger) 8%, transparent)", border: "1px solid var(--danger-soft)", borderRadius: 8, padding: "9px 11px" }}>
              {err}
            </div>
          )}

          <button type="submit" className="btn" disabled={busy} style={{ justifyContent: "center", padding: "11px", marginTop: 4, opacity: busy ? 0.7 : 1 }}>
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>

        <p style={{ marginTop: 18, fontSize: 12.5, color: "var(--text-dim)", textAlign: "center" }}>
          Already have an account? <a href="/login" style={{ color: "var(--accent)" }}>Sign in</a>
        </p>
      </div>
    </div>
  );
}
