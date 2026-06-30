import type { SupabaseClient } from "@supabase/supabase-js";
import type { Run, Pending } from "@/components/ai/AiConsole";
import { hasSharedOmegaKey } from "@/lib/ai/keyBridge";

export type AiConsoleData = {
  runs: Run[];
  pending: Pending[];
  latestBrief: Run | null;
  spendToday: number;
  spendMonth: number;
  runCount: number;
  configured: boolean;
};

/**
 * Server-side loader for the assistant console. Called by both the /ai full-screen
 * page and the global AiDrawerHost. Keeps the data shape consistent so a future
 * cache layer can sit here without forking logic.
 */
export async function loadAiConsoleData(supabase: SupabaseClient<any, any, any>): Promise<AiConsoleData> {
  const now = new Date();
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const todayStr = now.toISOString().slice(0, 10);

  const [runRes, pendingRes, monthRes, keyRes, sharedKeyConfigured] = await Promise.all([
    supabase
      .from("ai_runs")
      .select("id,purpose,model,input_tokens,output_tokens,cost_inr,prompt,response,actions,status,error,created_at")
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<Run[]>(),
    supabase
      .from("ai_pending_actions")
      .select("id,kind,summary,payload,status,created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .returns<Pending[]>(),
    supabase
      .from("ai_runs")
      .select("cost_inr,created_at")
      .gte("created_at", monthStart),
    supabase.rpc("omega_key_status"),
    hasSharedOmegaKey(),
  ]);

  const month = (monthRes.data ?? []) as { cost_inr: number; created_at: string }[];
  const runs = (runRes.data ?? []) as Run[];
  const configured = Boolean(process.env.OMEGA_API_KEY?.trim())
    || Boolean((keyRes.data as { configured?: boolean } | null)?.configured)
    || sharedKeyConfigured;

  return {
    runs,
    pending: (pendingRes.data ?? []) as Pending[],
    latestBrief: runs.find((r) => r.purpose === "digest") ?? null,
    spendMonth: month.reduce((s, r) => s + Number(r.cost_inr || 0), 0),
    spendToday: month.filter((r) => (r.created_at || "").slice(0, 10) === todayStr).reduce((s, r) => s + Number(r.cost_inr || 0), 0),
    runCount: month.length,
    configured,
  };
}
