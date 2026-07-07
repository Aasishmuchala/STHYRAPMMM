"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  companyEmailMessage,
  isCompanyEmail,
  normalizeEmail,
} from "@/lib/auth/companyEmail";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { FiArrowLeft } from "react-icons/fi";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 41;

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "otp">("form");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // OTP screen state
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const normalizedEmail = normalizeEmail(email);

  useEffect(() => {
    if (step !== "otp") return;
    inputsRef.current[0]?.focus();
  }, [step]);

  useEffect(() => {
    if (step !== "otp" || secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [step, secondsLeft]);

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

  async function sendCode(): Promise<boolean> {
    const res = await fetch("/api/signup/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password: pw, fullName: name.trim() }),
    });
    const type = res.headers.get("content-type") ?? "";
    const body = type.includes("application/json")
      ? ((await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null)
      : null;

    if (!res.ok || !body?.ok) {
      setErr(body?.error || "Couldn't send the verification code right now.");
      return false;
    }
    return true;
  }

  async function startSignup(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!isCompanyEmail(normalizedEmail)) {
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
    const ok = await sendCode();
    setBusy(false);
    if (!ok) return;

    setDigits(Array(OTP_LENGTH).fill(""));
    setSecondsLeft(RESEND_SECONDS);
    setStep("otp");
  }

  function setDigit(index: number, value: string) {
    const clean = value.replace(/\D/g, "");
    if (!clean) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      return;
    }
    // Handles both single keystroke and pasted multi-digit strings.
    setDigits((prev) => {
      const next = [...prev];
      let cursor = index;
      for (const ch of clean.split("")) {
        if (cursor >= OTP_LENGTH) break;
        next[cursor] = ch;
        cursor += 1;
      }
      const focusAt = Math.min(cursor, OTP_LENGTH - 1);
      inputsRef.current[focusAt]?.focus();
      return next;
    });
  }

  function onDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) inputsRef.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  }

  async function confirmCode(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const code = digits.join("");
    if (code.length !== OTP_LENGTH) {
      setErr("Enter all 6 digits.");
      return;
    }

    setVerifying(true);
    const res = await fetch("/api/signup/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, code }),
    });
    const type = res.headers.get("content-type") ?? "";
    const body = type.includes("application/json")
      ? ((await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null)
      : null;

    if (!res.ok || !body?.ok) {
      setVerifying(false);
      setErr(body?.error || "Couldn't verify that code.");
      setDigits(Array(OTP_LENGTH).fill(""));
      inputsRef.current[0]?.focus();
      return;
    }

    const signInMessage = await signInWithRetry(normalizedEmail, pw);
    setVerifying(false);
    if (signInMessage) {
      setErr(`Verified, but sign-in failed: ${signInMessage}`);
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function resend() {
    if (secondsLeft > 0 || resending) return;
    setErr(null);
    setResending(true);
    const ok = await sendCode();
    setResending(false);
    if (ok) {
      setDigits(Array(OTP_LENGTH).fill(""));
      setSecondsLeft(RESEND_SECONDS);
      inputsRef.current[0]?.focus();
    }
  }

  function backToForm() {
    setErr(null);
    setStep("form");
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  if (step === "otp") {
    return (
      <AuthLayout>
        <h1 className="auth-title">Check your email</h1>
        <p className="auth-subtitle">
          Please enter the 6-digit verification code we sent to{" "}
          <strong>{normalizedEmail}</strong>
        </p>

        <form onSubmit={confirmCode} className="auth-form">
          <div className="otp-row" role="group" aria-label="Verification code">
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputsRef.current[i] = el;
                }}
                className={`otp-box ${digit ? "filled" : ""}`}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                maxLength={OTP_LENGTH}
                value={digit}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onDigitKeyDown(i, e)}
                aria-label={`Digit ${i + 1}`}
              />
            ))}
          </div>

          {err && <div role="alert" className="auth-note err">{err}</div>}

          <button type="submit" className="auth-btn" disabled={verifying}>
            {verifying ? "Verifying…" : "Confirm"}
          </button>
        </form>

        <p className="auth-switch">
          {secondsLeft > 0 ? (
            <>Didn&apos;t get the email? Resend in {mm}:{ss}</>
          ) : (
            <>
              Didn&apos;t get the email?{" "}
              <button type="button" className="auth-link auth-linkbtn" onClick={resend} disabled={resending}>
                {resending ? "Resending…" : "Resend code"}
              </button>
            </>
          )}
        </p>

        <p className="auth-switch">
          <button type="button" className="auth-link auth-linkbtn with-icon" onClick={backToForm}>
            <FiArrowLeft aria-hidden /> back
          </button>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h1 className="auth-title">Create your account</h1>
      <p className="auth-subtitle">
        Sign up with your company email — <strong>@sthyra.com</strong>,{" "}
        <strong>@sthyradigital.com</strong> or <strong>@abhignaconstructions.com</strong>.
      </p>

      <form onSubmit={startSignup} className="auth-form">
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
            placeholder="you@sthyra.com"
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
          {busy ? "Sending code…" : "Create account"}
        </button>
      </form>

      <p className="auth-switch">
        Already have an account? <a href="/login" className="auth-link">Sign in</a>
      </p>
    </AuthLayout>
  );
}
