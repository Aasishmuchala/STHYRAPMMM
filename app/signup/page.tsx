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
import { AuthLayout } from "@/components/auth/AuthLayout";

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
    <AuthLayout>
      <h1 className="auth-title">Create your account</h1>
      <p className="auth-subtitle">
        Only <strong>@{companyEmailDomain()}</strong> addresses can access the workspace.
      </p>

      <form onSubmit={createAccount} className="auth-form">
        <div className="auth-field">
          <label htmlFor="name" className="auth-label">Full name</label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="auth-input"
            placeholder="Your name"
          />
        </div>

        <div className="auth-field">
          <label htmlFor="email" className="auth-label">Work email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-input"
            placeholder={`you@${companyEmailDomain()}`}
          />
        </div>

        <div className="auth-field">
          <label htmlFor="pw" className="auth-label">Password</label>
          <input
            id="pw"
            type="password"
            autoComplete="new-password"
            required
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="auth-input"
            placeholder="At least 8 characters"
          />
        </div>

        <div className="auth-field">
          <label htmlFor="pw2" className="auth-label">Confirm password</label>
          <input
            id="pw2"
            type="password"
            autoComplete="new-password"
            required
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            className="auth-input"
            placeholder="••••••••"
          />
        </div>

        {err && <div role="alert" className="auth-note err">{err}</div>}

        <button type="submit" className="auth-btn" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="auth-switch">
        Already have an account? <a href="/login" className="auth-link">Sign in</a>
      </p>
    </AuthLayout>
  );
}
