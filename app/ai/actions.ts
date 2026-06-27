"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadUserWorkspaceAccess } from "@/lib/server-access";
import { omegaChat, omegaListModels, resolveOmegaKey, type OmegaTool } from "@/lib/ai/omega";
import { costInr } from "@/lib/ai/cost";
import { buildContext } from "@/lib/ai/context";

// Default model for all assistant calls (user-confirmed). A "use server" module may
// only export async functions, so this stays module-private.
const AI_MODEL = "claude-opus-4-8";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function db(): Promise<SupabaseClient<any, any, any>> {
  return (await createClient()) as unknown as SupabaseClient<any, any, any>;
}
type Json = any;

// The assistant is owner-only (it reads the owner-decryptable Vault key). Enforce it at the
// action layer too, so it holds even if an OMEGA_API_KEY env override is set or the action is
// invoked directly outside the owner-gated /ai page.
async function ownerOnly(supabase: SupabaseClient<any, any, any>): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { access } = await loadUserWorkspaceAccess(supabase, user.id);
  return access.isSuperAdmin;
}

type Result = { ok: true; text: string; actions: ActionLog[]; cost: number } | { error: string };
type ActionLog = { tool: string; ok: boolean; detail: string };

const TOOLS: OmegaTool[] = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a task in a division the user can access. Use for to-dos and follow-ups.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          division_slug: { type: "string", enum: ["studios", "digital", "construction", "living_twin"] },
          priority: { type: "string", enum: ["lowest", "low", "medium", "high", "highest"] },
          due_date: { type: "string", description: "YYYY-MM-DD, optional" },
        },
        required: ["title", "division_slug"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_note",
      description: "Create a draft document (markdown note) in a division — e.g. a weekly update or summary.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          division_slug: { type: "string", enum: ["studios", "digital", "construction", "living_twin"] },
          body_md: { type: "string" },
        },
        required: ["title", "division_slug", "body_md"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_action",
      description: "Propose a MONEY or IRREVERSIBLE action for human approval (e.g. mark an invoice paid/void, delete something, send a message). NEVER execute these yourself — only propose.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", description: "short machine kind, e.g. set_invoice_status" },
          summary: { type: "string", description: "human-readable description of what you propose" },
          payload: { type: "object", description: "data needed to execute on approval" },
        },
        required: ["kind", "summary"],
      },
    },
  },
];

const SYSTEM = `You are the Sthyra Command Center assistant for a 4-division business (Studios, Digital, Construction Management, Living Twin).
The workspace snapshot gives you cash flow, receivables + aging, per-division revenue/expense/margin, the sales PIPELINE (clients/leads by stage + open deal value), RA-bill and BOM status, each division's OPERATING BRIEF (goals/targets/constraints), open tasks, and document excerpts.
How to advise: compare actuals to each division's operating-brief targets, name the gap in numbers, and recommend the specific next action. Lead with what's at risk (cash, overdue money, slipping margins, sign-offs, stalled deals). Chase the pipeline — flag proposals sitting too long and leads not yet contacted. Cite the figure you're reasoning from. Plain India-business tone, concise, decisive — no filler, no hedging.
Tool rules:
- For to-dos/follow-ups, call create_task. For drafts/updates/summaries, call draft_note. These are auto-applied.
- For anything touching MONEY or that is irreversible (mark invoice paid/void, delete, send), call propose_action — do NOT do it directly; it goes to the user for one-click approval.
- You can also just answer or advise with text. If a number isn't in the snapshot, say so rather than guessing.`;

async function slugMap(supabase: SupabaseClient<any, any, any>): Promise<Record<string, string>> {
  const { data } = await supabase.from("divisions").select("id,slug");
  const m: Record<string, string> = {};
  for (const d of (data ?? []) as Json[]) m[d.slug] = d.id;
  return m;
}

async function logRun(supabase: SupabaseClient<any, any, any>, userId: string, row: {
  purpose: string; model: string; usage: { input_tokens: number; output_tokens: number };
  prompt: string; response: string; actions: Json; status?: string; error?: string;
}): Promise<{ cost: number; runId: string | null }> {
  const cost = costInr(row.model, { input_tokens: row.usage.input_tokens, output_tokens: row.usage.output_tokens });
  const { data } = await supabase.from("ai_runs").insert({
    user_id: userId, purpose: row.purpose, model: row.model,
    input_tokens: row.usage.input_tokens, output_tokens: row.usage.output_tokens, cost_inr: cost,
    prompt: row.prompt.slice(0, 4000), response: (row.response ?? "").slice(0, 8000),
    actions: row.actions, status: row.status ?? "ok", error: row.error ?? null,
  }).select("id").maybeSingle();
  return { cost, runId: (data as Json)?.id ?? null };
}

