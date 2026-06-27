import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { fmtDate } from "@/lib/format";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const dynamic = "force-dynamic";

function isExpired(isoTimestamp: string | null) {
  if (!isoTimestamp) return false;
  return new Date(isoTimestamp).getTime() < Date.now();
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 24) notFound();

  // Use the service role to read the share link + project — RLS would block this
  // for anonymous users, which is the whole point.
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return (
      <div className="share-error">
        <h1>Share preview unavailable</h1>
        <p>The server is not configured to show shared projects right now.</p>
      </div>
    );
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: link, error: linkErr } = await supabase
    .from("share_links")
    .select("id,project_id,expires_at,revoked_at")
    .eq("token", token)
    .maybeSingle();
  if (linkErr || !link) notFound();
  if (link.revoked_at) notFound();
  if (isExpired(link.expires_at)) notFound();

  const { data: project } = await supabase
    .from("projects")
    .select("id,name,client,description,starts_on,target_end_on,status")
    .eq("id", link.project_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) notFound();

  const { data: cycles } = await supabase
    .from("project_cycles")
    .select("id,name,starts_on,ends_on,status")
    .eq("project_id", link.project_id)
    .is("deleted_at", null)
    .order("starts_on");
  const { data: releases } = await supabase
    .from("project_releases")
    .select("id,name,target_date,status")
    .eq("project_id", link.project_id)
    .order("target_date");

  return (
    <div className="share-page">
      <header className="share-head">
        <span className="eyebrow mono">Public preview</span>
        <h1>{project.name}</h1>
        {project.client && <p className="head-sub">For {project.client}</p>}
        {project.description && <p className="share-desc">{project.description}</p>}
        <div className="share-meta">
          {project.starts_on && <span>Started {fmtDate(project.starts_on)}</span>}
          {project.target_end_on && <span>Target {fmtDate(project.target_end_on)}</span>}
          <span className="pill">{project.status}</span>
        </div>
      </header>

      <section className="glass" style={{ padding: 18, marginBottom: 14 }}>
        <h3>Releases</h3>
        {(!releases || releases.length === 0) ? (
          <p className="sub">No releases yet.</p>
        ) : (
          <ul className="share-list">
            {releases.map((r) => (
              <li key={r.id}>
                <strong>{r.name}</strong>
                <span className="mono"> · {r.target_date ?? "—"} · {r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass" style={{ padding: 18 }}>
        <h3>Cycles</h3>
        {(!cycles || cycles.length === 0) ? (
          <p className="sub">No cycles yet.</p>
        ) : (
          <ul className="share-list">
            {cycles.map((c) => (
              <li key={c.id}>
                <strong>{c.name}</strong>
                <span className="mono"> · {c.starts_on ?? "—"} → {c.ends_on ?? "—"} · {c.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="share-foot">
        <span className="eyebrow mono">Powered by Sthyra</span>
        <p className="sub">This is a read-only preview. Reach out to the project owner for full access.</p>
      </footer>
    </div>
  );
}
