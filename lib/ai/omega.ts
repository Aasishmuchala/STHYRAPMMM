// Server-only client for the KesarCloud Omega gateway (OpenAI-compatible /v1).
// The API key is resolved per-call from Supabase Vault (owner-managed) or an env override.
// Never import this from client components.

import type { SupabaseClient } from "@supabase/supabase-js";

const BASE = process.env.OMEGA_BASE_URL || "https://omega.kesarcloud.in/v1";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export type OmegaTool = {
  type: "function";
  function: { name: string; description: string; parameters: object };
};
export type OmegaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Json[];
};
export type OmegaUsage = { input_tokens: number; output_tokens: number };
export type OmegaToolCall = { id: string; name: string; args: Json };
export type OmegaResult = { text: string; toolCalls: OmegaToolCall[]; usage: OmegaUsage; raw: Json };

// Resolves the key: env override first (for cron/server), else the owner-stored Vault secret.
export async function resolveOmegaKey(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<string | null> {
  const envKey = (process.env.OMEGA_API_KEY || "").trim();
  if (envKey) return envKey;
  try {
    const { data } = await supabase.rpc("get_omega_key");
    const k = (data as string | null) ?? null;
    return k && k.trim() ? k.trim() : null;
  } catch {
    return null;
  }
}

function safeJson(s: unknown): Json {
  try { return typeof s === "string" ? JSON.parse(s) : (s ?? {}); } catch { return {}; }
}

export async function omegaChat(opts: {
  apiKey: string;
  model: string;
  messages: OmegaMessage[];
  tools?: OmegaTool[];
  temperature?: number;
  maxTokens?: number;
}): Promise<OmegaResult> {
  if (!opts.apiKey) throw new Error("No Omega API key — add it in Settings → AI Assistant.");

  const body: Json = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 1500,
  };
  if (opts.tools?.length) { body.tools = opts.tools; body.tool_choice = "auto"; }

  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Omega ${res.status}: ${t.slice(0, 400)}`);
  }
  const data: Json = await res.json();
  const msg: Json = data.choices?.[0]?.message ?? {};
  const text: string = msg.content ?? "";
  const toolCalls: OmegaToolCall[] = (msg.tool_calls ?? []).map((tc: Json) => ({
    id: tc.id, name: tc.function?.name, args: safeJson(tc.function?.arguments),
  }));
  const u: Json = data.usage ?? {};
  const usage: OmegaUsage = {
    input_tokens: u.prompt_tokens ?? u.input_tokens ?? 0,
    output_tokens: u.completion_tokens ?? u.output_tokens ?? 0,
  };
  return { text, toolCalls, usage, raw: data };
}

// Lightweight auth/connectivity check used by the Settings "Test" button.
export async function omegaListModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`${BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Omega ${res.status}: ${t.slice(0, 300)}`);
  }
  const data: Json = await res.json();
  const arr: Json[] = data?.data ?? data?.models ?? [];
  return Array.isArray(arr) ? arr.map((m: Json) => m.id ?? m.name).filter(Boolean) : [];
}
