import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { DocumentsView } from "@/components/documents/DocumentsView";
import { buildWorkspaceAccess } from "@/lib/access";
import { initials } from "@/lib/format";
import { getWorkspaceContext, loadShellUserSummaryCached } from "@/lib/workspaceContext";
import type { DivisionOpt } from "@/lib/tasks-types";
import type { Doc } from "@/lib/doc-types";

type Div = { name: string; slug: string } | null;
type DocRow = Omit<Doc, "division_name" | "division_slug"> & { divisions: Div };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ div?: string }> }) {
  const sp = await searchParams;
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");
  const supabase = ctx.supabase;
  const profile = ctx.profile;

  const { data: docRows } = await supabase
    .from("documents")
    // TODO: strip body_md once DocReader is wired to lazy-fetch on open.
    // The reader still consumes the body straight off the list payload.
    .select("id,title,doc_type,status,body_md,storage_path,updated_at,division_id,divisions(name,slug)")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(2000)
    .returns<DocRow[]>();

  const access = buildWorkspaceAccess(profile?.global_role, ctx.memberships);

  const documents: Doc[] = (docRows ?? []).map((d) => ({
    ...d,
    division_name: d.divisions?.name ?? "",
    division_slug: d.divisions?.slug ?? "",
  })).filter((doc) => access.isSuperAdmin || access.workspaceDivisionIds.has(doc.division_id));
  const divs: DivisionOpt[] = ctx.divisions
    .map((d: DivisionOpt) => ({ id: d.id, slug: d.slug, name: d.name }))
    .filter((division) => access.isSuperAdmin || access.workspaceDivisionIds.has(division.id) || access.financeDivisionIds.has(division.id));
  const shellUser = await loadShellUserSummaryCached({
    profile,
    memberships: ctx.memberships,
    accessibleDivisions: divs,
    canPickAll: access.isSuperAdmin,
  });

  return (
    <AppShell divisions={divs.map((d) => ({ slug: d.slug, name: d.name.replace(/^Sthyra\s+/, "") }))} canSeeFinances={access.canSeeFinances} canSeePeople={access.canSeePeople} isOwner={access.isSuperAdmin} initials={initials(profile?.full_name ?? null, profile?.email ?? null)} userName={shellUser.userName} userRoleLabel={shellUser.userRoleLabel}>
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
