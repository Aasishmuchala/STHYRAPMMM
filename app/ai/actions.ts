"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadUserWorkspaceAccess } from "@/lib/server-access";
import { omegaChat, omegaListModels, resolveOmegaKey, type OmegaTool } from "@/lib/ai/omega";
import { costInr } from "@/lib/ai/cost";
import { buildContext } from "@/lib/ai/context";
import { loadAiConsoleData } from "@/lib/ai/loadAiConsoleData";
import { aiScopePrompt, deriveAiPolicy, type AiPolicy } from "@/lib/ai/policy";
import type { AiDrawerData } from "@/components/shell/AiDrawerHost";

const AI_MODEL = "claude-opus-4-8";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function db(): Promise<SupabaseClient<any, any, any>> {
  return (await createClient()) as unknown as SupabaseClient<any, any, any>;
}
type Json = any;

async function loadAiPolicy(supabase: SupabaseClient<any, any, any>, userId: string): Promise<AiPolicy> {
  const { globalRole, memberships } = await loadUserWorkspaceAccess(supabase, userId);
  return deriveAiPolicy(globalRole, memberships);
}

async function currentUserAndPolicy(supabase: SupabaseClient<any, any, any>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, policy: deriveAiPolicy(null, []) };
  const policy = await loadAiPolicy(supabase, user.id);
  return { user, policy };
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
      description: "Create a draft document in a division, such as a weekly update or summary.",
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
      description: "Propose a money-related or irreversible action for human approval. Never execute it directly.",
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
The workspace snapshot may include finances, operating notes, tasks, documents, and delivery context depending on the user's role.
How to advise: use only the provided snapshot. Be concise, practical, and specific. Cite the figure or fact you are using when one is present. If the data is missing or outside the user's scope, say so plainly instead of guessing.
Tool rules:
- For to-dos and follow-ups, call create_task.
- For drafts and summaries, call draft_note only when that tool is available.
- For anything touching money or that is irreversible, call propose_action only when that tool is available. Never execute those actions directly.
- If a tool is not available for the user's role, respond with text instead.`;

function toolsForPolicy(policy: AiPolicy): OmegaTool[] {
  return TOOLS.filter((tool) => {
    if (tool.function.name === "draft_note") return policy.canDraftNotes;
    if (tool.function.name === "propose_action") return policy.canProposeActions;
    return true;
  });
}

async function slugMap(supabase: SupabaseClient<any, any, any>): Promise<Record<string, string>> {
  const { data } = await supabase.from("divisions").select("id,slug");
  const m: Record<string, string> = {};
  for (const d of (data ?? []) as Json[]) m[d.slug] = d.id;
  return m;
}

async function logRun(supabase: SupabaseClient<any, any, any>, userId: string, row: {
  purpose: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  prompt: string;
  response: string;
  actions: Json;
  status?: string;
  error?: string;
}): Promise<{ cost: number; runId: string | null }> {
  const cost = costInr(row.model, { input_tokens: row.usage.input_tokens, output_tokens: row.usage.output_tokens });
  const { data } = await supabase.from("ai_runs").insert({
    user_id: userId,
    purpose: row.purpose,
    model: row.model,
    input_tokens: row.usage.input_tokens,
    output_tokens: row.usage.output_tokens,
    cost_inr: cost,
    prompt: row.prompt.slice(0, 4000),
    response: (row.response ?? "").slice(0, 8000),
    actions: row.actions,
    status: row.status ?? "ok",
    error: row.error ?? null,
  }).select("id").maybeSingle();
  return { cost, runId: (data as Json)?.id ?? null };
}

async function notify(supabase: SupabaseClient<any, any, any>, userId: string, kind: string, title: string, body: string) {
  await supabase.from("notifications").insert({
    user_id: userId,
    kind,
    title,
    body: body.slice(0, 8000),
    link: "/ai",
  });
}

function systemPromptFor(policy: AiPolicy): string {
  return `${SYSTEM}\n\nACCESS RULES:\n${aiScopePrompt(policy)}`;
}

