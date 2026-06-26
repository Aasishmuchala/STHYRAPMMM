import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import { ClientsView } from "@/components/clients/ClientsView";
import { initials } from "@/lib/format";
import type { DivisionOpt } from "@/lib/tasks-types";
import type { Client } from "@/lib/clients-types";

type Div = { name: string; slug: string } | null;
type Row = Omit<Client, "division_name" | "division_slug"> & { divisions: Div };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ div?: string; new?: string }> }) {
  const sp = await searchParams;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as unknown as SupabaseClient<any, any, any>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: memberships }, { data: divisions }, { data: rows }] = await Promise.all([
    supabase.from("profiles").select("full_name,email,global_role").eq("id", user.id).maybeSingle(),
    supabase.from("division_members").select("role").eq("user_id", user.id),
    supabase.from("divisions").select("id,slug,name").order("slug"),
    supabase.from("clients").select("id,division_id,name,contact_name,email,phone,stage,value_paise,note,divisions(name,slug)").is("deleted_at", null).order("value_paise", { ascending: false }).returns<Row[]>(),
  ]);

  const isOwner = profile?.global_role === "owner";
  const canSeeFinances = isOwner || (memberships ?? []).some((m) => m.role === "lead");
  if (!canSeeFinances) redirect("/");

  const clients: Client[] = (rows ?? []).map((r) => ({
    ...r, division_name: r.divisions?.name ?? "", division_slug: r.divisions?.slug ?? "",
  }));
  const divs: DivisionOpt[] = (divisions ?? []).map((d: DivisionOpt) => ({ id: d.id, slug: d.slug, name: d.name }));

  return (
    <AppShell
      divisions={divs.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))}
      canSeeFinances={canSeeFinances}
      isOwner={isOwner}
      initials={initials(profile?.full_name ?? null, profile?.email ?? null)}
    >
      <main>
        <header className="subhead">
          <div>
            <div className="label" style={{ marginBottom: 9 }}>Clients</div>
            <h1>Pipeline</h1>
            <p className="head-sub">Your clients and leads, from first contact to won. Move a card to update its stage.</p>
          </div>
        </header>
        <ClientsView clients={clients} divisions={divs} initialDivision={divs.find((d) => d.slug === sp.div)?.slug} openNew={sp.new === "1"} />
      </main>
    </AppShell>
  );
}
