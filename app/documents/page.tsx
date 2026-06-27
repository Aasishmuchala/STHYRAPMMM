import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/shell/AppShell";
import { DocumentsView } from "@/components/documents/DocumentsView";
import { buildWorkspaceAccess } from "@/lib/access";
import { initials } from "@/lib/format";
import type { DivisionOpt } from "@/lib/tasks-types";
import type { Doc } from "@/lib/doc-types";

type Div = { name: string; slug: string } | null;
type DocRow = Omit<Doc, "division_name" | "division_slug"> & { divisions: Div };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ div?: string }> }) {
  const sp = await searchParams;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as unknown as SupabaseClient<any, any, any>;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: memberships }, { data: divisions }, { data: docRows }] = await Promise.all([
    supabase.from("profiles").select("full_name,email,global_role").eq("id", user.id).maybeSingle(),
    supabase.from("division_members").select("role,division_id").eq("user_id", user.id),
    supabase.from("divisions").select("id,slug,name").order("slug"),
    supabase.from("documents").select("id,title,doc_type,status,body_md,storage_path,updated_at,division_id,divisions(name,slug)").is("deleted_at", null).order("updated_at", { ascending: false }).returns<DocRow[]>(),
  ]);

  const membershipRows = (memberships ?? []) as { role: string; division_id: string }[];
  const access = buildWorkspaceAccess(profile?.global_role, membershipRows);

  const documents: Doc[] = (docRows ?? []).map((d) => ({
    ...d,
    division_name: d.divisions?.name ?? "",
    division_slug: d.divisions?.slug ?? "",
  })).filter((doc) => access.isSuperAdmin || access.workspaceDivisionIds.has(doc.division_id));
  const divs: DivisionOpt[] = (divisions ?? [])
    .map((d: DivisionOpt) => ({ id: d.id, slug: d.slug, name: d.name }))
    .filter((division) => access.isSuperAdmin || access.workspaceDivisionIds.has(division.id) || access.financeDivisionIds.has(division.id));

  return (
    <AppShell divisions={divs.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))} canSeeFinances={access.canSeeFinances} canSeePeople={access.canSeePeople} isOwner={access.isSuperAdmin} initials={initials(profile?.full_name ?? null, profile?.email ?? null)}>
      <main>
          <header className="subhead">
            <div>
              <div className="label" style={{ marginBottom: 9 }}>Documents</div>
              <h1>Library</h1>
              <p className="head-sub">Notes, files, and links — organised by division. Click any document to read it.</p>
            </div>
          </header>
          <DocumentsView documents={documents} divisions={divs} initialDivision={divs.find((d) => d.slug === sp.div)?.slug} />
        </main>
    </AppShell>
  );
}
