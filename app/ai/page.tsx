import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import { AiConsole, type Run, type Pending } from "@/components/ai/AiConsole";
import { initials } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AiPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as unknown as SupabaseClient<any, any, any>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("full_name,email,global_role").eq("id", user.id).maybeSingle();
  const isOwner = profile?.global_role === "owner";
  // The assistant reads the Vault key, which only the owner can decrypt. Keep it owner-scoped.
  if (!isOwner) redirect("/");

  const now = new Date();
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const todayStr = now.toISOString().slice(0, 10);

  const [
    { data: memberships },
    { data: divisions },
    { data: runRows },
    { data: pendingRows },
    { data: monthRows },
    { data: keyStatus },
  ] = await Promise.all([
    supabase.from("division_members").select("role"),
    supabase.from("divisions").select("id,slug,name").order("slug"),
    supabase.from("ai_runs").select("id,purpose,model,input_tokens,output_tokens,cost_inr,prompt,response,actions,status,error,created_at").order("created_at", { ascending: false }).limit(50).returns<Run[]>(),
    supabase.from("ai_pending_actions").select("id,kind,summary,payload,status,created_at").eq("status", "pending").order("created_at", { ascending: false }).returns<Pending[]>(),
    supabase.from("ai_runs").select("cost_inr,created_at").gte("created_at", monthStart),
    supabase.rpc("omega_key_status"),
  ]);

  const canSeeFinances = isOwner || (memberships ?? []).some((m) => m.role === "lead");

  const month = (monthRows ?? []) as { cost_inr: number; created_at: string }[];
  const spendMonth = month.reduce((s, r) => s + Number(r.cost_inr || 0), 0);
  const spendToday = month.filter((r) => (r.created_at || "").slice(0, 10) === todayStr).reduce((s, r) => s + Number(r.cost_inr || 0), 0);

  const runs = (runRows ?? []) as Run[];
  const latestBrief = runs.find((r) => r.purpose === "digest") ?? null;
  const configured = Boolean((keyStatus as { configured?: boolean } | null)?.configured);

  return (
    <AppShell
      divisions={(divisions ?? []).map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))}
      canSeeFinances={canSeeFinances}
      isOwner={isOwner}
      initials={initials(profile?.full_name ?? null, profile?.email ?? null)}
    >
      <main>
        <header className="subhead">
          <div>
            <div className="label" style={{ marginBottom: 9 }}>Assistant</div>
            <h1>AI Command</h1>
            <p className="head-sub">Ask anything about your business, get a morning brief, and let it draft tasks and notes — every rupee it spends is logged.</p>
          </div>
        </header>
        <AiConsole
          configured={configured}
          isOwner={isOwner}
          runs={runs}
          pending={(pendingRows ?? []) as Pending[]}
          latestBrief={latestBrief}
          spendToday={spendToday}
          spendMonth={spendMonth}
          runCount={month.length}
        />
      </main>
    </AppShell>
  );
}