async function notify(supabase: SupabaseClient<any, any, any>, userId: string, kind: string, title: string, body: string) {
  await supabase.from("notifications").insert({ user_id: userId, kind, title, body: body.slice(0, 8000), link: "/ai" });
}

export async function askAi(prompt: string): Promise<Result> {
  const p = prompt.trim();
  if (!p) return { error: "Ask something first." };
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await ownerOnly(supabase))) return { error: "The assistant is owner-only." };

  const apiKey = await resolveOmegaKey(supabase);
  if (!apiKey) return { error: "Assistant not connected. Add your Omega key in Settings → AI Assistant." };

  const today = new Date();
  let context: string;
  try { context = await buildContext(supabase, today); } catch { context = "(snapshot unavailable)"; }

  let res;
  try {
    res = await omegaChat({
      apiKey,
      model: AI_MODEL,
      tools: TOOLS,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Workspace snapshot:\n${context}\n\nRequest: ${p}` },
      ],
    });
  } catch (e) {
    const supabase2 = await db();
    await logRun(supabase2, user.id, { purpose: "ask", model: AI_MODEL, usage: { input_tokens: 0, output_tokens: 0 }, prompt: p, response: "", actions: [], status: "failed", error: e instanceof Error ? e.message : String(e) });
    revalidatePath("/ai");
    return { error: e instanceof Error ? e.message : "AI call failed" };
  }

  const slugs = await slugMap(supabase);
  const log: ActionLog[] = [];
  let runId: string | null = null;
  const { cost, runId: rid } = await logRun(supabase, user.id, { purpose: "ask", model: AI_MODEL, usage: res.usage, prompt: p, response: res.text, actions: res.toolCalls.map((t) => ({ name: t.name, args: t.args })) });
  runId = rid;

  for (const call of res.toolCalls) {
    try {
      if (call.name === "create_task") {
        const slug = typeof call.args.division_slug === "string" ? call.args.division_slug : "";
        const divId = slugs[slug];
        if (!divId) { log.push({ tool: "create_task", ok: false, detail: `unknown division ${call.args.division_slug}` }); continue; }
        // Strict ISO date validation (audit medium — section 3). Previously any
        // string the LLM emitted was passed straight to Postgres, surfacing as
        // a confusing "invalid input syntax" error to the user.
        const rawDue = typeof call.args.due_date === "string" ? call.args.due_date.trim() : "";
        const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDue) ? rawDue : null;
        const priority = typeof call.args.priority === "string" &&
          ["lowest", "low", "medium", "high", "highest"].includes(call.args.priority)
            ? call.args.priority : "medium";
        const { error } = await supabase.from("tasks").insert({
          title: String(call.args.title).slice(0, 300), division_id: divId,
          priority,
          status_key: "todo", due_date: dueDate, created_by: user.id,
        });
        log.push(error ? { tool: "create_task", ok: false, detail: error.message } : { tool: "create_task", ok: true, detail: `Task: ${call.args.title}` });
      } else if (call.name === "draft_note") {
        const slug = typeof call.args.division_slug === "string" ? call.args.division_slug : "";
        const divId = slugs[slug];
        if (!divId) { log.push({ tool: "draft_note", ok: false, detail: `unknown division ${call.args.division_slug}` }); continue; }
        const { error } = await supabase.from("documents").insert({
          title: String(call.args.title).slice(0, 300), division_id: divId, doc_type: "AI draft",
          status: "draft", body_md: String(call.args.body_md ?? ""), created_by: user.id,
        });
        log.push(error ? { tool: "draft_note", ok: false, detail: error.message } : { tool: "draft_note", ok: true, detail: `Draft: ${call.args.title}` });
      } else if (call.name === "propose_action") {
        const { error } = await supabase.from("ai_pending_actions").insert({
          run_id: runId, user_id: user.id, kind: String(call.args.kind ?? "action"),
          summary: String(call.args.summary ?? "Proposed action"), payload: call.args.payload ?? {},
        });
        log.push(error ? { tool: "propose_action", ok: false, detail: error.message } : { tool: "propose_action", ok: true, detail: `Proposed (needs approval): ${call.args.summary}` });
      }
    } catch (e) {
      log.push({ tool: call.name, ok: false, detail: e instanceof Error ? e.message : "failed" });
    }
  }

  await notify(supabase, user.id, "ai", p.slice(0, 80), res.text || "(action taken)");
  revalidatePath("/ai");
  revalidatePath("/");
  return { ok: true, text: res.text, actions: log, cost };
}

export async function generateBrief(): Promise<Result> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (!(await ownerOnly(supabase))) return { error: "The assistant is owner-only." };

  const apiKey = await resolveOmegaKey(supabase);
  if (!apiKey) return { error: "Assistant not connected. Add your Omega key in Settings → AI Assistant." };

  const today = new Date();
  let context: string;
  try { context = await buildContext(supabase, today); } catch { context = "(snapshot unavailable)"; }

  let res;
  try {
    res = await omegaChat({
      apiKey,
      model: AI_MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Workspace snapshot:\n${context}\n\nWrite my morning brief: the few things that need my attention today, ranked by urgency (overdue money, sign-offs, due tasks, risks). 5-8 lines max, no fluff.` },
      ],
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI call failed" };
  }

  const { cost } = await logRun(supabase, user.id, { purpose: "digest", model: AI_MODEL, usage: res.usage, prompt: "Morning brief", response: res.text, actions: [] });
  await notify(supabase, user.id, "digest", "Morning brief", res.text);
  revalidatePath("/ai");
  revalidatePath("/");
  return { ok: true, text: res.text, actions: [], cost };
}

