"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { companyEmailDomain, companyEmailMessage, isCompanyEmail, normalizeEmail } from "@/lib/auth/companyEmail";

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

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);

  useEffect(() => {
    if (searchParams.get("error") === "company-email-only") {
      setError(companyEmailMessage());
    }
  }, [searchParams]);

  useEffect(() => {
    const authCode = searchParams.get("code");
    if (!authCode) return;
    const code = authCode;

    let cancelled = false;

    async function handleEmailLink() {
      setError(null);
      setLinkBusy(true);

      const supabase = createClient();
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (cancelled) return;

      if (exchangeError) {
        setLinkBusy(false);
        setError(exchangeError.message);
        return;
      }

      if (!isCompanyEmail(data.session?.user?.email)) {
        await supabase.auth.signOut();
        setLinkBusy(false);
        setError(companyEmailMessage());
        return;
      }

      router.push("/");
      router.refresh();
    }

    void handleEmailLink();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const emailValue = normalizeEmail(email);
    if (!isCompanyEmail(emailValue)) {
      setError(companyEmailMessage());
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: emailValue,
      password,
    });
    if (signInError) {
      setError(signInError.message);
      setBusy(false);
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

        <h1 className="display" style={{ fontSize: 22, marginBottom: 4, textAlign: "center" }}>Sign in</h1>
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 22, textAlign: "center" }}>
          Company email access only. Use your @{companyEmailDomain()} account.
        </p>

        {linkBusy && (
          <div
            role="status"
            style={{
              fontSize: 12.5,
              color: "var(--positive)",
              background: "color-mix(in srgb, var(--positive) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--positive) 26%, transparent)",
              borderRadius: 8,
              padding: "9px 11px",
              marginBottom: 16,
            }}
          >
            Finishing your email verification...
          </div>
        )}

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <label htmlFor="email" className="label">Email</label>
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
            <label htmlFor="password" className="label">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              placeholder="********"
            />
          </div>

          {error && (
            <div
              role="alert"
              style={{
                fontSize: 12.5,
                color: "var(--danger)",
                background: "rgba(217,102,122,0.08)",
                border: "1px solid rgba(217,102,122,0.25)",
                borderRadius: 8,
                padding: "9px 11px",
              }}
            >
              {error}
            </div>
          )}

          <button type="submit" className="btn" disabled={busy || linkBusy} style={{ justifyContent: "center", padding: "11px", marginTop: 4, opacity: busy || linkBusy ? 0.7 : 1 }}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p style={{ marginTop: 18, fontSize: 12.5, color: "var(--text-dim)", textAlign: "center" }}>
          Need a new account? <a href="/signup" style={{ color: "var(--accent)" }}>Verify your company email</a>
        </p>
      </div>
    </div>
  );
}
