// Minimal email sender behind an interface, so the provider can be swapped.
// First adapter: Resend (https://resend.com) — add RESEND_API_KEY (and optionally
// RESEND_FROM, e.g. "Sthyra <attendance@yourdomain.com>") in the environment.
// If no key is configured this no-ops so the rest of the app keeps working.

export type SendResult = { ok: true } | { ok: false; error: string };

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim();
}

export async function sendEmail(to: string, subject: string, html: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, error: "Email is not configured (set RESEND_API_KEY)." };
  const from = process.env.RESEND_FROM?.trim() || "Sthyra <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "send failed" };
  }
}