export async function approvePending(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await db();
  if (!(await ownerOnly(supabase))) return { error: "Owner only." };
  const { data: pa } = await supabase.from("ai_pending_actions").select("*").eq("id", id).maybeSingle();
  if (!pa) return { error: "Not found" };
  if ((pa as Json).status !== "pending") return { error: "Already handled" };

  const kind = (pa as Json).kind;
  const payload = (pa as Json).payload ?? {};
  try {
    if (kind === "set_invoice_status" && payload.invoice_id && payload.status) {
      const patch: Json = { status: payload.status };
      if (payload.status === "paid") patch.paid_on = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from("invoices").update(patch).eq("id", payload.invoice_id);
      if (error) return { error: error.message };
    }
    // other kinds: recorded as approved (acknowledged) — execute manually or extend here.
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to execute" };
  }
  await supabase.from("ai_pending_actions").update({ status: "approved" }).eq("id", id);
  revalidatePath("/ai");
  revalidatePath("/");
  return { ok: true };
}

export async function rejectPending(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await db();
  if (!(await ownerOnly(supabase))) return { error: "Owner only." };
  const { error } = await supabase.from("ai_pending_actions").update({ status: "rejected" }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/ai");
  return { ok: true };
}

// ---- Owner-only key management (Settings → AI Assistant) ----
// The DB functions enforce is_owner(); these just relay and shape the result.

export async function saveOmegaKey(key: string): Promise<{ ok: true; status: string } | { error: string }> {
  const k = (key ?? "").trim();
  if (!k) return { error: "Paste a key first." };
  const supabase = await db();
  const { data, error } = await supabase.rpc("set_omega_key", { p_key: k });
  if (error) return { error: error.message.includes("not authorized") ? "Only the owner can set the key." : error.message };
  revalidatePath("/settings");
  revalidatePath("/ai");
  return { ok: true, status: (data as string) ?? "saved" };
}

export async function clearOmegaKey(): Promise<{ ok: true } | { error: string }> {
  const supabase = await db();
  const { error } = await supabase.rpc("clear_omega_key");
  if (error) return { error: error.message.includes("not authorized") ? "Only the owner can change the key." : error.message };
  revalidatePath("/settings");
  revalidatePath("/ai");
  return { ok: true };
}

export async function testOmegaKey(): Promise<{ ok: true; count: number; hasDefault: boolean; sample: string[] } | { error: string }> {
  const supabase = await db();
  const apiKey = await resolveOmegaKey(supabase);
  if (!apiKey) return { error: "No key saved yet (or you're not the owner)." };
  try {
    const models = await omegaListModels(apiKey);
    return {
      ok: true,
      count: models.length,
      hasDefault: models.includes(AI_MODEL),
      sample: models.slice(0, 8),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Connection failed" };
  }
}
