import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getDashboard } from "@/lib/queries";
import { inrShort, pct, dueLabel, initials } from "@/lib/format";
import { AppShell } from "@/components/shell/AppShell";
import { GettingStarted } from "@/components/home/GettingStarted";
import { QuickNew } from "@/components/home/QuickNew";
import {
  IconArrowUpRight, IconArrowDownRight, IconClock,
  IconAlertCircle, IconDoc, IconTasks,
} from "@/components/icons";

const prioColor: Record<string, string> = {
  highest: "#f87171",
  high: "var(--danger)",
  medium: "var(--warning)",
  low: "#3b82f6",
  lowest: "var(--text-faint)",
};

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = new Date();
  const d = await getDashboard(supabase, today, user.id);

  // Onboarding signals (owner only) for the "Get set up" guide.
  let setup: { ai: boolean; clients: boolean; team: boolean; briefs: boolean } | null = null;
  if (d.isOwner) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as unknown as SupabaseClient<any, any, any>;
    const [{ data: ks }, { count: cc }, { count: mc }, { count: bc }] = await Promise.all([
      sb.rpc("omega_key_status"),
      sb.from("clients").select("id", { count: "exact", head: true }).is("deleted_at", null),
      sb.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
      sb.from("division_briefs").select("division_id", { count: "exact", head: true }),
    ]);
    setup = {
      ai: Boolean((ks as { configured?: boolean } | null)?.configured),
      clients: (cc ?? 0) > 0,
      team: (mc ?? 0) > 1,
      briefs: (bc ?? 0) > 0,
    };
  }

  const dateLabel = today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const firstName = (d.profile?.full_name ?? "there").split(" ")[0];
  const hour = today.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <AppShell divisions={d.navDivisions} canSeeFinances={d.canSeeFinances} isOwner={d.isOwner} initials={initials(d.profile?.full_name ?? null, d.profile?.email ?? null)}>
      <main>
          <header className="page-head">
            <div>
              <div className="label" style={{ marginBottom: 9 }}>{dateLabel}</div>
              <h1>{greeting}, {firstName}</h1>
              <p className="head-sub">Your whole business at a glance — money, work, and what needs you today.</p>
            </div>
            <QuickNew canSeeFinances={d.canSeeFinances} />
          </header>

          {setup && <GettingStarted aiConnected={setup.ai} hasClients={setup.clients} hasTeam={setup.team} hasBriefs={setup.briefs} canSeeFinances={d.canSeeFinances} />}

          {/* Plain-language finances (owner / leads only) */}
          {d.canSeeFinances ? (
            <section className="fin" aria-label="Finances across your divisions">
              <div className="cell">
                <div className="label">Money in · MTD</div>
                <div className="v mono">{inrShort(d.finance.moneyIn)}</div>
                <div className="d up"><IconArrowUpRight size={12} />{d.navDivisions.length} divisions</div>
              </div>
              <div className="cell">
                <div className="label">Money out · MTD</div>
                <div className="v mono">{inrShort(d.finance.moneyOut)}</div>
                <div className="d warn"><IconArrowDownRight size={12} />costs + BOM</div>
              </div>
              <div className="cell">
                <div className="label">Owed to us</div>
                <div className="v mono">{inrShort(d.finance.owed)}</div>
                <div className={`d ${d.finance.overdueCount ? "down" : "dim"}`}>
                  <IconClock size={12} />{d.finance.overdueCount} invoice{d.finance.overdueCount === 1 ? "" : "s"} overdue
                </div>
              </div>
              <div className="cell">
                <div className="label">Blended margin</div>
                <div className="v mono">{pct(d.finance.margin)}</div>
                <div className="d dim">services-band</div>
              </div>
            </section>
          ) : null}

          <div className="cols">
            {/* LEFT */}
            <div>
              <div className="section-h">
                <span className="label">Division health</span>
                {d.canSeeFinances && <button className="link">Open finances →</button>}
              </div>
              <div className="divs">
                {d.divisionHealth.map((dv) => (
                  <div className="dcard glass" key={dv.slug}>
                    <div className="row1">
                      <span className="dn">{dv.name}</span>
                      <span className="tag">{dv.activeProjects} active</span>
                    </div>
                    <div className="big mono">{dv.canSeeFinances ? inrShort(dv.revenuePaise) : `${dv.openTasks} open`}</div>
                    <div className="barwrap"><div className="bar" style={{ width: `${dv.canSeeFinances ? dv.bar : Math.min(100, dv.openTasks * 20)}%` }} /></div>
                    <div className="foot">
                      <span>{dv.activeProjects} projects · {dv.openTasks} open tasks</span>
                      {dv.canSeeFinances && <span className="mono up">rev MTD</span>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="section-h">
                <span className="label">My tasks · across divisions</span>
                <button className="link">Board →</button>
              </div>
              {d.myTasks.length > 0 ? (
                <div className="tasks glass">
                  {d.myTasks.map((t) => (
                    <div className="task" key={t.id}>
                      <span className="prio" style={{ background: prioColor[t.priority] }} />
                      <span className="check" role="checkbox" aria-checked="false" aria-label={`Complete: ${t.title}`} />
                      <span className="t">{t.title}</span>
                      <span className="divtag">{t.division}</span>
                      <span className="due">{dueLabel(t.due, today)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={<IconTasks size={20} />} text="No open tasks. You're all clear." />
              )}
            </div>

            {/* RIGHT */}
            <div>
              {d.canSeeFinances && d.attention.length > 0 && (
                <>
                  <div className="section-h"><span className="label">Needs attention</span></div>
                  <div className="tasks glass" style={{ marginBottom: 22 }}>
                    {d.attention.map((a, i) => (
                      <div className="task" key={i}>
                        <IconAlertCircle size={16} style={{ color: "var(--danger)" }} />
                        <span className="t">{a.title}</span>
                        <span className="due mono" style={{ color: "var(--danger)" }}>{inrShort(a.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="canvas-head">
                <IconDoc size={15} style={{ color: "var(--bronze)" }} />
                <span className="label">Document · paper canvas</span>
              </div>
              {d.doc ? (
                <article className="paper">
                  <div className="doctag">{d.doc.division} {d.doc.docType ? `/ ${d.doc.docType}` : ""}</div>
                  <h2>{d.doc.title}</h2>
                  <hr />
                  {d.doc.body.split("\n\n").map((para, i) => (
                    <p key={i} className={i === 0 ? "lead" : ""}>{para}</p>
                  ))}
                </article>
              ) : (
                <EmptyState icon={<IconDoc size={20} />} text="No active documents yet." />
              )}
            </div>
          </div>
      </main>
    </AppShell>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="glass" style={{ borderRadius: 13, padding: "30px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: "var(--text-dim)" }}>
      <span style={{ opacity: 0.6 }}>{icon}</span>
      <span style={{ fontSize: 13 }}>{text}</span>
    </div>
  );
}
