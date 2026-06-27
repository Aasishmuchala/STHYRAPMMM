"use server";

import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canAccessFinanceDivision, loadUserWorkspaceAccess } from "@/lib/server-access";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";

export type ForecastBucket = {
  date: string;
  inflow: number;
  outflow: number;
  net: number;
  runningBalance: number;
};

export type ForecastResult = {
  ok: true;
  data: {
    buckets: ForecastBucket[];
    totalIn: number;
    totalOut: number;
    periodStart: string;
    periodEnd: string;
    divisionId: string | null;
  };
} | { error: string };

/** Build a 90-day cash-flow forecast combining recurring payments + open invoices. */
export async function buildForecast(divisionId: string | null, days = 90): Promise<ForecastResult> {
  const supabase = (await createClient()) as unknown as DB;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const { access } = await loadUserWorkspaceAccess(supabase, user.id);

  // Only finance members can build the forecast
  if (divisionId) {
    if (!canAccessFinanceDivision(access, divisionId)) {
      return { error: "You don't have finance access for this division." };
    }
  }

  const today = new Date();
  const startIso = today.toISOString().slice(0, 10);
  const endDate = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
  const endIso = endDate.toISOString().slice(0, 10);

  // Recurring payments — restricted to the requested division (if any)
  let recurringQuery = supabase
    .from("recurring_payments")
    .select("id,division_id,division_slug,kind,cadence,label,vendor,amount_paise,starts_on,ends_on,status,profile_name")
    .eq("status", "active")
    .lte("starts_on", endIso);
  if (divisionId) recurringQuery = recurringQuery.eq("division_id", divisionId);
  const { data: recurring, error: recErr } = await recurringQuery;
  if (recErr) return { error: recErr.message };

  // Open invoices (sent + overdue)
  let invoicesQuery = supabase
    .from("invoices")
    .select("id,number,counterparty,division_id,amount_paise,status,due_on")
    .is("deleted_at", null)
    .in("status", ["sent", "overdue"])
    .lte("due_on", endIso);
  if (divisionId) invoicesQuery = invoicesQuery.eq("division_id", divisionId);
  const { data: invoices, error: invErr } = await invoicesQuery;
  if (invErr) return { error: invErr.message };

  // Build day-by-day buckets
  const buckets = new Map<string, ForecastBucket>();
  for (let i = 0; i <= days; i++) {
    const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
    const iso = d.toISOString().slice(0, 10);
    buckets.set(iso, { date: iso, inflow: 0, outflow: 0, net: 0, runningBalance: 0 });
  }

  // Recurring — emit projected occurrences in the window.
  for (const p of recurring ?? []) {
    const cadenceMonths = p.cadence === "monthly" ? 1 : 12;
    const start = new Date(p.starts_on + "T00:00:00");
    const hardEnd = p.ends_on ? new Date(p.ends_on + "T00:00:00") : endDate;
    const limit = hardEnd.getTime() < endDate.getTime() ? hardEnd : endDate;
    let cursor = new Date(start);
    while (cursor.getTime() <= limit.getTime() && cursor.getTime() <= endDate.getTime()) {
      const iso = cursor.toISOString().slice(0, 10);
      if (buckets.has(iso)) {
        const b = buckets.get(iso)!;
        // Treat salary as outflow; subscription as outflow by default
        b.outflow += p.amount_paise;
      }
      // Advance by cadence
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + cadenceMonths, cursor.getDate());
      cursor = next;
    }
  }

  // Invoices — inflow on due_on (best-case optimistic)
  for (const inv of invoices ?? []) {
    if (!inv.due_on) continue;
    const iso = inv.due_on;
    if (buckets.has(iso)) {
      buckets.get(iso)!.inflow += inv.amount_paise;
    }
  }

  // Compute running balance
  const ordered = Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
  let running = 0;
  for (const b of ordered) {
    b.net = b.inflow - b.outflow;
    running += b.net;
    b.runningBalance = running;
  }

  const totalIn = ordered.reduce((sum, b) => sum + b.inflow, 0);
  const totalOut = ordered.reduce((sum, b) => sum + b.outflow, 0);

  return {
    ok: true,
    data: {
      buckets: ordered,
      totalIn,
      totalOut,
      periodStart: startIso,
      periodEnd: endIso,
      divisionId,
    },
  };
}