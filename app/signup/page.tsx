"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  companyEmailDomain,
  companyEmailMessage,
  isCompanyEmail,
  normalizeEmail,
} from "@/lib/auth/companyEmail";

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

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function signInWithRetry(emailValue: string, passwordValue: string) {
    const supabase = createClient();
    let lastMessage = "Invalid login credentials";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: emailValue,
        password: passwordValue,
      });

      if (!signInError) return null;
      lastMessage = signInError.message;

      if (!/invalid login credentials/i.test(signInError.message) || attempt === 4) {
        return signInError.message;
      }

      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }

    return lastMessage;
  }

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const emailValue = normalizeEmail(email);
    if (!isCompanyEmail(emailValue)) {
      setErr(companyEmailMessage());
      return;
    }
    if (pw.length < 8) {
      setErr("Use at least 8 characters.");
      return;
    }
    if (pw !== pw2) {
      setErr("Passwords don't match.");
      return;
    }

    setBusy(true);
    const createRes = await fetch("/api/signup/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emailValue,
        password: pw,
        fullName: name.trim(),
      }),
    });
    const createType = createRes.headers.get("content-type") ?? "";
    const createBody = createType.includes("application/json")
      ? (await createRes.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      : null;

    if (!createRes.ok || !createBody?.ok) {
      setBusy(false);
      setErr(createBody?.error || "Couldn't create the account right now.");
      return;
    }

    const signInMessage = await signInWithRetry(emailValue, pw);

    setBusy(false);
    if (signInMessage) {
      setErr(`Account created, but sign-in failed: ${signInMessage}`);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="glass" style={{ width: "100%", maxWidth: 380, borderRadius: 18, padding: 34 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sthyra-logo.png" alt="Sthyra - Redefining Reality" className="logo-img" />

        <h1 className="display" style={{ fontSize: 22, marginBottom: 4, textAlign: "center" }}>
          Set up your account
        </h1>
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 22 }}>
          Only @{companyEmailDomain()} addresses can access the Sthyra dashboard. Email verification is currently skipped.
        </p>

        <form onSubmit={createAccount} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label htmlFor="name" className="label">Full name</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              placeholder="Your name"
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label htmlFor="email" className="label">Work email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              placeholder={`you@${companyEmailDomain()}`}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label htmlFor="pw" className="label">Password</label>
            <input
              id="pw"
              type="password"
              autoComplete="new-password"
              required
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              style={inputStyle}
              placeholder="At least 8 characters"
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label htmlFor="pw2" className="label">Confirm password</label>
            <input
              id="pw2"
              type="password"
              autoComplete="new-password"
              required
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              style={inputStyle}
              placeholder="********"
            />
          </div>

          {err && (
            <div
              role="alert"
              style={{
                fontSize: 12.5,
                color: "var(--danger)",
                background: "color-mix(in srgb, var(--danger) 8%, transparent)",
                border: "1px solid var(--danger-soft)",
                borderRadius: 8,
                padding: "9px 11px",
              }}
            >
              {err}
            </div>
          )}

          <button
            type="submit"
            className="btn"
            disabled={busy}
            style={{ justifyContent: "center", padding: "11px", marginTop: 4, opacity: busy ? 0.7 : 1 }}
          >
            {busy ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p style={{ marginTop: 18, fontSize: 12.5, color: "var(--text-dim)", textAlign: "center" }}>
          Already have an account? <a href="/login" style={{ color: "var(--accent)" }}>Sign in</a>
        </p>
      </div>
    </div>
  );
}
