import { NextResponse } from "next/server";
import { companyEmailMessage, isCompanyEmail, normalizeEmail } from "@/lib/auth/companyEmail";
import { getServiceClient, findAuthUserByEmail, type SignupMetadata } from "@/lib/auth/signupServer";
import { generateOtp, hashOtp, otpEmailHtml, otpEmailSubject, OTP_TTL_MS } from "@/lib/auth/otp";
import { emailConfigured, sendEmail } from "@/lib/email";

export const runtime = "nodejs";

type Payload = { email?: string; password?: string; fullName?: string };

// Step 1 of signup: validate the details, park a PENDING (email-unconfirmed)
// auth user with a hashed OTP on its metadata, and email the 6-digit code.
// The account only becomes real/usable once /api/signup/verify confirms the OTP.
export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as Payload | null;
  const email = normalizeEmail(payload?.email ?? "");
  const password = payload?.password ?? "";
  const fullName = payload?.fullName?.trim() || null;

  if (!isCompanyEmail(email)) {
    return NextResponse.json({ error: companyEmailMessage() }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Use at least 8 characters." }, { status: 400 });
  }
  if (!emailConfigured()) {
    return NextResponse.json({ error: "Email is not configured (set RESEND_API_KEY)." }, { status: 500 });
  }

  const admin = getServiceClient();
  if (!admin) {
    return NextResponse.json({ error: "Supabase service role is not configured." }, { status: 500 });
  }

  const code = generateOtp();
  const metadata: SignupMetadata = {
    full_name: fullName,
    signup_otp_hash: hashOtp(code, email),
    signup_otp_expires: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    signup_otp_attempts: 0,
  };

  // Create the pending user with email_confirm:false so they cannot sign in
  // until the OTP is verified.
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: metadata,
  });

  if (createError) {
    const already = /already been registered|already registered|user already exists|duplicate/i.test(
      createError.message,
    );
    if (!already) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }

    // Email is taken. If it belongs to a fully signed-up account, tell them to
    // sign in. If it's another PENDING/unconfirmed signup (or a resend), reset
    // the password + OTP and continue.
    const existing = await findAuthUserByEmail(admin, email);
    if (existing.error) {
      return NextResponse.json({ error: existing.error }, { status: 500 });
    }
    if (!existing.user) {
      return NextResponse.json(
        { error: "That account already exists, but we couldn't load it right now. Try again." },
        { status: 409 },
      );
    }
    if (existing.user.email_confirmed_at || existing.user.last_sign_in_at) {
      return NextResponse.json(
        { error: "An account with that email already exists. Sign in instead." },
        { status: 409 },
      );
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(existing.user.id, {
      password,
      email_confirm: false,
      user_metadata: { ...(existing.user.user_metadata ?? {}), ...metadata },
    });
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
  }

  const sent = await sendEmail(email, otpEmailSubject(code), otpEmailHtml(code));
  if (!sent.ok) {
    return NextResponse.json({ error: `Couldn't send the code: ${sent.error}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
