"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { companyEmailDomain, companyEmailMessage, isCompanyEmail, normalizeEmail } from "@/lib/auth/companyEmail";
import { toast } from "react-hot-toast";
import { AuthLayout } from "@/components/auth/AuthLayout";

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
      const toastId = toast.loading("Finishing email verification...");

      const supabase = createClient();
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (cancelled) return;

      if (exchangeError) {
        setLinkBusy(false);
        toast.error(exchangeError.message, { id: toastId });
        setError(exchangeError.message);
        return;
      }

      if (!isCompanyEmail(data.session?.user?.email)) {
        await supabase.auth.signOut();
        setLinkBusy(false);
        toast.error(companyEmailMessage(), { id: toastId });
        setError(companyEmailMessage());
        return;
      }

      toast.success("Email verified. Signed in.", { id: toastId });
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
    const toastId = toast.loading("Signing in...");
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: emailValue,
      password,
    });
    if (signInError) {
      toast.error(signInError.message, { id: toastId });
      setError(signInError.message);
      setBusy(false);
      return;
    }

    toast.success("Signed in.", { id: toastId });
    router.push("/");
    router.refresh();
  }

  return (
    <AuthLayout>
      <h1 className="auth-title">Welcome back</h1>
      <p className="auth-subtitle">
        Sign in with your <strong>@{companyEmailDomain()}</strong> account to reach your dashboard.
      </p>

      {linkBusy && (
        <div role="status" className="auth-note ok" style={{ marginBottom: 16 }}>
          Finishing your email verification…
        </div>
      )}

      <form onSubmit={onSubmit} className="auth-form">
        <div className="auth-field">
          <label htmlFor="email" className="auth-label">Email</label>
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
          <label htmlFor="password" className="auth-label">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
            placeholder="••••••••"
          />
        </div>

        {error && <div role="alert" className="auth-note err">{error}</div>}

        <button type="submit" className="auth-btn" disabled={busy || linkBusy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="auth-switch">
        Need a new account? <a href="/signup" className="auth-link">Set one up</a>
      </p>
    </AuthLayout>
  );
}
