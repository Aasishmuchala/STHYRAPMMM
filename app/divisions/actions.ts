"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";

// Save a division's operating brief. RLS allows only the owner or that division's lead.
export async function saveDivisionBrief(
  divisionId: string,
  goals: string,
  targets: string,
  notes: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = (await createClient()) as unknown as DB;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const trim = (s: string) => (s || "").trim().slice(0, 4000);

  const { error } = await supabase.from("division_briefs").upsert(
    {
      division_id: divisionId,
      goals: trim(goals) || null,
      targets: trim(targets) || null,
      notes: trim(notes) || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "division_id" },
  );
  if (error) {
    return {
      error: error.message.includes("policy")
        ? "Only the owner or this division's lead can edit the brief."
        : error.message,
    };
  }
  // The previous code passed the literal placeholder string
  // `"/divisions/[slug]"` which Next.js 15 does not expand; the path was never
  // invalidated. Look up the division's slug and invalidate the concrete URL
  // (audit medium — section 3).
  const { data: div } = await supabase
    .from("divisions")
    .select("slug")
    .eq("id", divisionId)
    .maybeSingle<{ slug: string }>();
  if (div?.slug) revalidatePath(`/divisions/${div.slug}`, "page");
  revalidatePath("/");
  return { ok: true };
}