"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canAccessFinanceDivision, loadUserWorkspaceAccess } from "@/lib/server-access";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecurringCadence, RecurringKind, RecurringStatus } from "@/lib/recurring";

type Result = { ok: true } | { error: string };
type ImportResult = { ok: true; imported: number } | { error: string };
type RecurringInput = {
  division_id: string;
  project_id: string | null;
  profile_id: string | null;
  kind: RecurringKind;
  cadence: RecurringCadence;
  label: string;
  vendor: string | null;
  amount_paise: number;
  starts_on: string;
  ends_on: string | null;
  status: RecurringStatus;
  notes: string | null;
};
type CsvTransactionInput = {
  division_id: string;
  project_id: string | null;
  kind: "revenue" | "cost" | "invoice";
  direction: "in" | "out";
  amount_paise: number;
  category: string | null;
  status: "draft" | "pending" | "cleared" | "void";
  occurred_on: string;
  counterparty: string | null;
  note: string | null;
};
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Loose client: trimmed generated types otherwise infer `never` for insert/update. RLS enforces access.
async function db(): Promise<SupabaseClient<any, any, any>> {
  return (await createClient()) as unknown as SupabaseClient<any, any, any>;
}
async function uid(supabase: SupabaseClient<any, any, any>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function done(): Result {
  revalidatePath("/finances");
  revalidatePath("/");
  return { ok: true };
}

function isIsoDate(value: string | null | undefined): value is string {
  return Boolean(value && ISO_DATE.test(value));
}

function normalizeRecurring(input: RecurringInput): RecurringInput | { error: string } {
  const label = input.label.trim();
  if (!input.division_id) return { error: "Pick a division." };
  if (!label) return { error: "Name is required." };
  if (!(input.amount_paise > 0)) return { error: "Amount must be greater than zero." };
  if (!isIsoDate(input.starts_on)) return { error: "Start date is required." };
  if (input.ends_on && !isIsoDate(input.ends_on)) return { error: "End date must be valid." };
  if (input.ends_on && input.ends_on < input.starts_on) return { error: "End date cannot be before the start date." };
  if (input.kind === "salary" && !input.profile_id) return { error: "Pick an employee for salary records." };

  return {
    ...input,
    label,
    vendor: input.vendor?.trim() || null,
    notes: input.notes?.trim() || null,
    cadence: input.kind === "salary" ? "monthly" : input.cadence,
  };
}

async function requireFinanceAccess(supabase: SupabaseClient<any, any, any>, userId: string, divisionId: string) {
  const { access } = await loadUserWorkspaceAccess(supabase, userId);
  if (!canAccessFinanceDivision(access, divisionId)) {
    return { error: "You don't have finance access for this company." } as const;
  }
  return { ok: true } as const;
}

async function requireProjectDivisionMatch(
  supabase: SupabaseClient<any, any, any>,
  projectId: string | null,
  divisionId: string
) {
  if (!projectId) return { ok: true } as const;
  const { data: project, error } = await supabase
    .from("projects")
    .select("division_id")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle<{ division_id: string }>();
  if (error) return { error: error.message } as const;
  if (!project) return { error: "Project not found." } as const;
  if (project.division_id !== divisionId) {
    return { error: "Pick a project that belongs to the same company." } as const;
  }
  return { ok: true } as const;
}

async function requireExistingFinanceRow(
  supabase: SupabaseClient<any, any, any>,
  table: string,
  id: string
) {
  const { data, error } = await supabase.from(table).select("division_id").eq("id", id).maybeSingle<{ division_id: string }>();
  if (error) return { error: error.message } as const;
  if (!data) return { error: "Record not found." } as const;
  return { ok: true, divisionId: data.division_id } as const;
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
  const financeAccess = await requireFinanceAccess(supabase, user, i.division_id);
  if ("error" in financeAccess) return financeAccess;
  const projectScope = await requireProjectDivisionMatch(supabase, i.project_id, i.division_id);
  if ("error" in projectScope) return projectScope;
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
  const user = await uid(supabase);
  if (!user) return { error: "Not authenticated" };
  const row = await requireExistingFinanceRow(supabase, "transactions", id);
  if ("error" in row) return row;
  const financeAccess = await requireFinanceAccess(supabase, user, row.divisionId);
  if ("error" in financeAccess) return financeAccess;
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
  const financeAccess = await requireFinanceAccess(supabase, user, i.division_id);
  if ("error" in financeAccess) return financeAccess;
  const projectScope = await requireProjectDivisionMatch(supabase, i.project_id, i.division_id);
  if ("error" in projectScope) return projectScope;
  const { error } = await supabase.from("invoices").insert({
    division_id: i.division_id, project_id: i.project_id, number: i.number, counterparty: i.counterparty,
    amount_paise: i.amount_paise, status: i.status, issued_on: i.issued_on, due_on: i.due_on, created_by: user,
  });
  if (error) return { error: error.message };
  return done();
}
export async function setInvoiceStatus(id: string, status: string): Promise<Result> {
  const supabase = await db();
  const user = await uid(supabase);
  if (!user) return { error: "Not authenticated" };
  const row = await requireExistingFinanceRow(supabase, "invoices", id);
  if ("error" in row) return row;
  const financeAccess = await requireFinanceAccess(supabase, user, row.divisionId);
  if ("error" in financeAccess) return financeAccess;
  const patch: Record<string, unknown> = { status };
  if (status === "paid") patch.paid_on = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from("invoices").update(patch).eq("id", id);
  if (error) return { error: error.message };
  return done();
}
export async function deleteInvoice(id: string): Promise<Result> {
  const supabase = await db();
  const user = await uid(supabase);
  if (!user) return { error: "Not authenticated" };
  const row = await requireExistingFinanceRow(supabase, "invoices", id);
  if ("error" in row) return row;
  const financeAccess = await requireFinanceAccess(supabase, user, row.divisionId);
  if ("error" in financeAccess) return financeAccess;
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
  const financeAccess = await requireFinanceAccess(supabase, user, i.division_id);
  if ("error" in financeAccess) return financeAccess;
  const { error } = await supabase.from("bom_items").insert({
    division_id: i.division_id, item: i.item, qty: i.qty, unit: i.unit,
    unit_cost_paise: i.unit_cost_paise, category: i.category, vendor: i.vendor, created_by: user,
  });
  if (error) return { error: error.message };
  return done();
}
export async function deleteBomItem(id: string): Promise<Result> {
  const supabase = await db();
  const user = await uid(supabase);
  if (!user) return { error: "Not authenticated" };
  const row = await requireExistingFinanceRow(supabase, "bom_items", id);
  if ("error" in row) return row;
  const financeAccess = await requireFinanceAccess(supabase, user, row.divisionId);
  if ("error" in financeAccess) return financeAccess;
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
  const financeAccess = await requireFinanceAccess(supabase, user, i.division_id);
  if ("error" in financeAccess) return financeAccess;
  const projectScope = await requireProjectDivisionMatch(supabase, i.project_id, i.division_id);
  if ("error" in projectScope) return projectScope;
  const { error } = await supabase.from("ra_bills").insert({
    division_id: i.division_id, project_id: i.project_id, sequence: i.sequence, period: i.period,
    gross_paise: i.gross_paise, deduction_paise: i.deduction_paise, status: i.status, certified_on: i.certified_on, created_by: user,
  });
  if (error) return { error: error.message };
  return done();
}
export async function deleteRaBill(id: string): Promise<Result> {
  const supabase = await db();
  const user = await uid(supabase);
  if (!user) return { error: "Not authenticated" };
  const row = await requireExistingFinanceRow(supabase, "ra_bills", id);
  if ("error" in row) return row;
  const financeAccess = await requireFinanceAccess(supabase, user, row.divisionId);
  if ("error" in financeAccess) return financeAccess;
  const { error } = await supabase.from("ra_bills").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  return done();
}

// ---------- RECURRING ----------
export async function createRecurringPayment(input: RecurringInput): Promise<Result> {
  const supabase = await db();
  const user = await uid(supabase);
  if (!user) return { error: "Not authenticated" };

  const normalized = normalizeRecurring(input);
  if ("error" in normalized) return normalized;
  const financeAccess = await requireFinanceAccess(supabase, user, normalized.division_id);
  if ("error" in financeAccess) return financeAccess;
  const projectScope = await requireProjectDivisionMatch(supabase, normalized.project_id, normalized.division_id);
  if ("error" in projectScope) return projectScope;

  const { error } = await supabase.from("recurring_payments").insert({
    ...normalized,
    created_by: user,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  return done();
}

export async function updateRecurringPayment(id: string, input: RecurringInput): Promise<Result> {
  const supabase = await db();
  const user = await uid(supabase);
  if (!user) return { error: "Not authenticated" };
  const normalized = normalizeRecurring(input);
  if ("error" in normalized) return normalized;
  const existing = await requireExistingFinanceRow(supabase, "recurring_payments", id);
  if ("error" in existing) return existing;
  const currentAccess = await requireFinanceAccess(supabase, user, existing.divisionId);
  if ("error" in currentAccess) return currentAccess;
  const nextAccess = await requireFinanceAccess(supabase, user, normalized.division_id);
  if ("error" in nextAccess) return nextAccess;
  const projectScope = await requireProjectDivisionMatch(supabase, normalized.project_id, normalized.division_id);
  if ("error" in projectScope) return projectScope;

  const { error } = await supabase.from("recurring_payments").update({
    ...normalized,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { error: error.message };
  return done();
}

export async function deleteRecurringPayment(id: string): Promise<Result> {
  const supabase = await db();
  const user = await uid(supabase);
  if (!user) return { error: "Not authenticated" };
  const row = await requireExistingFinanceRow(supabase, "recurring_payments", id);
  if ("error" in row) return row;
  const financeAccess = await requireFinanceAccess(supabase, user, row.divisionId);
  if ("error" in financeAccess) return financeAccess;
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from("recurring_payments").update({
    deleted_at: new Date().toISOString(),
    status: "ended",
    ends_on: today,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { error: error.message };
  return done();
}

// ---------- CSV IMPORT ----------
export async function importTransactionsCsv(fileName: string, rows: CsvTransactionInput[]): Promise<ImportResult> {
  const supabase = await db();
  const user = await uid(supabase);
  if (!user) return { error: "Not authenticated" };
  if (!fileName.trim()) return { error: "File name is required." };
  if (rows.length === 0) return { error: "Upload a CSV with at least one row." };
  if (rows.length > 1000) return { error: "Import up to 1000 rows at a time." };

  for (const [index, row] of rows.entries()) {
    if (!row.division_id) return { error: `Row ${index + 1}: missing division.` };
    if (!(row.amount_paise > 0)) return { error: `Row ${index + 1}: amount must be greater than zero.` };
    if (!isIsoDate(row.occurred_on)) return { error: `Row ${index + 1}: invalid date.` };
  }

  const divisionIds = [...new Set(rows.map((row) => row.division_id))];
  const projectIds = [...new Set(rows.map((row) => row.project_id).filter((projectId): projectId is string => Boolean(projectId)))];
  for (const divisionId of divisionIds) {
    const financeAccess = await requireFinanceAccess(supabase, user, divisionId);
    if ("error" in financeAccess) return { error: financeAccess.error ?? "You don't have finance access for this company." };
  }

  const [{ data: divisions, error: divisionError }, { data: projects, error: projectError }] = await Promise.all([
    supabase.from("divisions").select("id").in("id", divisionIds),
    projectIds.length > 0
      ? supabase.from("projects").select("id,division_id").in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (divisionError) return { error: divisionError.message };
  if (projectError) return { error: projectError.message };

  const divisionSet = new Set((divisions ?? []).map((division: { id: string }) => division.id));
  const projectMap = new Map((projects ?? []).map((project: { id: string; division_id: string }) => [project.id, project.division_id]));

  for (const [index, row] of rows.entries()) {
    if (!divisionSet.has(row.division_id)) return { error: `Row ${index + 1}: division no longer exists.` };
    if (row.project_id && projectMap.get(row.project_id) !== row.division_id) {
      return { error: `Row ${index + 1}: project does not belong to that division.` };
    }
  }

  const { data: batch, error: batchError } = await supabase.from("finance_import_batches").insert({
    file_name: fileName.trim(),
    row_count: rows.length,
    created_by: user,
  }).select("id").single();
  if (batchError || !batch?.id) return { error: batchError?.message ?? "Couldn't create the import batch." };

  const payload = rows.map((row) => ({
    ...row,
    created_by: user,
    source: "csv_import",
    import_batch_id: batch.id,
  }));

  const { error: insertError } = await supabase.from("transactions").insert(payload);
  if (insertError) {
    await supabase.from("finance_import_batches").update({
      status: "failed",
      error_summary: insertError.message,
    }).eq("id", batch.id);
    return { error: insertError.message };
  }

  const { error: finalizeError } = await supabase.from("finance_import_batches").update({
    status: "completed",
    imported_rows: rows.length,
  }).eq("id", batch.id);
  if (finalizeError) return { error: finalizeError.message };

  revalidatePath("/finances");
  revalidatePath("/");
  return { ok: true, imported: rows.length };
}
