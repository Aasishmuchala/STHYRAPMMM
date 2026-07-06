import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { signAttendanceToken } from "@/lib/attendanceToken";
import { sendEmail, emailConfigured } from "@/lib/email";
import { sendAttendanceTemplate, whatsappConfigured } from "@/lib/whatsapp";
import { fmtLongDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily 6am job (scheduled via vercel.json → 00:30 UTC = 06:00 IST). Notifies
// every active member of a company that has attendance locations with a one-tap
// check-in link over BOTH channels — email (existing) and WhatsApp (new) — using
// the SAME signed token per person. Vercel Cron authenticates by sending
// `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET env var is set.
function baseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "https://sthyra-command-center.vercel.app";
}

function inviteHtml(name: string, link: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:8px">
    <h2 style="margin:0 0 6px;color:#0f172a">Good morning, ${name} 👋</h2>
    <p style="color:#475569;line-height:1.6;margin:0 0 20px">
      Tap the button below to mark your attendance for today. You'll be marked present only if you're
      within your office location.
    </p>
    <a href="${link}"
       style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;
              padding:13px 22px;border-radius:10px">Mark my attendance</a>
    <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin:22px 0 0">
      This link works from your phone and expires later today. If the button doesn't work, open this URL:<br>
      <a href="${link}" style="color:#2563eb;word-break:break-all">${link}</a>
    </p>
  </div>`;
}

export async function POST(request: Request) {
  return run(request);
}
export async function GET(request: Request) {
  return run(request);
}

async function run(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set — configure it to enable the scheduled email." }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  const url = new URL(request.url);
  if (auth !== `Bearer ${secret}` && url.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!emailConfigured()) {
    return NextResponse.json({ error: "Email is not configured — set RESEND_API_KEY." }, { status: 500 });
  }

  let admin;
  try {
    admin = createServiceClient();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "service role missing" }, { status: 500 });
  }

  // Companies that actually have a location to check in at.
  const { data: locDivs } = await admin.from("attendance_locations").select("division_id");
  const divIds = [...new Set(((locDivs ?? []) as { division_id: string }[]).map((r) => r.division_id))];
  if (divIds.length === 0) return NextResponse.json({ ok: true, sent: 0, note: "no attendance locations configured" });

  const { data: members } = await admin.from("division_members").select("user_id").in("division_id", divIds);
  const userIds = [...new Set(((members ?? []) as { user_id: string }[]).map((m) => m.user_id))];
  if (userIds.length === 0) return NextResponse.json({ ok: true, sent: 0, note: "no members" });

  const { data: profiles } = await admin
    .from("profiles")
    .select("id,full_name,email,is_active,phone")
    .in("id", userIds);
  const recipients = ((profiles ?? []) as { id: string; full_name: string | null; email: string | null; is_active: boolean; phone: string | null }[])
    .filter((p) => p.is_active !== false && p.email);

  const expiresAt = Date.now() + 16 * 60 * 60 * 1000; // valid through the workday
  const base = baseUrl();
  const attendanceDate = fmtLongDate(new Date()); // template body {{1}}, e.g. "06 July 2026"
  const waEnabled = whatsappConfigured();

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Email tallies (unchanged semantics).
  let sent = 0;
  const failures: string[] = [];
  // WhatsApp tallies — independent of email.
  let waSent = 0, waFailed = 0, waSkipped = 0;
  const waFailures: string[] = [];

  // One paced pass. Email keeps its existing rhythm (sequential, ~600ms apart,
  // one retry on Resend 429). WhatsApp for the SAME person runs concurrently with
  // that person's email (2 calls max) via allSettled, so neither channel's
  // failure — nor a bad phone number — can affect the other or abort the batch.
  for (const p of recipients) {
    // Generate the signed token ONCE and reuse it for both channels.
    const token = signAttendanceToken(p.id, expiresAt);
    const link = `${base}/attendance/check-in?t=${token}`;
    const name = (p.full_name || p.email || "there").split(" ")[0] || "there";

    const emailTask = (async (): Promise<{ ok: true } | { ok: false; error: string }> => {
      let res = await sendEmail(p.email as string, "Mark your attendance for today", inviteHtml(name, link));
      // Resend allows ~2 requests/sec; back off and retry once on a rate-limit.
      if (!res.ok && /429|rate.?limit/i.test(res.error ?? "")) {
        await sleep(1200);
        res = await sendEmail(p.email as string, "Mark your attendance for today", inviteHtml(name, link));
      }
      return res;
    })();

    const waTask = (async (): Promise<"sent" | "skipped" | { error: string }> => {
      if (!waEnabled) return "skipped";
      if (!p.phone) return "skipped";
      // Pass ONLY the token as the URL-button param (Meta appends it to the base).
      const r = await sendAttendanceTemplate({ toPhone: p.phone, attendanceDate, token });
      return r.ok ? "sent" : { error: r.error };
    })();

    const [emailOutcome, waOutcome] = await Promise.allSettled([emailTask, waTask]);

    if (emailOutcome.status === "rejected") {
      failures.push(`${p.email}: ${String(emailOutcome.reason)}`);
    } else if (emailOutcome.value.ok) {
      sent += 1;
    } else {
      failures.push(`${p.email}: ${emailOutcome.value.error}`);
    }

    if (waOutcome.status === "fulfilled") {
      if (waOutcome.value === "sent") waSent += 1;
      else if (waOutcome.value === "skipped") waSkipped += 1;
      else { waFailed += 1; waFailures.push(`${p.id}: ${waOutcome.value.error}`); } // p.id (uuid) is safe to log; never the token
    } else {
      waFailed += 1;
      waFailures.push(`${p.id}: ${String(waOutcome.reason)}`);
    }

    await sleep(600); // stay under the 2 req/s email limit
  }

  return NextResponse.json({
    ok: true,
    recipients: recipients.length,
    date: attendanceDate,
    email: { sent, failed: failures.length, failures: failures.slice(0, 5) },
    whatsapp: waEnabled
      ? { sent: waSent, failed: waFailed, skipped: waSkipped, failures: waFailures.slice(0, 5) }
      : { configured: false },
  });
}
