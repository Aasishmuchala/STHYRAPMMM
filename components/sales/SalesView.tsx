"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { beginToast, finishToast } from "@/lib/client-toast";
import { setSalesTarget, upsertSalesActivity, createDeal, updateDealStage, deleteDeal } from "@/app/sales/actions";

export type Deal = {
  id: string;
  title: string;
  company_name: string | null;
  segment: "real_estate" | "smb" | "d2c" | "other";
  stage: "lead" | "contacted" | "meeting" | "proposal" | "won" | "lost";
  value_paise: number;
  expected_close: string | null;
  closed_at: string | null;
  owner_name?: string | null;
};
export type SalesTarget = {
  revenue_target_paise: number;
  deals_target: number;
  calls_target_daily: number;
  emails_target_daily: number;
  meetings_target_month: number;
};
export type Activity = { calls: number; emails: number; meetings: number; notes: string | null };

const STAGES: { key: Deal["stage"]; label: string }[] = [
  { key: "lead", label: "Lead" },
  { key: "contacted", label: "Contacted" },
  { key: "meeting", label: "Meeting" },
  { key: "proposal", label: "Proposal" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];
const SEGMENTS: { key: Deal["segment"]; label: string }[] = [
  { key: "real_estate", label: "Real Estate" },
  { key: "smb", label: "SMB" },
  { key: "d2c", label: "D2C" },
  { key: "other", label: "Other" },
];

const rupees = (paise: number) => "₹" + Math.round(paise / 100).toLocaleString("en-IN");
const pct = (num: number, den: number) => (den > 0 ? Math.min(100, Math.round((num / den) * 100)) : 0);

export function SalesView({
  divisionId,
  isManager,
  deals,
  target,
  myActivity,
  teamCallsToday,
  monthIso,
}: {
  divisionId: string;
  isManager: boolean;
  deals: Deal[];
  target: SalesTarget | null;
  myActivity: Activity | null;
  teamCallsToday: number;
  monthIso: string;
}) {
  const router = useRouter();
  const thisMonth = monthIso.slice(0, 7);

  // ── Derived KPIs ──────────────────────────────────────────────────────────
  const wonMonth = deals.filter((d) => d.stage === "won" && (d.closed_at ?? "").slice(0, 7) === thisMonth);
  const revenueWon = wonMonth.reduce((s, d) => s + d.value_paise, 0);
  const dealsWon = wonMonth.length;
  const openDeals = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
  const pipelineValue = openDeals.reduce((s, d) => s + d.value_paise, 0);

  // ── Add-deal form ─────────────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [segment, setSegment] = useState<Deal["segment"]>("smb");
  const [value, setValue] = useState("");
  const [expected, setExpected] = useState("");
  const [busy, setBusy] = useState(false);

  async function addDeal() {
    if (!title.trim()) return;
    setBusy(true);
    const toastId = beginToast("Adding deal…");
    const res = await createDeal(divisionId, { title, company, segment, valueRupees: Number(value), expectedClose: expected || null });
    setBusy(false);
    if (!finishToast(res, { id: toastId, success: "Deal added." })) return;
    setTitle(""); setCompany(""); setValue(""); setExpected("");
    router.refresh();
  }
  async function moveDeal(id: string, stage: string) {
    const toastId = beginToast("Updating…");
    const res = await updateDealStage(id, stage);
    if (!finishToast(res, { id: toastId, success: "Deal updated." })) return;
    router.refresh();
  }
  async function removeDeal(id: string) {
    const toastId = beginToast("Removing…");
    const res = await deleteDeal(id);
    if (!finishToast(res, { id: toastId, success: "Deal removed." })) return;
    router.refresh();
  }

  // ── Activity log ──────────────────────────────────────────────────────────
  const [calls, setCalls] = useState(String(myActivity?.calls ?? 0));
  const [emails, setEmails] = useState(String(myActivity?.emails ?? 0));
  const [meetings, setMeetings] = useState(String(myActivity?.meetings ?? 0));
  const [savingAct, setSavingAct] = useState(false);
  async function saveActivity() {
    setSavingAct(true);
    const toastId = beginToast("Saving today's activity…");
    const res = await upsertSalesActivity(divisionId, monthIso, { calls: Number(calls), emails: Number(emails), meetings: Number(meetings) });
    setSavingAct(false);
    if (!finishToast(res, { id: toastId, success: "Activity saved." })) return;
    router.refresh();
  }

  // ── Targets modal (managers) ──────────────────────────────────────────────
  const [showTarget, setShowTarget] = useState(false);
  const [tRevenue, setTRevenue] = useState(String(target ? target.revenue_target_paise / 100 : ""));
  const [tDeals, setTDeals] = useState(String(target?.deals_target ?? ""));
  const [tCalls, setTCalls] = useState(String(target?.calls_target_daily ?? ""));
  const [tEmails, setTEmails] = useState(String(target?.emails_target_daily ?? ""));
  const [tMeet, setTMeet] = useState(String(target?.meetings_target_month ?? ""));
  const [savingT, setSavingT] = useState(false);
  async function saveTarget() {
    setSavingT(true);
    const toastId = beginToast("Saving targets…");
    const res = await setSalesTarget(divisionId, monthIso, {
      revenueRupees: Number(tRevenue), deals: Number(tDeals), callsDaily: Number(tCalls), emailsDaily: Number(tEmails), meetingsMonth: Number(tMeet),
    });
    setSavingT(false);
    if (!finishToast(res, { id: toastId, success: "Targets saved." })) return;
    setShowTarget(false);
    router.refresh();
  }

  const kpis = [
    { label: "Revenue won (this month)", value: rupees(revenueWon), accent: "var(--accent)" },
    { label: "Deals won (this month)", value: String(dealsWon), accent: "#16a34a" },
    { label: "Open pipeline value", value: rupees(pipelineValue), accent: "#f59e0b" },
    { label: "Team calls today", value: String(teamCallsToday), accent: "#7c4dff" },
  ];

  return (
    <>
      {/* KPI cards */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 18 }}>
        {kpis.map((k) => (
          <div key={k.label} className="glass" style={{ padding: 16, borderRadius: 16 }}>
            <div className="sub" style={{ marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: k.accent }}>{k.value}</div>
          </div>
        ))}
      </section>

      {/* Targets progress */}
      <section className="glass" style={{ padding: 20, borderRadius: 16, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>This month&apos;s targets</h3>
          {isManager && <button className="btn" onClick={() => setShowTarget(true)}>{target ? "Edit targets" : "Set targets"}</button>}
        </div>
        {target ? (
          <div style={{ display: "grid", gap: 14 }}>
            <Progress label="Revenue" now={rupees(revenueWon)} goal={rupees(target.revenue_target_paise)} pct={pct(revenueWon, target.revenue_target_paise)} />
            <Progress label="Deals closed" now={String(dealsWon)} goal={String(target.deals_target)} pct={pct(dealsWon, target.deals_target)} />
            <div className="sub">
              Daily target: {target.calls_target_daily} calls · {target.emails_target_daily} emails · {target.meetings_target_month} meetings/mo
            </div>
          </div>
        ) : (
          <p className="sub" style={{ margin: 0 }}>No targets set for this month{isManager ? " — set them above." : "."}</p>
        )}
      </section>

      {/* My activity today */}
      <section className="glass" style={{ padding: 20, borderRadius: 16, marginBottom: 18 }}>
        <h3 style={{ marginTop: 0, marginBottom: 4 }}>My outreach today</h3>
        <p className="sub" style={{ marginTop: 0 }}>Log your calls, emails and meetings for today.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <ActField label={`Calls${target ? ` / ${target.calls_target_daily}` : ""}`} value={calls} onChange={setCalls} />
          <ActField label={`Emails${target ? ` / ${target.emails_target_daily}` : ""}`} value={emails} onChange={setEmails} />
          <ActField label="Meetings" value={meetings} onChange={setMeetings} />
          <button className="btn btn-primary" onClick={saveActivity} disabled={savingAct}>{savingAct ? "Saving…" : "Save today"}</button>
        </div>
      </section>

      {/* Segment funnel */}
      <section className="glass" style={{ padding: 20, borderRadius: 16, marginBottom: 18 }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Funnel by segment</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th className="sub" style={{ padding: "6px 8px" }}>Segment</th>
                {STAGES.map((s) => <th key={s.key} className="sub" style={{ padding: "6px 8px" }}>{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {SEGMENTS.map((seg) => (
                <tr key={seg.key} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{seg.label}</td>
                  {STAGES.map((s) => {
                    const n = deals.filter((d) => d.segment === seg.key && d.stage === s.key).length;
                    return <td key={s.key} style={{ padding: "8px", color: n ? "var(--text)" : "var(--text-dim)" }}>{n}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add deal */}
      <section className="glass" style={{ padding: 20, borderRadius: 16, marginBottom: 18 }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Add a deal</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, alignItems: "end" }}>
          <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Website revamp" /></Field>
          <Field label="Company / contact"><input className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Corp" /></Field>
          <Field label="Segment">
            <select className="select" value={segment} onChange={(e) => setSegment(e.target.value as Deal["segment"])}>
              {SEGMENTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Value (₹)"><input className="input" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder="500000" /></Field>
          <Field label="Expected close"><input className="input" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} /></Field>
          <button className="btn btn-primary" onClick={addDeal} disabled={busy}>{busy ? "Adding…" : "Add deal"}</button>
        </div>
      </section>

      {/* Deals list */}
      <section className="glass" style={{ padding: 20, borderRadius: 16 }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Deals</h3>
        {deals.length === 0 ? (
          <p className="sub">No deals yet. Add one above to start your pipeline.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th className="sub" style={{ padding: "6px 8px" }}>Deal</th>
                  <th className="sub" style={{ padding: "6px 8px" }}>Segment</th>
                  <th className="sub" style={{ padding: "6px 8px" }}>Value</th>
                  {isManager && <th className="sub" style={{ padding: "6px 8px" }}>Owner</th>}
                  <th className="sub" style={{ padding: "6px 8px" }}>Stage</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={{ padding: "8px", fontWeight: 600 }}>{d.title}<div className="re">{d.company_name ?? ""}</div></td>
                    <td style={{ padding: "8px" }} className="sub">{SEGMENTS.find((s) => s.key === d.segment)?.label}</td>
                    <td style={{ padding: "8px" }}>{rupees(d.value_paise)}</td>
                    {isManager && <td style={{ padding: "8px" }} className="sub">{d.owner_name ?? "—"}</td>}
                    <td style={{ padding: "8px" }}>
                      <select className="select" value={d.stage} onChange={(e) => moveDeal(d.id, e.target.value)} style={{ width: 130 }}>
                        {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "8px", textAlign: "right" }}>
                      <button className="btn" onClick={() => removeDeal(d.id)} style={{ color: "var(--danger)" }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showTarget && (
        <div role="dialog" aria-modal="true" onClick={() => setShowTarget(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.55)", backdropFilter: "blur(2px)", display: "grid", placeItems: "center", zIndex: 200, padding: 20 }}>
          <div className="glass" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, padding: 24, borderRadius: 16 }}>
            <h3 style={{ marginTop: 0 }}>Targets for this month</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Revenue (₹)"><input className="input" inputMode="numeric" value={tRevenue} onChange={(e) => setTRevenue(e.target.value)} placeholder="15000000" /></Field>
              <Field label="Deals to close"><input className="input" inputMode="numeric" value={tDeals} onChange={(e) => setTDeals(e.target.value)} placeholder="7" /></Field>
              <Field label="Calls / day"><input className="input" inputMode="numeric" value={tCalls} onChange={(e) => setTCalls(e.target.value)} placeholder="25" /></Field>
              <Field label="Emails / day"><input className="input" inputMode="numeric" value={tEmails} onChange={(e) => setTEmails(e.target.value)} placeholder="100" /></Field>
              <Field label="Meetings / month"><input className="input" inputMode="numeric" value={tMeet} onChange={(e) => setTMeet(e.target.value)} placeholder="20" /></Field>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
              <button className="btn" onClick={() => setShowTarget(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveTarget} disabled={savingT}>{savingT ? "Saving…" : "Save targets"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Progress({ label, now, goal, pct }: { label: string; now: string; goal: string; pct: number }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span className="sub">{now} / {goal} · {pct}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 6, background: "var(--line)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)", borderRadius: 6 }} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field" style={{ margin: 0 }}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function ActField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field" style={{ margin: 0, width: 130 }}>
      <label className="label">{label}</label>
      <input className="input" inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
