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

type Stage = "details" | "verify";

function getAuthErrorMessage(error: { message?: string; code?: string; status?: number } | null | undefined) {
  const message = error?.message?.trim();
  if (message && message !== "{}") return message;
  if (error?.code) return error.code;
  if (error?.status) return `Request failed with status ${error.status}.`;
  return "";
}

function mapOtpError(rawMessage: string) {
  const message = rawMessage.trim();
  if (/over_email_send_rate_limit/i.test(message)) {
    return "Too many code requests right now. Please wait a moment and try again.";
  }
  if (/sender|from address|domain|smtp|email address is not authorized/i.test(message)) {
    return "Your email provider rejected the sender setup. Verify your sending domain in Resend and make sure Supabase SMTP uses that same sender address.";
  }
  if (/request failed with status 500/i.test(message)) {
    return "Supabase could not send the verification email. This is usually an SMTP setup issue in Supabase or an unverified sender/domain in Resend.";
  }
  if (/database error saving new user/i.test(message)) {
    return "Supabase could not create the user record. Check your Auth logs for the exact signup error.";
  }
  if (/invalid login credentials|token has expired|otp expired/i.test(message)) {
    return "That verification code is invalid or expired. Request a new code and try again.";
  }
  if (/signup is disabled/i.test(message)) {
    return "Email verification signup is disabled in Supabase Auth right now.";
  }
  return message || "Couldn't continue with email verification right now. Check Supabase Auth logs for the exact reason.";
}

export default function SignupPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setNote(null);

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
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: emailValue,
      options: {
        shouldCreateUser: true,
        data: { full_name: name.trim() || null },
      },
    });
    setBusy(false);

    if (error) {
      console.error("Signup OTP request failed", error);
      setErr(mapOtpError(getAuthErrorMessage(error)));
      return;
    }

    setEmail(emailValue);
    setStage("verify");
    setNote(`A verification code has been sent to ${emailValue}. Enter it below to finish setting up your account.`);
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setNote(null);

    if (!code.trim()) {
      setErr("Enter the verification code from your email.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: normalizeEmail(email),
      token: code.trim(),
      type: "email",
    });

    if (verifyError) {
      console.error("Signup OTP verification failed", verifyError);
      setBusy(false);
      setErr(mapOtpError(getAuthErrorMessage(verifyError)));
      return;
    }

    const { error: passwordError } = await supabase.auth.updateUser({
      password: pw,
      data: { full_name: name.trim() || null },
    });

    if (passwordError) {
      setBusy(false);
      setErr(passwordError.message);
      return;
    }

    const finalizeRes = await fetch("/api/signup/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: name.trim() }),
    });
    const finalizeBody = (await finalizeRes.json().catch(() => null)) as { error?: string } | null;

    setBusy(false);
    if (!finalizeRes.ok) {
      setErr(finalizeBody?.error || "Your email was verified, but we couldn't finish account setup.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function resendCode() {
    setErr(null);
    setNote(null);

    const emailValue = normalizeEmail(email);
    if (!isCompanyEmail(emailValue)) {
      setErr(companyEmailMessage());
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: emailValue,
      options: {
        shouldCreateUser: true,
        data: { full_name: name.trim() || null },
      },
    });
    setBusy(false);

    if (error) {
      console.error("Signup OTP resend failed", error);
      setErr(mapOtpError(getAuthErrorMessage(error)));
      return;
    }

    setNote(`A fresh verification code has been sent to ${emailValue}.`);
  }

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="glass" style={{ width: "100%", maxWidth: 380, borderRadius: 18, padding: 34 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sthyra-logo.png" alt="Sthyra - Redefining Reality" className="logo-img" />

        <h1 className="display" style={{ fontSize: 22, marginBottom: 4, textAlign: "center" }}>
          {stage === "details" ? "Set up your account" : "Verify your email"}
        </h1>
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 22 }}>
          {stage === "details"
            ? `Only @${companyEmailDomain()} addresses can access the Sthyra dashboard.`
            : "Enter the verification code we emailed you to finish signup. If the email also contains a link, you can ignore it and use the code here."}
        </p>

        {stage === "details" ? (
          <form onSubmit={requestCode} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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

            {note && (
              <div
                role="status"
                style={{
                  fontSize: 12.5,
                  color: "var(--positive)",
                  background: "color-mix(in srgb, var(--positive) 8%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--positive) 26%, transparent)",
                  borderRadius: 8,
                  padding: "9px 11px",
                }}
              >
                {note}
              </div>
            )}

            <button
              type="submit"
              className="btn"
              disabled={busy}
              style={{ justifyContent: "center", padding: "11px", marginTop: 4, opacity: busy ? 0.7 : 1 }}
            >
              {busy ? "Sending code..." : "Create account"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <label htmlFor="verify-email" className="label">Email</label>
              <input
                id="verify-email"
                value={email}
                disabled
                style={{ ...inputStyle, opacity: 0.72 }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <label htmlFor="code" className="label">Verification code</label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                style={inputStyle}
                placeholder="Enter the code from your email"
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

            {note && (
              <div
                role="status"
                style={{
                  fontSize: 12.5,
                  color: "var(--positive)",
                  background: "color-mix(in srgb, var(--positive) 8%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--positive) 26%, transparent)",
                  borderRadius: 8,
                  padding: "9px 11px",
                }}
              >
                {note}
              </div>
            )}

            <button
              type="submit"
              className="btn"
              disabled={busy}
              style={{ justifyContent: "center", padding: "11px", marginTop: 4, opacity: busy ? 0.7 : 1 }}
            >
              {busy ? "Verifying..." : "Verify email"}
            </button>

            <button
              type="button"
              className="btn secondary"
              onClick={resendCode}
              disabled={busy}
              style={{ justifyContent: "center", padding: "11px", opacity: busy ? 0.7 : 1 }}
            >
              Resend code
            </button>

            <button
              type="button"
              className="link"
              onClick={() => {
                setStage("details");
                setCode("");
                setErr(null);
                setNote(null);
              }}
              style={{ alignSelf: "center" }}
            >
              Change email or password
            </button>
          </form>
        )}

        <p style={{ marginTop: 18, fontSize: 12.5, color: "var(--text-dim)", textAlign: "center" }}>
          Already have an account? <a href="/login" style={{ color: "var(--accent)" }}>Sign in</a>
        </p>
      </div>
    </div>
  );
}
