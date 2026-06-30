// Tool definitions + execution for the Sthyra assistant agent.
// Kept separate from the server action so the (large) tool catalogue and the
// per-tool execution logic stay readable. Everything here runs server-side only.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OmegaTool } from "@/lib/ai/omega";
import type { AiPolicy } from "@/lib/ai/policy";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DB = SupabaseClient<any, any, any>;
type Json = any;

export type ActionLog = { tool: string; ok: boolean; detail: string };

const DIVISION_SLUGS = ["studios", "digital", "construction", "living_twin"] as const;
const PRIORITIES = ["lowest", "low", "medium", "high", "highest"] as const;

const TASK_SHAPE = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short, action-oriented task title" },
    division_slug: { type: "string", enum: [...DIVISION_SLUGS] },
    priority: { type: "string", enum: [...PRIORITIES] },
    due_date: { type: "string", description: "Deadline as YYYY-MM-DD" },
    assignee_name: { type: "string", description: "Full name of the team member who owns this task, if known" },
    description: { type: "string", description: "1-2 line description of what 'done' looks like" },
  },
  required: ["title", "division_slug"],
} as const;

export const ALL_TOOLS: OmegaTool[] = [
  {
    type: "function",
    function: {
      name: "create_task",
      description:
        "Create ONE task in a division. Use only for a single to-do. For several tasks at once, use create_tasks instead.",
      parameters: { ...TASK_SHAPE },
    },
  },
  {
    type: "function",
    function: {
      name: "create_tasks",
      description:
        "Create MANY tasks at once in a single step. Always prefer this when the user asks for more than one task, a checklist, or a set of follow-ups. Give each task a realistic due_date and an assignee when you can.",
      parameters: {
        type: "object",
        properties: {
          tasks: { type: "array", items: { ...TASK_SHAPE }, description: "The tasks to create" },
        },
        required: ["tasks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "plan_project",
      description:
        "Plan and create an ENTIRE project end-to-end: a new project plus all of its tasks with staggered deadlines across the team. Use this when the user describes a goal, feature, deliverable, or initiative they want fully broken down (e.g. 'plan the X launch', 'build me a roadmap for Y'). Produce a complete, ordered task breakdown — discovery → build → review → ship — with each task given a sensible due_date between start_date and target_end_date and an owner.",
      parameters: {
        type: "object",
        properties: {
          project_name: { type: "string" },
          division_slug: { type: "string", enum: [...DIVISION_SLUGS] },
          summary: { type: "string", description: "1-3 sentence project description / objective" },
          start_date: { type: "string", description: "YYYY-MM-DD, defaults to today" },
          target_end_date: { type: "string", description: "YYYY-MM-DD project deadline" },
          tasks: {
            type: "array",
            description: "The full ordered task breakdown for this project",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                priority: { type: "string", enum: [...PRIORITIES] },
                due_date: { type: "string", description: "YYYY-MM-DD" },
                assignee_name: { type: "string" },
                description: { type: "string" },
              },
              required: ["title"],
            },
          },
        },
        required: ["project_name", "division_slug", "tasks"],
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
          division_slug: { type: "string", enum: [...DIVISION_SLUGS] },
          body_md: { type: "string" },
        },
        required: ["title", "division_slug", "body_md"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_time",
      description:
        "Log time spent on an existing task (timesheet entry). Matches the task by its title within divisions the user can access.",
      parameters: {
        type: "object",
        properties: {
          task_title: { type: "string", description: "Title (or part of it) of an existing task" },
          minutes: { type: "number", description: "Minutes spent" },
          date: { type: "string", description: "YYYY-MM-DD, defaults to today" },
          note: { type: "string" },
        },
        required: ["task_title", "minutes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_action",
      description:
        "Propose a money-related or otherwise irreversible action for human approval. Never execute it directly.",
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

export function toolsForPolicy(policy: AiPolicy): OmegaTool[] {
  return ALL_TOOLS.filter((tool) => {
    if (tool.function.name === "draft_note") return policy.canDraftNotes;
    if (tool.function.name === "propose_action") return policy.canProposeActions;
    return true;
  });
}

// --- resolution helpers ------------------------------------------------------

type Stage = { workflowId: string; stageId: string; stageKey: string };
export type Profile = { id: string; full_name: string | null; email: string | null };

function validPriority(v: unknown): string {
  return typeof v === "string" && (PRIORITIES as readonly string[]).includes(v) ? v : "medium";
}

function validDate(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null;
}

export function matchProfileId(profiles: Profile[], name: unknown): string | null {
  if (typeof name !== "string") return null;
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const byFull = profiles.find((p) => (p.full_name ?? "").toLowerCase() === n);
  if (byFull) return byFull.id;
  const byPartial = profiles.find((p) => {
    const full = (p.full_name ?? "").toLowerCase();
    const firstName = full.split(" ")[0] ?? "";
    return full !== "" && (full.includes(n) || (firstName !== "" && n.includes(firstName)));
  });
  if (byPartial) return byPartial.id;
  const byEmail = profiles.find((p) => (p.email ?? "").toLowerCase().split("@")[0] === n);
  return byEmail?.id ?? null;
}

async function firstStageForWorkflow(supabase: DB, workflowId: string): Promise<Stage | null> {
  const { data } = await supabase
    .from("workflow_stages")
    .select("id,key")
    .eq("workflow_id", workflowId)
    .order("position")
    .limit(1)
    .maybeSingle<{ id: string; key: string }>();
  return data ? { workflowId, stageId: data.id, stageKey: data.key } : null;
}

async function generalFirstStage(supabase: DB): Promise<Stage | null> {
  const { data: wf } = await supabase
    .from("task_workflows")
    .select("id")
    .eq("scope_key", "general")
    .maybeSingle<{ id: string }>();
  if (!wf) return null;
  return firstStageForWorkflow(supabase, wf.id);
}

async function projectFirstStage(supabase: DB, projectId: string): Promise<Stage | null> {
  const { data: wf } = await supabase
    .from("task_workflows")
    .select("id")
    .eq("project_id", projectId)
    .maybeSingle<{ id: string }>();
  if (!wf) return null;
  return firstStageForWorkflow(supabase, wf.id);
}

// Shared context resolved once per request and reused across tool calls.
export type ToolContext = {
  slugToDivisionId: Record<string, string>;
  profiles: Profile[];
  generalStage: Stage | null;
  userId: string;
  policy: AiPolicy;
  runId: string | null;
};

export async function buildToolContext(
  supabase: DB,
  userId: string,
  policy: AiPolicy,
  runId: string | null,
): Promise<ToolContext> {
  const [{ data: divisions }, { data: profiles }, generalStage] = await Promise.all([
    supabase.from("divisions").select("id,slug"),
    supabase.from("profiles").select("id,full_name,email").eq("is_active", true),
    generalFirstStage(supabase),
  ]);
  const slugToDivisionId: Record<string, string> = {};
  for (const d of (divisions ?? []) as Json[]) slugToDivisionId[d.slug] = d.id;
  return {
    slugToDivisionId,
    profiles: (profiles ?? []) as Profile[],
    generalStage,
    userId,
    policy,
    runId,
  };
}

async function insertOneTask(
  supabase: DB,
  ctx: ToolContext,
  args: Record<string, unknown>,
  opts: { projectId?: string | null; stage: Stage; divisionId?: string | null },
): Promise<{ ok: boolean; detail: string }> {
  // For project tasks the division comes from the project (opts.divisionId);
  // for standalone tasks it comes from the task's own division_slug.
  const divisionId = opts.divisionId ?? ctx.slugToDivisionId[String(args.division_slug ?? "")];
  if (!divisionId) {
    return { ok: false, detail: `unknown division "${args.division_slug}"` };
  }
  const title = String(args.title ?? "").trim();
  if (!title) return { ok: false, detail: "missing title" };
  const dueDate = validDate(args.due_date);
  const assigneeId = matchProfileId(ctx.profiles, args.assignee_name);
  const { error } = await supabase.from("tasks").insert({
    title: title.slice(0, 300),
    division_id: divisionId,
    project_id: opts.projectId ?? null,
    item_type: "task",
    priority: validPriority(args.priority),
    status_key: opts.stage.stageKey,
    workflow_stage_id: opts.stage.stageId,
    due_date: dueDate,
    assignee_id: assigneeId,
    description: typeof args.description === "string" ? args.description.slice(0, 2000) : null,
    created_by: ctx.userId,
  });
  if (error) return { ok: false, detail: error.message };
  const who = assigneeId ? ` → ${(ctx.profiles.find((p) => p.id === assigneeId)?.full_name) ?? "assigned"}` : "";
  return { ok: true, detail: `${title}${dueDate ? ` (due ${dueDate})` : ""}${who}` };
}

// --- the executor ------------------------------------------------------------

export async function executeToolCall(
  supabase: DB,
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<{ logs: ActionLog[]; result: string }> {
  const logs: ActionLog[] = [];
  const push = (ok: boolean, detail: string) => logs.push({ tool: name, ok, detail });

  try {
    if (name === "create_task") {
      if (!ctx.generalStage) { push(false, "no general workflow configured"); return { logs, result: "Failed: no workflow" }; }
      const r = await insertOneTask(supabase, ctx, args, { stage: ctx.generalStage });
      push(r.ok, r.detail);
      return { logs, result: r.ok ? `Created task: ${r.detail}` : `Failed: ${r.detail}` };
    }

    if (name === "create_tasks") {
      if (!ctx.generalStage) { push(false, "no general workflow configured"); return { logs, result: "Failed: no workflow" }; }
      const list = Array.isArray(args.tasks) ? (args.tasks as Record<string, unknown>[]) : [];
      if (list.length === 0) { push(false, "no tasks provided"); return { logs, result: "No tasks provided." }; }
      let made = 0;
      for (const t of list.slice(0, 40)) {
        const r = await insertOneTask(supabase, ctx, t, { stage: ctx.generalStage });
        push(r.ok, r.detail);
        if (r.ok) made += 1;
      }
      return { logs, result: `Created ${made}/${list.length} task(s): ${logs.filter((l) => l.ok).map((l) => l.detail).join("; ")}` };
    }

    if (name === "plan_project") {
      const divisionId = ctx.slugToDivisionId[String(args.division_slug ?? "")];
      if (!divisionId) { push(false, `unknown division "${args.division_slug}"`); return { logs, result: "Failed: unknown division" }; }
      const projectName = String(args.project_name ?? "").trim();
      if (!projectName) { push(false, "missing project_name"); return { logs, result: "Failed: missing project name" }; }
      const { data: projectId, error: rpcError } = await supabase.rpc("create_project_with_workflow", {
        project_name: projectName.slice(0, 200),
        project_client: null,
        project_description: typeof args.summary === "string" ? args.summary.slice(0, 4000) : null,
        project_starts_on: validDate(args.start_date),
        project_target_end_on: validDate(args.target_end_date),
        project_lead: null,
        project_division: divisionId,
        project_budget_paise: 0,
      });
      if (rpcError || !projectId) {
        push(false, rpcError?.message ?? "project not created");
        return { logs, result: `Failed to create project: ${rpcError?.message ?? "unknown"}` };
      }
      push(true, `Project "${projectName}" created`);
      const stage = await projectFirstStage(supabase, projectId as string);
      const list = Array.isArray(args.tasks) ? (args.tasks as Record<string, unknown>[]) : [];
      let made = 0;
      if (stage) {
        for (const t of list.slice(0, 60)) {
          const r = await insertOneTask(supabase, ctx, t, { projectId: projectId as string, stage, divisionId });
          push(r.ok, r.detail);
          if (r.ok) made += 1;
        }
      }
      return {
        logs,
        result: `Created project "${projectName}" with ${made} task(s). Tasks: ${logs.filter((l) => l.ok && l.detail !== `Project "${projectName}" created`).map((l) => l.detail).join("; ")}`,
      };
    }

    if (name === "draft_note") {
      if (!ctx.policy.canDraftNotes) { push(false, "not allowed"); return { logs, result: "Not allowed for this role." }; }
      const divisionId = ctx.slugToDivisionId[String(args.division_slug ?? "")];
      if (!divisionId) { push(false, `unknown division "${args.division_slug}"`); return { logs, result: "Failed: unknown division" }; }
      const { error } = await supabase.from("documents").insert({
        title: String(args.title ?? "Untitled").slice(0, 300),
        division_id: divisionId,
        doc_type: "AI draft",
        status: "draft",
        body_md: String(args.body_md ?? ""),
        created_by: ctx.userId,
      });
      push(!error, error ? error.message : `Draft: ${args.title}`);
      return { logs, result: error ? `Failed: ${error.message}` : `Drafted note "${args.title}".` };
    }

    if (name === "log_time") {
      const titleQ = String(args.task_title ?? "").trim();
      const minutes = Math.max(1, Math.floor(Number(args.minutes) || 0));
      if (!titleQ || !minutes) { push(false, "missing task or minutes"); return { logs, result: "Failed: need task and minutes" }; }
      const { data: task } = await supabase
        .from("tasks")
        .select("id,title")
        .ilike("title", `%${titleQ}%`)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; title: string }>();
      if (!task) { push(false, `no task matching "${titleQ}"`); return { logs, result: `No task found matching "${titleQ}".` }; }
      const startedAt = (validDate(args.date) ?? new Date().toISOString().slice(0, 10)) + "T09:00:00Z";
      const { error } = await supabase.from("task_work_logs").insert({
        task_id: task.id,
        profile_id: ctx.userId,
        started_at: startedAt,
        minutes,
        note: typeof args.note === "string" ? args.note.slice(0, 500) : null,
      });
      push(!error, error ? error.message : `${minutes}m on "${task.title}"`);
      return { logs, result: error ? `Failed: ${error.message}` : `Logged ${minutes} minutes on "${task.title}".` };
    }

    if (name === "propose_action") {
      if (!ctx.policy.canProposeActions) { push(false, "not allowed"); return { logs, result: "Not allowed for this role." }; }
      const { error } = await supabase.from("ai_pending_actions").insert({
        run_id: ctx.runId,
        user_id: ctx.userId,
        kind: String(args.kind ?? "action"),
        summary: String(args.summary ?? "Proposed action"),
        payload: args.payload ?? {},
      });
      push(!error, error ? error.message : `Proposed (needs approval): ${args.summary}`);
      return { logs, result: error ? `Failed: ${error.message}` : `Proposed for your approval: ${args.summary}` };
    }

    push(false, `unknown tool ${name}`);
    return { logs, result: `Unknown tool ${name}` };
  } catch (e) {
    push(false, e instanceof Error ? e.message : "failed");
    return { logs, result: `Error: ${e instanceof Error ? e.message : "failed"}` };
  }
}
