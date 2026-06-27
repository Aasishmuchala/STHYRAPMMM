"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveDivisionBrief } from "@/app/divisions/actions";
import { beginToast, finishToast } from "@/lib/client-toast";

type Brief = { goals: string | null; targets: string | null; notes: string | null } | null;

export function DivisionBriefCard({
  divisionId, divisionName, canEdit, brief,
}: {
  divisionId: string; divisionName: string; canEdit: boolean; brief: Brief;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [goals, setGoals] = useState(brief?.goals ?? "");
  const [targets, setTargets] = useState(brief?.targets ?? "");
  const [notes, setNotes] = useState(brief?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const has = Boolean(brief?.goals || brief?.targets || brief?.notes);
  if (!canEdit && !has) return null;

  async function save() {
    setBusy(true); setErr(null);
    const toastId = beginToast("Saving operating brief...");
    const r = await saveDivisionBrief(divisionId, goals, targets, notes);
    setBusy(false);
    if (!finishToast(r, { id: toastId, success: "Operating brief saved." })) { setErr(r.error); return; }
    setEditing(false);
    router.refresh();
  }

  return (
    <section className="set-card" style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h3 style={{ marginBottom: 4 }}>Operating brief</h3>
        {canEdit && !editing && <button className="btn-ghost" style={{ marginLeft: "auto", padding: "6px 12px" }} onClick={() => setEditing(true)}>{has ? "Edit" : "Add"}</button>}
      </div>
      <p className="sub">{divisionName}&apos;s goals and targets — what &ldquo;good&rdquo; looks like. The assistant measures progress against this.</p>

      {!editing ? (
        has ? (
          <div className="brief-read">
            {brief?.goals && <div className="brief-row"><span className="label">Goals</span><p>{brief.goals}</p></div>}
            {brief?.targets && <div className="brief-row"><span className="label">Targets</span><p>{brief.targets}</p></div>}
            {brief?.notes && <div className="brief-row"><span className="label">Constraints / notes</span><p>{brief.notes}</p></div>}
          </div>
        ) : (
          <p className="sub" style={{ margin: 0 }}>No brief yet. Add goals and targets so the assistant can advise against them.</p>
        )
      ) : (
        <>
          <div className="field"><label className="label" htmlFor="b-goals">Goals</label><textarea id="b-goals" className="input textarea" rows={2} value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="e.g. Win 2 retainer clients this quarter; ship the pilot dossier." /></div>
          <div className="field"><label className="label" htmlFor="b-targets">Targets (numbers)</label><textarea id="b-targets" className="input textarea" rows={2} value={targets} onChange={(e) => setTargets(e.target.value)} placeholder="e.g. ≥35% gross margin; ₹8L revenue/month; AR under 30 days." /></div>
          <div className="field"><label className="label" htmlFor="b-notes">Constraints / notes</label><textarea id="b-notes" className="input textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Cash-tight till March; don't take fixed-bid jobs over ₹20L." /></div>
          {err && <div className="form-err">{err}</div>}
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
            <button className="btn" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save brief"}</button>
          </div>
        </>
      )}
    </section>
  );
}