export async function askAi(prompt: string): Promise<Result> {
  const p = prompt.trim();
  if (!p) return { error: "Ask something first." };

  const supabase = await db();
  const { user, policy } = await currentUserAndPolicy(supabase);
  if (!user) return { error: "Not authenticated" };
  if (!policy.canUseAssistant) return { error: "The assistant is not available for your role." };

  const apiKey = await resolveOmegaKey(supabase);
  if (!apiKey) return { error: "Assistant not connected. Add your Omega key in Settings -> AI Assistant." };

  const today = new Date();
  let context = "(snapshot unavailable)";
  try {
    context = await buildContext(supabase, today, policy);
  } catch {
    // Keep the request working even if the workspace snapshot is temporarily unavailable.
  }

  let res;
  try {
    res = await omegaChat({
      apiKey,
      model: AI_MODEL,
      tools: toolsForPolicy(policy),
      messages: [
        { role: "system", content: systemPromptFor(policy) },
        { role: "user", content: `Workspace snapshot:\n${context}\n\nRequest: ${p}` },
      ],
    });
  } catch (e) {
    const supabase2 = await db();
    await logRun(supabase2, user.id, {
      purpose: "ask",
      model: AI_MODEL,
      usage: { input_tokens: 0, output_tokens: 0 },
      prompt: p,
      response: "",
      actions: [],
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    });
    revalidatePath("/ai");
    return { error: e instanceof Error ? e.message : "AI call failed" };
  }

  const slugs = await slugMap(supabase);
  const log: ActionLog[] = [];
  const { cost, runId } = await logRun(supabase, user.id, {
    purpose: "ask",
    model: AI_MODEL,
    usage: res.usage,
    prompt: p,
    response: res.text,
    actions: res.toolCalls.map((t) => ({ name: t.name, args: t.args })),
  });

  for (const call of res.toolCalls) {
    try {
      if (call.name === "create_task") {
        const slug = typeof call.args.division_slug === "string" ? call.args.division_slug : "";
        const divId = slugs[slug];
        if (!divId) {
          log.push({ tool: "create_task", ok: false, detail: `unknown division ${call.args.division_slug}` });
          continue;
        }
        const rawDue = typeof call.args.due_date === "string" ? call.args.due_date.trim() : "";
        const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDue) ? rawDue : null;
        const priority = typeof call.args.priority === "string"
          && ["lowest", "low", "medium", "high", "highest"].includes(call.args.priority)
          ? call.args.priority
          : "medium";
        const { error } = await supabase.from("tasks").insert({
          title: String(call.args.title).slice(0, 300),
          division_id: divId,
          priority,
          status_key: "todo",
          due_date: dueDate,
          created_by: user.id,
        });
        log.push(error
          ? { tool: "create_task", ok: false, detail: error.message }
          : { tool: "create_task", ok: true, detail: `Task: ${call.args.title}` });
      } else if (call.name === "draft_note" && policy.canDraftNotes) {
        const slug = typeof call.args.division_slug === "string" ? call.args.division_slug : "";
        const divId = slugs[slug];
        if (!divId) {
          log.push({ tool: "draft_note", ok: false, detail: `unknown division ${call.args.division_slug}` });
          continue;
        }
        const { error } = await supabase.from("documents").insert({
          title: String(call.args.title).slice(0, 300),
          division_id: divId,
          doc_type: "AI draft",
          status: "draft",
          body_md: String(call.args.body_md ?? ""),
          created_by: user.id,
        });
        log.push(error
          ? { tool: "draft_note", ok: false, detail: error.message }
          : { tool: "draft_note", ok: true, detail: `Draft: ${call.args.title}` });
      } else if (call.name === "propose_action" && policy.canProposeActions) {
        const { error } = await supabase.from("ai_pending_actions").insert({
          run_id: runId,
          user_id: user.id,
          kind: String(call.args.kind ?? "action"),
          summary: String(call.args.summary ?? "Proposed action"),
          payload: call.args.payload ?? {},
        });
        log.push(error
          ? { tool: "propose_action", ok: false, detail: error.message }
          : { tool: "propose_action", ok: true, detail: `Proposed (needs approval): ${call.args.summary}` });
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
  const { user, policy } = await currentUserAndPolicy(supabase);
  if (!user) return { error: "Not authenticated" };
  if (!policy.canUseAssistant) return { error: "The assistant is not available for your role." };

  const apiKey = await resolveOmegaKey(supabase);
  if (!apiKey) return { error: "Assistant not connected. Add your Omega key in Settings -> AI Assistant." };

  const today = new Date();
  let context = "(snapshot unavailable)";
  try {
    context = await buildContext(supabase, today, policy);
  } catch {
    // Keep the request working even if the workspace snapshot is temporarily unavailable.
  }

  let res;
  try {
    res = await omegaChat({
      apiKey,
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPromptFor(policy) },
        { role: "user", content: `Workspace snapshot:\n${context}\n\nWrite my brief for today in 5-8 lines max, ranked by urgency and limited to the scope I am allowed to see.` },
      ],
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI call failed" };
  }

  const { cost } = await logRun(supabase, user.id, {
    purpose: "digest",
    model: AI_MODEL,
    usage: res.usage,
    prompt: "Morning brief",
    response: res.text,
    actions: [],
  });
  await notify(supabase, user.id, "digest", "Morning brief", res.text);
  revalidatePath("/ai");
  revalidatePath("/");
  return { ok: true, text: res.text, actions: [], cost };
}

export async function approvePending(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await db();
  const { user, policy } = await currentUserAndPolicy(supabase);
  if (!user || policy.audience !== "owner") return { error: "Owner only." };

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
  const { user, policy } = await currentUserAndPolicy(supabase);
  if (!user || policy.audience !== "owner") return { error: "Owner only." };
  const { error } = await supabase.from("ai_pending_actions").update({ status: "rejected" }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/ai");
  return { ok: true };
}

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

export async function getAiDrawerData(): Promise<AiDrawerData | { error: string }> {
  const supabase = await db();
  const { user } = await currentUserAndPolicy(supabase);
  if (!user) return { error: "Not authenticated" };

  const [{ access }, aiData] = await Promise.all([
    loadUserWorkspaceAccess(supabase, user.id),
    loadAiConsoleData(supabase),
  ]);

  return {
    configured: aiData.configured,
    isOwner: access.isSuperAdmin,
    runs: aiData.runs,
    pending: aiData.pending,
    latestBrief: aiData.latestBrief,
    spendToday: aiData.spendToday,
    spendMonth: aiData.spendMonth,
    runCount: aiData.runCount,
  };
}
