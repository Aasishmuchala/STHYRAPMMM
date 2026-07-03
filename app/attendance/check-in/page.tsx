import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CheckInClient } from "./CheckInClient";

// The page people land on from the daily link. Kept intentionally minimal so it
// loads fast on a phone. (A tokenised magic-link variant — for tapping straight
// from a 6am WhatsApp/SMS without logging in — is added with the messaging layer.)
export default async function CheckInPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/attendance/check-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name,email")
    .eq("id", user.id)
    .maybeSingle<{ full_name: string | null; email: string | null }>();

  const name = profile?.full_name || profile?.email || "there";

  return (
    <main id="main" data-testid="main" style={{ maxWidth: 460, margin: "0 auto", padding: "48px 20px" }}>
      <div className="label" style={{ marginBottom: 8 }}>Attendance</div>
      <h1 style={{ marginBottom: 6 }}>Check in</h1>
      <p className="head-sub" style={{ marginBottom: 24 }}>
        Tap the button below. We&apos;ll confirm you&apos;re at a registered location before marking you present.
      </p>
      <CheckInClient userName={name} />
    </main>
  );
}
