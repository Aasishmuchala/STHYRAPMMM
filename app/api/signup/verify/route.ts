import { NextResponse } from "next/server";
import { companyEmailMessage, isCompanyEmail, normalizeEmail } from "@/lib/auth/companyEmail";
import {
  getServiceClient,
  findAuthUserByEmail,
  provisionMember,
  type LooseAdmin,
  type SignupMetadata,
} from "@/lib/auth/signupServer";
import { verifyOtp, OTP_MAX_ATTEMPTS } from "@/lib/auth/otp";

export const runtime = "nodejs";

type Payload = { email?: string; code?: string };

// Step 2 of signup: check the 6-digit OTP. On success we mark the email
// confirmed (the account becomes real), provision the member profile + company
// membership, and clear the OTP. The client then signs in with the password.
export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as Payload | null;
  const email = normalizeEmail(payload?.email ?? "");
  const code = (payload?.code ?? "").trim();

  if (!isCompanyEmail(email)) {
    return NextResponse.json({ error: companyEmailMessage() }, { status: 400 });
  }
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Enter the 6-digit code we emailed you." }, { status: 400 });
  }

  const admin = getServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
  }

  const found = await findAuthUserByEmail(admin, email);
  if (found.error) {
    return NextResponse.json({ error: found.error }, { status: 500 });
  }
  if (!found.user) {
    return NextResponse.json({ error: "Start signup again — we couldn't find a pending request." }, { status: 404 });
  }

  const user = found.user;
  if (user.email_confirmed_at) {
    return NextResponse.json({ error: "This email is already verified. Sign in instead." }, { status: 409 });
  }

  const meta = (user.user_metadata ?? {}) as SignupMetadata;
  const storedHash = meta.signup_otp_hash ?? null;
  const expiresAt = meta.signup_otp_expires ? Date.parse(meta.signup_otp_expires) : 0;
  const attempts = typeof meta.signup_otp_attempts === "number" ? meta.signup_otp_attempts : 0;

  if (!storedHash || !expiresAt || Date.now() > expiresAt) {
    return NextResponse.json({ error: "That code expired. Tap Resend for a new one." }, { status: 410 });
  }
  if (attempts >= OTP_MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Too many attempts. Tap Resend for a new code." }, { status: 429 });
  }

  if (!verifyOtp(code, email, storedHash)) {
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...meta, signup_otp_attempts: attempts + 1 },
    });
    const remaining = OTP_MAX_ATTEMPTS - (attempts + 1);
    return NextResponse.json(
      { error: remaining > 0 ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} left.` : "Incorrect code. Tap Resend for a new one." },
      { status: 400 },
    );
  }

  const fullName = (typeof meta.full_name === "string" ? meta.full_name.trim() : "") || null;

  // Correct code: confirm the email and strip the OTP secrets from metadata.
  const { error: confirmError } = await admin.auth.admin.updateUserById(user.id, {
    email_confirm: true,
    user_metadata: {
      ...meta,
      full_name: fullName,
      signup_otp_hash: null,
      signup_otp_expires: null,
      signup_otp_attempts: null,
    },
  });
  if (confirmError) {
    return NextResponse.json({ error: confirmError.message }, { status: 500 });
  }

  const provisioned = await provisionMember(admin as unknown as LooseAdmin, user.id, email, fullName);
  if ("error" in provisioned) {
    return NextResponse.json({ error: provisioned.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
