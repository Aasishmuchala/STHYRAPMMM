// Server-only client for the KesarCloud Omega gateway (OpenAI-compatible /v1).
// The API key is resolved per-call from Supabase Vault (owner-managed) or an env override.
// Never import this from client components.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { SupabaseClient } from "@supabase/supabase-js";

const BASE = process.env.OMEGA_BASE_URL || "https://omega.kesarcloud.in/v1";

// Json narrowed to `unknown`; we use type guards at every boundary.
export type Json = unknown;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function safeJson(s: unknown): Json {
  try {
    if (typeof s !== "string") return s ?? {};
    return parseJsonishText(s);
  } catch {
    return {};
  }
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function parseJsonishText(text: string): Json {
  const raw = text.trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return parseSseText(raw);
  }
}

function parseSseText(text: string): Json {
  const events = text
    .split(/\r?\n\r?\n/)
    .map((block) =>
      block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n")
        .trim(),
    )
    .filter((payload) => payload && payload !== "[DONE]");

  const parsed = events
    .map((payload) => {
      try {
        return JSON.parse(payload) as Json;
      } catch {
        return null;
      }
    })
    .filter((payload): payload is Json => payload !== null);

  for (let i = parsed.length - 1; i >= 0; i -= 1) {
    const item = parsed[i];
    if (isObject(item) && Array.isArray(item.choices)) {
      const first = item.choices[0];
      if (isObject(first) && isObject(first.message)) return item;
    }
  }

  if (parsed.length === 0) return {};

  let content = "";
  const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();
  let usage: Record<string, unknown> = {};
  let id = "";
  let model = "";

  for (const item of parsed) {
    if (!isObject(item)) continue;
    if (!id) id = asString(item.id);
    if (!model) model = asString(item.model);
    if (isObject(item.usage)) usage = item.usage;

    const choice0 = Array.isArray(item.choices) ? item.choices[0] : null;
    if (!isObject(choice0)) continue;
    const delta = isObject(choice0.delta)
      ? choice0.delta
      : isObject(choice0.message)
        ? choice0.message
        : {};

    if (typeof delta.content === "string") content += delta.content;

    for (const rawCall of asArray(delta.tool_calls)) {
      const obj = isObject(rawCall) ? rawCall : {};
      const idx = typeof obj.index === "number" ? obj.index : 0;
      const fn = isObject(obj.function) ? obj.function : {};
      const current = toolCalls.get(idx) ?? { id: "", name: "", arguments: "" };
      current.id = current.id || asString(obj.id);
      current.name = current.name || asString(fn.name);
      current.arguments += asString(fn.arguments);
      toolCalls.set(idx, current);
    }
  }

  return {
    id,
    model,
    usage,
    choices: [
      {
        message: {
          content,
          tool_calls: [...toolCalls.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, call]) => ({
              id: call.id,
              type: "function",
              function: {
                name: call.name,
                arguments: call.arguments,
              },
            })),
        },
      },
    ],
  };
}

async function readJsonishResponse(res: Response): Promise<Json> {
  const raw = await res.text();
  return parseJsonishText(raw);
}

export type OmegaTool = {
  type: "function";
  function: { name: string; description: string; parameters: object };
};
export type OmegaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type?: string;
    function: { name: string; arguments: string };
  }>;
};
export type OmegaUsage = { input_tokens: number; output_tokens: number };
export type OmegaToolCall = { id: string; name: string; args: Record<string, unknown> };
export type OmegaResult = {
  text: string;
  toolCalls: OmegaToolCall[];
  usage: OmegaUsage;
  raw: unknown;
};

export type LooseSupabase = SupabaseClient<any, any, any>;

// Resolves the key: env override first (for cron/server), else the owner-stored Vault secret.
export async function resolveOmegaKey(supabase: LooseSupabase): Promise<string | null> {
  const envKey = (process.env.OMEGA_API_KEY || "").trim();
  if (envKey) return envKey;
  try {
    const { data } = (await supabase.rpc("get_omega_key")) as { data: unknown };
    const k = typeof data === "string" ? data : null;
    return k && k.trim() ? k.trim() : null;
  } catch {
    return null;
  }
}

// Simple exponential backoff for transient 429/5xx from the gateway.
async function fetchWithBackoff(url: string, init: RequestInit, maxAttempts = 3): Promise<Response> {
  let attempt = 0;
  let lastErr: unknown = null;
  while (attempt < maxAttempts) {
    try {
      const res = await fetch(url, init);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 250 * Math.pow(2, attempt)));
        attempt++;
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 250 * Math.pow(2, attempt)));
      attempt++;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("fetch failed");
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

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 1500,
    stream: false,
  };
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = "auto";
  }

  const res = await fetchWithBackoff(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Omega ${res.status}: ${t.slice(0, 400)}`);
  }
  const data: unknown = await readJsonishResponse(res);
  const root = isObject(data) ? data : {};
  const choice0 = Array.isArray(root.choices) ? root.choices[0] : undefined;
  const msg = isObject(choice0) && isObject(choice0.message) ? choice0.message : {};
  const text = typeof msg.content === "string" ? msg.content : "";
  const toolCalls: OmegaToolCall[] = asArray(msg.tool_calls).map((tc) => {
    const obj = isObject(tc) ? tc : {};
    const fn = isObject(obj.function) ? obj.function : {};
    return {
      id: asString(obj.id),
      name: asString(fn.name),
      args: (safeJson(fn.arguments) as Record<string, unknown>) ?? {},
    };
  });
  const u = isObject(root.usage) ? root.usage : {};
  const usage: OmegaUsage = {
    input_tokens: typeof u.prompt_tokens === "number"
      ? u.prompt_tokens
      : typeof u.input_tokens === "number" ? u.input_tokens : 0,
    output_tokens: typeof u.completion_tokens === "number"
      ? u.completion_tokens
      : typeof u.output_tokens === "number" ? u.output_tokens : 0,
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
  const data: unknown = await readJsonishResponse(res);
  const root = isObject(data) ? data : {};
  const arr = Array.isArray(root.data) ? root.data : Array.isArray(root.models) ? root.models : [];
  return arr
    .map((m) => {
      if (isObject(m)) return asString(m.id ?? m.name);
      return "";
    })
    .filter(Boolean);
}
