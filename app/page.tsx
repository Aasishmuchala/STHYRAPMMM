import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDashboard } from "@/lib/queries";
import { inrShort, pct, initials } from "@/lib/format";
import { isCompanyEmail } from "@/lib/auth/companyEmail";
import { AppShell } from "@/components/shell/AppShell";
import { StatCard, sparkSeries } from "@/components/ui";
import { GettingStarted } from "@/components/home/GettingStarted";
import { HomeAiCard } from "@/components/home/HomeAiCard";
import { QuickNew } from "@/components/home/QuickNew";
import { loadAiConsoleData } from "@/lib/ai/loadAiConsoleData";
import {
  IconStudios, IconDigital, IconConstruction, IconLivingTwin, IconLayers,
} from "@/components/icons";

import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";

// Division icon + accent by slug (falls back for unknown slugs).
const DIV_ICON: Record<string, (p: { size?: number }) => React.ReactElement> = {
  studios: IconStudios,
  digital: IconDigital,
  construction: IconConstruction,
  construction_management: IconConstruction,
  living_twin: IconLivingTwin,
};
const DIV_COLORS = ["#2563eb", "#f97316", "#8b5cf6", "#14b8a6", "#ec4899", "#22c55e", "#6366f1", "#0ea5e9"];

// KPI glyphs (ref image 1) — inline so they match the reference exactly.
function IconMoneyIn({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v10m0 0l-4-4m4 4l4-4" /><path d="M4 15v4a1 1 0 001 1h14a1 1 0 001-1v-4" /></svg>;
}
function IconMoneyOut({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M12 13V3m0 0l-4 4m4-4l4 4" /><path d="M4 15v4a1 1 0 001 1h14a1 1 0 001-1v-4" /></svg>;
}
function IconOwed({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h6M9 16h6" /></svg>;
}
function IconMargin({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M19 5L5 19" /><circle cx="7.5" cy="7.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" /></svg>;
}

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isCompanyEmail(user.email)) redirect("/login?error=company-email-only");

  const today = new Date();
  const sb = supabase as unknown as DB;
  const [d, aiData] = await Promise.all([
    getDashboard(supabase, today, user.id),
    loadAiConsoleData(sb),
  ]);

  // Onboarding signals (owner only) for the "Get set up" guide.
  let setup: { ai: boolean; clients: boolean; team: boolean; briefs: boolean } | null = null;
  if (d.isOwner) {
    const [{ count: cc }, { count: mc }, { count: bc }] = await Promise.all([
      sb.from("clients").select("id", { count: "exact", head: true }).is("deleted_at", null),
      sb.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
      sb.from("division_briefs").select("division_id", { count: "exact", head: true }),
    ]);
    setup = { ai: aiData.configured, clients: (cc ?? 0) > 0, team: (mc ?? 0) > 1, briefs: (bc ?? 0) > 0 };
  }

  const dateLabel = today.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const firstName = (d.profile?.full_name ?? "there").split(" ")[0];
  const hour = today.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const kpis = [
    { label: "Money in · MTD", value: inrShort(d.finance.moneyIn), color: "var(--positive)", icon: <IconMoneyIn />, delta: `${d.navDivisions.length} divisions`, trend: "up" as const, seed: 3 },
    { label: "Money out · MTD", value: inrShort(d.finance.moneyOut), color: "var(--cta)", icon: <IconMoneyOut />, delta: "costs + BOM", trend: "flat" as const, seed: 7 },
    { label: "Owed to us", value: inrShort(d.finance.owed), color: "var(--accent)", icon: <IconOwed />, delta: `${d.finance.overdueCount} invoices overdue`, trend: d.finance.overdueCount ? ("down" as const) : ("flat" as const), seed: 5 },
    { label: "Blended margin", value: pct(d.finance.margin), color: "#8b5cf6", icon: <IconMargin />, delta: "services + band", trend: "flat" as const, seed: 9 },
  ];

  return (
    <AppShell
      divisions={d.navDivisions}
      canSeeFinances={d.canSeeFinances}
      isOwner={d.isOwner}
      initials={initials(d.profile?.full_name ?? null, d.profile?.email ?? null)}
      aiInitialData={{
        configured: aiData.configured,
        isOwner: d.isOwner,
        runs: aiData.runs,
        pending: aiData.pending,
        latestBrief: aiData.latestBrief,
        spendToday: aiData.spendToday,
        spendMonth: aiData.spendMonth,
        runCount: aiData.runCount,
      }}
    >
      <main id="main">
        <header className="home-head">
          <div>
            <div className="home-date">{dateLabel}</div>
            <h1>{greeting}, {firstName} <span aria-hidden="true">👋</span></h1>
            <p className="head-sub">Your whole business at a glance — money, work, and what needs you today.</p>
          </div>
          <QuickNew canSeeFinances={d.canSeeFinances} />
        </header>

        {/* KPI cards with sparklines */}
        {d.canSeeFinances && (
          <section className="stat-grid" aria-label="Finances across your divisions">
            {kpis.map((k) => (
              <StatCard
                key={k.label}
                label={k.label}
                value={k.value}
                accent={k.color}
                sparkColor={k.color}
                icon={k.icon}
                delta={k.delta}
                trend={k.trend}
                spark={sparkSeries(k.seed, 14, k.trend === "down" ? 0.4 : 0.6)}
              />
            ))}
          </section>
        )}

        {/* Onboarding + AI assistant */}
        <div className="home-mid">
          {setup && (
            <GettingStarted
              aiConnected={setup.ai}
              hasClients={setup.clients}
              hasTeam={setup.team}
              hasBriefs={setup.briefs}
              canSeeFinances={d.canSeeFinances}
              firstName={firstName}
            />
          )}
          <HomeAiCard />
        </div>

        {/* Division health + Paper canvas */}
        <div className="home-bottom">
          <div>
            <div className="section-title-row">
              <span className="section-title">Division health</span>
              {d.canSeeFinances && <Link className="link" href="/finances">View all divisions →</Link>}
            </div>
            <div className="divh-grid">
              {d.divisionHealth.map((dv, i) => {
                const Icon = DIV_ICON[dv.slug] ?? IconLayers;
                const color = DIV_COLORS[i % DIV_COLORS.length] ?? "var(--accent)";
                return (
                  <div className="divh-card" key={dv.slug}>
                    <div className="divh-row">
                      <span className="divh-icon" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
                        <Icon size={18} />
                      </span>
                      <div className="divh-main">
                        <div className="divh-name">{dv.name}</div>
                        <div className="divh-value mono">{dv.canSeeFinances ? inrShort(dv.revenuePaise) : `${dv.openTasks} open`}</div>
                      </div>
                      <span className="divh-active">{dv.activeProjects} active</span>
                    </div>
                    <div className="divh-foot">
                      <span>{dv.activeProjects} projects · {dv.openTasks} open tasks</span>
                      {dv.canSeeFinances && <span className="divh-rev mono">rev MTD</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="section-title-row">
              <span className="section-title">Paper canvas</span>
              <Link className="link" href="/documents">View all documents →</Link>
            </div>
            {d.doc ? (
              <Link href="/documents" className="doc-mini panel">
                <div className="doc-mini-tag">{d.doc.division}{d.doc.docType ? ` · ${d.doc.docType}` : ""}</div>
                <div className="doc-mini-title">{d.doc.title}</div>
                <p className="doc-mini-body">{(d.doc.body.split("\n\n")[0] ?? "").slice(0, 220)}</p>
                <span className="doc-mini-open">Open document →</span>
              </Link>
            ) : (
              <div className="canvas-empty panel">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/empty-folder.png" alt="" className="canvas-empty-art" />
                <div className="canvas-empty-title">No active documents yet</div>
                <div className="canvas-empty-sub">Create or open documents to get started.</div>
                <Link href="/documents" className="btn canvas-empty-btn">Open Paper Canvas</Link>
              </div>
            )}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
