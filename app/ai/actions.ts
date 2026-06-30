"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadUserWorkspaceAccess } from "@/lib/server-access";
import { omegaChat, omegaListModels, resolveOmegaKey, type OmegaMessage } from "@/lib/ai/omega";
import { costInr } from "@/lib/ai/cost";
import { buildContext } from "@/lib/ai/context";
import { loadAiConsoleData } from "@/lib/ai/loadAiConsoleData";
import { aiScopePrompt, deriveAiPolicy, type AiPolicy } from "@/lib/ai/policy";
import { clearSharedOmegaKey, writeSharedOmegaKey } from "@/lib/ai/keyBridge";
import {
  buildToolContext,
  executeToolCall,
  toolsForPolicy,
  type ActionLog,
} from "@/lib/ai/agentTools";
import type { AiDrawerData } from "@/components/shell/AiDrawerHost";

const AI_MODEL = "claude-opus-4-8";
const MAX_TOOL_ROUNDS = 5;
const HISTORY_TURNS = 12; // prior user+assistant pairs replayed for memory

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

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions?: ActionLog[];
  cost?: number;
  createdAt: string;
};

export type SessionSummary = { id: string; title: string; updatedAt: string };

export type AskResult =
  | { ok: true; text: string; actions: ActionLog[]; cost: number; sessionId: string; title: string }
  | { error: string };

const SYSTEM = `You are the Sthyra Command Center assistant — an operations agent for a four-division business: Studios, Digital, Construction Management, and Living Twin (division slugs: studios, digital, construction, living_twin).

You can DO things, not just talk. When the user asks you to create or plan work, you MUST use the tools to actually create it. Never claim you created something unless a tool call succeeded.

TOOLS
- create_task — one single to-do.
- create_tasks — several tasks in one step. Prefer this whenever more than one task is needed.
- plan_project — a whole project broken into tasks with deadlines and owners, end-to-end.
- draft_note / log_time / propose_action — when available for the user's role.

PLANNING RULES
- When asked to plan a project, feature, launch, or deliverable end-to-end, call plan_project with a COMPLETE, ordered breakdown that carries the work from start to finish (discovery → design → build → review → launch/handover).
- Give EVERY task a realistic due_date, staggered so earlier/blocking work is due first and the last task lands on or before the deadline. Never leave a task without a deadline.
- Assign each task to a sensible owner from the team list in the snapshot when one fits, and spread the work across the team rather than piling it on one person.
- Set priorities deliberately: highest/high for blockers and deadline-critical work, medium/low otherwise.

STYLE
- Be concise and concrete. Use the live snapshot for facts and cite the specific figure when you rely on one.
- After using tools, confirm exactly what you created — the real titles and dates — in at most a few short sentences. Do NOT pad with extra advice, alternatives, or speculation unless the user asks.
- If something is outside the user's access scope or absent from the snapshot, say so plainly instead of guessing.
- Respect today's date (given in the snapshot) for every deadline.`;

function systemPromptFor(policy: AiPolicy, context: string): string {
  return `${SYSTEM}\n\nACCESS RULES:\n${aiScopePrompt(policy)}\n\nLIVE WORKSPACE SNAPSHOT (your source of truth for facts):\n${context}`;
}

