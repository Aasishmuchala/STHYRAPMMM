import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

type JsonRecord = Record<string, unknown>;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function authenticate(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(auth);
  if (!match) return { error: "Missing Authorization: Bearer <token>" };
  const token = match[1];
  if (!token) return { error: "Missing API token." };
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  // Service-role lookup against `api_keys`. The hashing + revocation check
  // mirrors `lookupApiKey()` in app/settings/api-keys-actions.ts — we keep the
  // logic inlined so the route is self-contained.
  const hashed = await import("node:crypto").then(({ createHash }) => createHash("sha256").update(token).digest("hex"));
  const { data, error: lookupErr } = await supabase
    .from("api_keys")
    .select("id,created_by,scopes,revoked_at")
    .eq("hashed_token", hashed)
    .maybeSingle<{ id: string; created_by: string; scopes: string[]; revoked_at: string | null }>();
  if (lookupErr) return { error: lookupErr.message };
  if (!data || data.revoked_at) return { error: "Invalid API key." };
  await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { userId: data.created_by, scopes: data.scopes, apiKeyId: data.id };
}

export async function GET(req: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return jsonError("API not configured.", 503);
  }
  const auth = await authenticate(req);
  if ("error" in auth) return jsonError(auth.error ?? "Unauthorized", 401);
  if (!auth.scopes.includes("read")) return jsonError("API key does not have read scope.", 403);

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") ?? "50")));
  const cursor = url.searchParams.get("cursor");
  const status = url.searchParams.get("status");
  const projectId = url.searchParams.get("project_id");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

  let query = supabase
    .from("tasks")
    .select("id,title,status,priority,division_id,project_id,assignee_id,due_date,created_at,completed_at,workflow_stage_id,item_type")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (cursor) query = query.lt("created_at", cursor);
  if (status) query = query.eq("status", status);
  if (projectId) query = query.eq("project_id", projectId);

  const { data, error: queryErr } = await query;
  if (queryErr) return jsonError(queryErr.message, 500);

  const lastRow = data && data.length === limit && data.length > 0 ? data[data.length - 1] : null;
  const nextCursor = lastRow?.created_at ?? null;
  return NextResponse.json({
    data,
    paging: { limit, next_cursor: nextCursor },
  });
}

export async function POST(req: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return jsonError("API not configured.", 503);
  }
  const auth = await authenticate(req);
  if ("error" in auth) return jsonError(auth.error ?? "Unauthorized", 401);
  if (!auth.scopes.includes("write")) return jsonError("API key does not have write scope.", 403);

  const body = (await req.json().catch(() => null)) as JsonRecord | null;
  if (!body) return jsonError("Invalid JSON body.", 400);
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const divisionId = typeof body.division_id === "string" ? body.division_id : "";
  if (!title) return jsonError("title is required.", 400);
  if (!divisionId) return jsonError("division_id is required.", 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data, error: insertErr } = await supabase.from("tasks").insert({
    title: title.slice(0, 300),
    division_id: divisionId,
    project_id: typeof body.project_id === "string" ? body.project_id : null,
    priority: ["lowest", "low", "medium", "high", "highest"].includes(String(body.priority)) ? body.priority : "medium",
    due_date: typeof body.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date) ? body.due_date : null,
    assignee_id: typeof body.assignee_id === "string" ? body.assignee_id : null,
    status_key: "todo",
    created_by: auth.userId,
  }).select("id,title,status,priority,division_id,project_id,assignee_id,due_date,created_at").single();
  if (insertErr) return jsonError(insertErr.message, 400);
  return NextResponse.json({ data }, { status: 201 });
}
