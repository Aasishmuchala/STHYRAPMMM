"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type Result = { ok: true } | { error: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
// Loose client: trimmed generated types otherwise infer `never` for insert/update. RLS enforces access.
async function db(): Promise<SupabaseClient<any, any, any>> {
  return (await createClient()) as unknown as SupabaseClient<any, any, any>;
}
async function uid(supabase: SupabaseClient<any, any, any>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function done(): Result {
  revalidatePath("/finances");
  revalidatePath("/");
  return { ok: true };
}

// ---------- TRANSACTIONS ----------
export async function createTransaction(i: {
  division_id: string; project_id: string | null; kind: string; direction: string;
  amount_paise: number; category: string | null; status: string; occurred_on: string | null;
  counterparty: string | null; note: string | null;
}): Promise<Result> {
  const supabase = await db();
  const user = await uid(supabase);
  if (!user) return { error: "Not authenticated" };
  if (!i.division_id) return { error: "Pick a division" };
  if (!(i.amount_paise > 0)) return { error: "Amount must be greater than zero" };
  const { error } = await supabase.from("transactions").insert({
    division_id: i.division_id, project_id: i.project_id, kind: i.kind, direction: i.direction,
    amount_paise: i.amount_paise, category: i.category, status: i.status, occurred_on: i.occurred_on,
    counterparty: i.counterparty, note: i.note, created_by: user,
  });
  if (error) return { error: error.message };
  return done();
}
export async function deleteTransaction(id: string): Promise<Result> {
  const supabase = await db();
  const { error } = await supabase.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  return done();
}

// ---------- INVOICES ----------
export async function createInvoice(i: {
  division_id: string; project_id: string | null; number: string; counterparty: string | null;
  amount_paise: number; status: string; issued_on: string | null; due_on: string | null;
}): Promise<Result> {
  const supabase = await db();
  const user = await uid(supabase);
  if (!user) return { error: "Not authenticated" };
  if (!i.division_id) return { error: "Pick a division" };
  if (!i.number?.trim()) return { error: "Invoice number is required" };
  if (!(i.amount_paise > 0)) return { error: "Amount must be greater than zero" };
  const { error } = await supabase.from("invoices").insert({
    division_id: i.division_id, project_id: i.project_id, number: i.number, counterparty: i.counterparty,
    amount_paise: i.amount_paise, status: i.status, issued_on: i.issued_on, due_on: i.due_on, created_by: user,
  });
  if (error) return { error: error.message };
  return done();
}
export async function setInvoiceStatus(id: string, status: string): Promise<Result> {
  const supabase = await db();
  const patch: Record<string, unknown> = { status };
  if (status === "paid") patch.paid_on = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from("invoices").update(patch).eq("id", id);
  if (error) return { error: error.message };
  return done();
}
export async function deleteInvoice(id: string): Promise<Result> {
  const supabase = await db();
  const { error } = await supabase.from("invoices").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  return done();
}

// ---------- BOM ITEMS ----------
export async function createBomItem(i: {
  division_id: string; item: string; qty: number; unit: string | null;
  unit_cost_paise: number; category: string | null; vendor: string | null;
}): Promise<Result> {
  const supabase = await db();
  const user = await uid(supabase);
  if (!user) return { error: "Not authenticated" };
  if (!i.item?.trim()) return { error: "Item name is required" };
  const { error } = await supabase.from("bom_items").insert({
    division_id: i.division_id, item: i.item, qty: i.qty, unit: i.unit,
    unit_cost_paise: i.unit_cost_paise, category: i.category, vendor: i.vendor, created_by: user,
  });
  if (error) return { error: error.message };
  return done();
}
export async function deleteBomItem(id: string): Promise<Result> {
  const supabase = await db();
  const { error } = await supabase.from("bom_items").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  return done();
}

// ---------- RA BILLS ----------
export async function createRaBill(i: {
  division_id: string; project_id: string | null; sequence: number; period: string | null;
  gross_paise: number; deduction_paise: number; status: string; certified_on: string | null;
}): Promise<Result> {
  const supabase = await db();
  const user = await uid(supabase);
  if (!user) return { error: "Not authenticated" };
  if (!i.division_id) return { error: "Pick a division" };
  if (!(i.sequence > 0)) return { error: "Sequence must be a positive number" };
  const { error } = await supabase.from("ra_bills").insert({
    division_id: i.division_id, project_id: i.project_id, sequence: i.sequence, period: i.period,
    gross_paise: i.gross_paise, deduction_paise: i.deduction_paise, status: i.status, certified_on: i.certified_on, created_by: user,
  });
  if (error) return { error: error.message };
  return done();
}
export async function deleteRaBill(id: string): Promise<Result> {
  const supabase = await db();
  const { error } = await supabase.from("ra_bills").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  return done();
}