async function logRun(supabase: SupabaseClient<any, any, any>, userId: string, row: {
  sessionId: string | null;
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
    session_id: row.sessionId,
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

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function titleFromPrompt(prompt: string): string {
  const clean = prompt.trim().replace(/\s+/g, " ");
  if (!clean) return "New chat";
  return clean.length > 48 ? `${clean.slice(0, 48)}…` : clean;
}

export async function listAiSessions(): Promise<SessionSummary[]> {
  const supabase = await db();
  const { user } = await currentUserAndPolicy(supabase);
  if (!user) return [];
  const { data } = await supabase
    .from("ai_sessions")
    .select("id,title,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  return ((data ?? []) as Json[]).map((s) => ({ id: s.id, title: s.title, updatedAt: s.updated_at }));
}

export async function createAiSession(): Promise<{ id: string } | { error: string }> {
  const supabase = await db();
  const { user } = await currentUserAndPolicy(supabase);
  if (!user) return { error: "Not authenticated" };
  const { data, error } = await supabase
    .from("ai_sessions")
    .insert({ user_id: user.id, title: "New chat" })
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "Could not create chat" };
  return { id: (data as Json).id };
}

export async function renameAiSession(id: string, title: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await db();
  const { user } = await currentUserAndPolicy(supabase);
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase
    .from("ai_sessions")
    .update({ title: title.trim().slice(0, 80) || "New chat" })
    .eq("id", id)
    .eq("user_id", user.id);
  return error ? { error: error.message } : { ok: true };
}

export async function deleteAiSession(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await db();
  const { user } = await currentUserAndPolicy(supabase);
  if (!user) return { error: "Not authenticated" };
  const { error } = await supabase.from("ai_sessions").delete().eq("id", id).eq("user_id", user.id);
  return error ? { error: error.message } : { ok: true };
}

export async function loadAiSession(id: string): Promise<{ id: string; title: string; messages: ChatMessage[] } | { error: string }> {
  const supabase = await db();
  const { user } = await currentUserAndPolicy(supabase);
  if (!user) return { error: "Not authenticated" };
  const [{ data: session }, { data: runs }] = await Promise.all([
    supabase.from("ai_sessions").select("id,title").eq("id", id).eq("user_id", user.id).maybeSingle(),
    supabase
      .from("ai_runs")
      .select("id,prompt,response,actions,cost_inr,created_at,purpose")
      .eq("session_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
  ]);
  if (!session) return { error: "Chat not found" };
  const messages: ChatMessage[] = [];
  for (const r of (runs ?? []) as Json[]) {
    if (r.prompt) messages.push({ id: `${r.id}-u`, role: "user", text: r.prompt, createdAt: r.created_at });
    if (r.response || (Array.isArray(r.actions) && r.actions.length)) {
      messages.push({
        id: `${r.id}-a`,
        role: "assistant",
        text: r.response ?? "",
        actions: Array.isArray(r.actions) ? (r.actions as ActionLog[]) : [],
        cost: Number(r.cost_inr) || 0,
        createdAt: r.created_at,
      });
    }
  }
  return { id: (session as Json).id, title: (session as Json).title, messages };
}

async function loadHistoryForModel(
  supabase: SupabaseClient<any, any, any>,
  sessionId: string,
  userId: string,
): Promise<OmegaMessage[]> {
  const { data } = await supabase
    .from("ai_runs")
    .select("prompt,response,created_at")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .eq("purpose", "ask")
    .order("created_at", { ascending: false })
    .limit(HISTORY_TURNS);
  const rows = ((data ?? []) as Json[]).reverse();
  const msgs: OmegaMessage[] = [];
  for (const r of rows) {
    if (r.prompt) msgs.push({ role: "user", content: r.prompt });
    if (r.response) msgs.push({ role: "assistant", content: r.response });
  }
  return msgs;
}

// ---------------------------------------------------------------------------
// Ask — the agent loop
// ---------------------------------------------------------------------------

export async function askAi(sessionIdInput: string | null, prompt: string): Promise<AskResult> {
  const p = prompt.trim();
  if (!p) return { error: "Ask something first." };

  const supabase = await db();
  const { user, policy } = await currentUserAndPolicy(supabase);
  if (!user) return { error: "Not authenticated" };
  if (!policy.canUseAssistant) return { error: "The assistant is not available for your role." };

  const apiKey = await resolveOmegaKey(supabase);
  if (!apiKey) return { error: "Assistant not connected. Add your Omega key in Settings → AI Assistant." };
  if (policy.audience === "owner") await writeSharedOmegaKey(apiKey, user.id);

  // Resolve / create the session.
  let sessionId = sessionIdInput;
  let title = "";
  if (!sessionId) {
    const created = await createAiSession();
    if ("error" in created) return { error: created.error };
    sessionId = created.id;
  }
  const { data: sessionRow } = await supabase
    .from("ai_sessions")
    .select("id,title")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!sessionRow) return { error: "Chat not found" };
  title = (sessionRow as Json).title;

  const today = new Date();
  let context = "(snapshot unavailable)";
  try {
    context = await buildContext(supabase, today, policy);
  } catch {
    // Keep the request working even if the snapshot is temporarily unavailable.
  }

  const history = await loadHistoryForModel(supabase, sessionId, user.id);
  const ctx = await buildToolContext(supabase, user.id, policy, null);
  const tools = toolsForPolicy(policy);

  const messages: OmegaMessage[] = [
    { role: "system", content: systemPromptFor(policy, context) },
    ...history,
    { role: "user", content: p },
  ];

  const allLogs: ActionLog[] = [];
  let finalText = "";
  let totalIn = 0;
  let totalOut = 0;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await omegaChat({ apiKey, model: AI_MODEL, tools, messages, maxTokens: 4000 });
      totalIn += res.usage.input_tokens;
      totalOut += res.usage.output_tokens;

      if (res.toolCalls.length === 0) {
        finalText = res.text;
        break;
      }

      // Append the assistant's tool-call turn, assigning stable ids.
      const calls = res.toolCalls.map((c, i) => ({ ...c, id: c.id || `call_${round}_${i}` }));
      messages.push({
        role: "assistant",
        content: res.text || null,
        tool_calls: calls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.args) },
        })),
      });

      for (const call of calls) {
        const { logs, result } = await executeToolCall(supabase, ctx, call.name, call.args);
        allLogs.push(...logs);
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }

      if (res.text) finalText = res.text;
      if (round === MAX_TOOL_ROUNDS - 1) {
        // Final round hit the cap — give the model one more chance to summarise.
        const wrap = await omegaChat({ apiKey, model: AI_MODEL, messages, maxTokens: 1200 });
        totalIn += wrap.usage.input_tokens;
        totalOut += wrap.usage.output_tokens;
        if (wrap.text) finalText = wrap.text;
      }
    }
  } catch (e) {
    await logRun(supabase, user.id, {
      sessionId, purpose: "ask", model: AI_MODEL,
      usage: { input_tokens: totalIn, output_tokens: totalOut },
      prompt: p, response: finalText, actions: allLogs,
      status: "failed", error: e instanceof Error ? e.message : String(e),
    });
    return { error: e instanceof Error ? e.message : "AI call failed" };
  }

  if (!finalText) {
    const ok = allLogs.filter((l) => l.ok);
    finalText = ok.length ? `Done — ${ok.map((l) => l.detail).join("; ")}.` : "Done.";
  }

  const { cost } = await logRun(supabase, user.id, {
    sessionId, purpose: "ask", model: AI_MODEL,
    usage: { input_tokens: totalIn, output_tokens: totalOut },
    prompt: p, response: finalText, actions: allLogs,
  });

  // Title the session from its first message; always bump updated_at.
  const nextTitle = title === "New chat" ? titleFromPrompt(p) : title;
  await supabase
    .from("ai_sessions")
    .update({ title: nextTitle, updated_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", user.id);

  await notify(supabase, user.id, "ai", p.slice(0, 80), finalText || "(action taken)");
  revalidatePath("/ai");
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/projects");
  return { ok: true, text: finalText, actions: allLogs, cost, sessionId, title: nextTitle };
}

export async function generateBrief(sessionIdInput: string | null): Promise<AskResult> {
  const supabase = await db();
  const { user, policy } = await currentUserAndPolicy(supabase);
  if (!user) return { error: "Not authenticated" };
  if (!policy.canUseAssistant) return { error: "The assistant is not available for your role." };

  const apiKey = await resolveOmegaKey(supabase);
  if (!apiKey) return { error: "Assistant not connected. Add your Omega key in Settings → AI Assistant." };
  if (policy.audience === "owner") await writeSharedOmegaKey(apiKey, user.id);

  let sessionId = sessionIdInput;
  if (!sessionId) {
    const created = await createAiSession();
    if ("error" in created) return { error: created.error };
    sessionId = created.id;
  }

  const today = new Date();
  let context = "(snapshot unavailable)";
  try {
    context = await buildContext(supabase, today, policy);
  } catch { /* keep working */ }

  let res;
  try {
    res = await omegaChat({
      apiKey,
      model: AI_MODEL,
      messages: [
        { role: "system", content: systemPromptFor(policy, context) },
        { role: "user", content: "Write my brief for today in 5–8 lines max, ranked by urgency and limited to the scope I'm allowed to see. No preamble." },
      ],
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI call failed" };
  }

  const { cost } = await logRun(supabase, user.id, {
    sessionId, purpose: "ask", model: AI_MODEL, usage: res.usage,
    prompt: "Morning brief", response: res.text, actions: [],
  });
  await supabase.from("ai_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sessionId).eq("user_id", user.id);
  await notify(supabase, user.id, "digest", "Morning brief", res.text);
  revalidatePath("/ai");
  revalidatePath("/");
  return { ok: true, text: res.text, actions: [], cost, sessionId, title: "Morning brief" };
}

// ---------------------------------------------------------------------------
// Pending actions + key management (unchanged behaviour)
// ---------------------------------------------------------------------------

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
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc("set_omega_key", { p_key: k });
  if (error) return { error: error.message.includes("not authorized") ? "Only the owner can set the key." : error.message };
  await writeSharedOmegaKey(k, user?.id ?? null);
  revalidatePath("/settings");
  revalidatePath("/ai");
  return { ok: true, status: (data as string) ?? "saved" };
}

export async function clearOmegaKey(): Promise<{ ok: true } | { error: string }> {
  const supabase = await db();
  const { error } = await supabase.rpc("clear_omega_key");
  if (error) return { error: error.message.includes("not authorized") ? "Only the owner can change the key." : error.message };
  await clearSharedOmegaKey();
  revalidatePath("/settings");
  revalidatePath("/ai");
  return { ok: true };
}

export async function testOmegaKey(): Promise<{ ok: true; count: number; hasDefault: boolean; sample: string[] } | { error: string }> {
  const supabase = await db();
  const { data: { user } } = await supabase.auth.getUser();
  const apiKey = await resolveOmegaKey(supabase);
  if (!apiKey) return { error: "No key saved yet (or you're not the owner)." };
  await writeSharedOmegaKey(apiKey, user?.id ?? null);
  try {
    const models = await omegaListModels(apiKey);
    return { ok: true, count: models.length, hasDefault: models.includes(AI_MODEL), sample: models.slice(0, 8) };
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
