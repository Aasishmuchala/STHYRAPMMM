import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyAttendanceToken } from "@/lib/attendanceToken";
import { CheckInClient } from "./CheckInClient";

// Landing page for the daily attendance link. If the URL carries a valid signed
// token (from the 6am email) the person can check in WITHOUT logging in;
// otherwise we require a session.
export default async function CheckInPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const sp = await searchParams;
  const token = sp?.t ?? null;

  let name = "there";
  let validToken: string | null = null;

  if (token) {
    const verified = verifyAttendanceToken(token);
    if (verified) {
      validToken = token;
      try {
        const admin = createServiceClient();
        const { data: profile } = await admin.from("profiles").select("full_name,email").eq("id", verified.userId).maybeSingle();
        const p = profile as { full_name: string | null; email: string | null } | null;
        name = p?.full_name || p?.email || "there";
      } catch {
        /* fall through with default name */
      }
    }
  }

  if (!validToken) {
    // No token (or expired) → require a logged-in session.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login?next=/attendance/check-in");
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name,email")
      .eq("id", user.id)
      .maybeSingle<{ full_name: string | null; email: string | null }>();
    name = profile?.full_name || profile?.email || "there";
  }

  return (
    <main id="main" data-testid="main" style={{ maxWidth: 460, margin: "0 auto", padding: "48px 20px" }}>
      <div className="label" style={{ marginBottom: 8 }}>Attendance</div>
      <h1 style={{ marginBottom: 6 }}>Check in</h1>
      <p className="head-sub" style={{ marginBottom: 24 }}>
        Tap the button below. We&apos;ll confirm you&apos;re at a registered location before marking you present.
      </p>
      <CheckInClient userName={name} token={validToken} />
    </main>
  );
}
