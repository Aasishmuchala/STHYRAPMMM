import crypto from "crypto";

// One-tap attendance links. The 6am email link carries a signed token so the
// recipient can mark attendance WITHOUT logging in — nobody is signed in at 6am.
// Signed with the service-role key (already a server-only secret), so there's no
// extra env var to configure. Tokens expire (default: end of the working day).

function signingKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return key;
}

export function signAttendanceToken(userId: string, expiresAtMs: number): string {
  const payload = `${userId}.${Math.floor(expiresAtMs)}`;
  const sig = crypto.createHmac("sha256", signingKey()).update(payload).digest("base64url");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyAttendanceToken(token: string): { userId: string } | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(".");
    if (parts.length !== 3) return null;
    const [userId, expStr, sig] = parts;
    if (!userId || !expStr || !sig) return null;

    const expected = crypto.createHmac("sha256", signingKey()).update(`${userId}.${expStr}`).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    if (Date.now() > Number(expStr)) return null;
    return { userId };
  } catch {
    return null;
  }
}
