import { createHash, randomInt, timingSafeEqual } from "node:crypto";

// Custom 6-digit email OTP for signup verification. We do NOT store the raw code
// anywhere — only a salted SHA-256 hash lives on the pending auth user's
// metadata until it is verified (then cleared). Codes expire quickly and allow a
// limited number of attempts. This is intentionally self-contained so it needs
// no extra DB table.

export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_MAX_ATTEMPTS = 6;
export const OTP_RESEND_SECONDS = 41; // matches the UI countdown

/** Cryptographically-random 6-digit code as a zero-padded string. */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Salted hash of the code, bound to the email so a hash can't be reused elsewhere. */
export function hashOtp(code: string, email: string): string {
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "sthyra-otp";
  return createHash("sha256").update(`${salt}:${email.toLowerCase()}:${code}`).digest("hex");
}

/** Constant-time comparison of a submitted code against a stored hash. */
export function verifyOtp(code: string, email: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false;
  const candidate = hashOtp(code, email);
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function otpEmailSubject(code: string): string {
  return `${code} is your Sthyra verification code`;
}

export function otpEmailHtml(code: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f5f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e8ef;">
            <tr>
              <td style="padding:28px 32px 8px;">
                <div style="font-weight:700;letter-spacing:0.24em;font-size:14px;color:#4f46e5;">STHYRA</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 4px;">
                <h1 style="margin:0;font-size:22px;color:#101322;font-weight:700;">Check your email</h1>
                <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#5b6478;">
                  Enter this 6-digit verification code to finish creating your Sthyra account. It expires in 10 minutes.
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:26px 32px 8px;">
                <div style="display:inline-block;font-size:34px;font-weight:700;letter-spacing:0.34em;color:#4f46e5;background:#eef0ff;border:1px solid #dfe2ff;border-radius:12px;padding:16px 26px 16px 34px;">
                  ${code}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 32px 30px;">
                <p style="margin:0;font-size:12.5px;line-height:1.6;color:#8b93a7;">
                  If you did not request this, you can safely ignore this email &mdash; no account will be created.
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0;font-size:11px;color:#a3aabb;">&copy; Sthyra &middot; Internal access only</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
