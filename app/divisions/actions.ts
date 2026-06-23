"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

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

  const { error } = await supabase.from("division_briefs").upsert(
    {
      division_id: divisionId,
      goals: goals.trim() || null,
      targets: targets.trim() || null,
      notes: notes.trim() || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "division_id" },
  );
  if (error) return { error: error.message.includes("policy") ? "Only the owner or this division's lead can edit the brief." : error.message };
  revalidatePath("/divisions/[slug]", "page");
  return { ok: true };
}
