"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";

type Result = { ok: true } | { error: string };

const rupeesToPaise = (rupees: number) => Math.round((Number(rupees) || 0) * 100);

async function client(): Promise<{ supabase: DB; userId: string | null }> {
  const supabase = (await createClient()) as unknown as DB;
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

// ── Monthly targets (managers only, enforced by RLS) ────────────────────────
export async function setSalesTarget(
  divisionId: string,
  monthIso: string, // any date in the month; normalized to the 1st
  t: { revenueRupees: number; deals: number; callsDaily: number; emailsDaily: number; meetingsMonth: number },
): Promise<Result> {
  const { supabase, userId } = await client();
  if (!userId) return { error: "Not authenticated" };
  if (!divisionId) return { error: "Pick a company." };

  const first = `${monthIso.slice(0, 7)}-01`;
  const { error } = await supabase.from("sales_targets").upsert(
    {
      division_id: divisionId,
      month: first,
      revenue_target_paise: rupeesToPaise(t.revenueRupees),
      deals_target: Math.max(0, Math.round(t.deals) || 0),
      calls_target_daily: Math.max(0, Math.round(t.callsDaily) || 0),
      emails_target_daily: Math.max(0, Math.round(t.emailsDaily) || 0),
      meetings_target_month: Math.max(0, Math.round(t.meetingsMonth) || 0),
      created_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "division_id,month" },
  );
  if (error) return { error: /policy/i.test(error.message) ? "Only an owner or lead can set targets." : error.message };
  revalidatePath("/sales");
  return { ok: true };
}

// ── Daily activity (own only) ───────────────────────────────────────────────
export async function upsertSalesActivity(
  divisionId: string,
  dateIso: string,
  a: { calls: number; emails: number; meetings: number; notes?: string | null },
): Promise<Result> {
  const { supabase, userId } = await client();
  if (!userId) return { error: "Not authenticated" };
  if (!divisionId) return { error: "Pick a company." };

  const { error } = await supabase.from("sales_activities").upsert(
    {
      user_id: userId,
      division_id: divisionId,
      activity_date: dateIso.slice(0, 10),
      calls: Math.max(0, Math.round(a.calls) || 0),
      emails: Math.max(0, Math.round(a.emails) || 0),
      meetings: Math.max(0, Math.round(a.meetings) || 0),
      notes: (a.notes ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,division_id,activity_date" },
  );
  if (error) return { error: error.message };
  revalidatePath("/sales");
  return { ok: true };
}

// ── Deals ───────────────────────────────────────────────────────────────────
export async function createDeal(
  divisionId: string,
  d: { title: string; company: string; segment: string; valueRupees: number; expectedClose: string | null },
): Promise<Result> {
  const { supabase, userId } = await client();
  if (!userId) return { error: "Not authenticated" };
  if (!divisionId) return { error: "Pick a company." };
  if (!d.title.trim()) return { error: "Give the deal a title." };

  const { error } = await supabase.from("sales_deals").insert({
    division_id: divisionId,
    owner_id: userId,
    title: d.title.trim(),
    company_name: d.company.trim() || null,
    segment: ["real_estate", "smb", "d2c", "other"].includes(d.segment) ? d.segment : "other",
    value_paise: rupeesToPaise(d.valueRupees),
    expected_close: d.expectedClose || null,
    stage: "lead",
  });
  if (error) return { error: error.message };
  revalidatePath("/sales");
  return { ok: true };
}

export async function updateDealStage(id: string, stage: string): Promise<Result> {
  const { supabase, userId } = await client();
  if (!userId) return { error: "Not authenticated" };
  const valid = ["lead", "contacted", "meeting", "proposal", "won", "lost"];
  if (!valid.includes(stage)) return { error: "Invalid stage." };

  const patch: Record<string, unknown> = { stage, updated_at: new Date().toISOString() };
  patch.closed_at = stage === "won" || stage === "lost" ? new Date().toISOString() : null;

  const { error } = await supabase.from("sales_deals").update(patch).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/sales");
  return { ok: true };
}

export async function deleteDeal(id: string): Promise<Result> {
  const { supabase, userId } = await client();
  if (!userId) return { error: "Not authenticated" };
  const { error } = await supabase.from("sales_deals").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/sales");
  return { ok: true };
}
