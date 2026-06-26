"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { inr, inrShort } from "@/lib/format";
import type { DivisionOpt } from "@/lib/tasks-types";
import type { Client } from "@/lib/clients-types";
import { CLIENT_STAGES, OPEN_STAGES } from "@/lib/clients-types";
import { IconPlus } from "@/components/icons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { RecordModal, type Field } from "@/components/finances/RecordModal";
import { addClient, setClientStage, deleteClient } from "@/app/clients/actions";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const short = (s: string) => s.replace(/^Sthyra\s+/, "");
const stageDot: Record<string, string> = { lead: "var(--text-faint)", contacted: "var(--warning)", proposal: "var(--accent)", won: "var(--positive)", lost: "var(--danger)" };

function Trash() {
  return <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>;
}

export function ClientsView({ clients, divisions, initialDivision, openNew }: { clients: Client[]; divisions: DivisionOpt[]; initialDivision?: string; openNew?: boolean }) {
  const router = useRouter();
  const [divFilter, setDivFilter] = useState(initialDivision ?? "all");
  const [modal, setModal] = useState(Boolean(openNew));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; label: string } | null>(null);

  const rows = useMemo(
    () => clients.filter((c) => divFilter === "all" || c.division_slug === divFilter),
    [clients, divFilter],
  );

  const openVal = sum(rows.filter((c) => OPEN_STAGES.includes(c.stage)).map((c) => c.value_paise));
  const wonVal = sum(rows.filter((c) => c.stage === "won").map((c) => c.value_paise));
  const openCount = rows.filter((c) => OPEN_STAGES.includes(c.stage)).length;
  const wonCount = rows.filter((c) => c.stage === "won").length;

  function openModalFromSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setModal(true);
  }

  async function run(id: string, fn: () => Promise<{ ok: true } | { error: string }>) {
    setErr(null); setBusyId(id);
    const res = await fn();
    setBusyId(null);
    if ("error" in res) { setErr(res.error); return false; }
    router.refresh();
    return true;
  }
  async function doConfirm() {
    if (!confirm) return;
    const ok = await run(confirm.id, () => deleteClient(confirm.id));
    if (ok) setConfirm(null);
  }

  const firstDiv = divisions[0]?.id ?? "";
  const fields: Field[] = [
    { key: "name", label: "Client / company", type: "text", required: true },
    { key: "division_id", label: "Division", type: "division", half: true },
    { key: "stage", label: "Stage", type: "select", options: CLIENT_STAGES.map((s) => ({ value: s.key, label: s.label })), half: true },
    { key: "value", label: "Deal value", type: "money", half: true },
    { key: "contact_name", label: "Contact person", type: "text", half: true },
    { key: "email", label: "Email", type: "text", half: true },
    { key: "phone", label: "Phone", type: "text", half: true },
    { key: "note", label: "Notes", type: "textarea" },
  ];

  return (
    <>
      <div className="fin" aria-label="Pipeline summary" style={{ marginBottom: 22 }}>
        <div className="cell"><div className="label">Open pipeline</div><div className="v mono">{inrShort(openVal)}</div><div className="d dim">{openCount} in play</div></div>
        <div className="cell"><div className="label">Won</div><div className="v mono">{inrShort(wonVal)}</div><div className="d dim">{wonCount} closed</div></div>
        <div className="cell"><div className="label">Clients & leads</div><div className="v mono">{rows.length}</div><div className="d dim">{divFilter === "all" ? "all divisions" : short(divisions.find((d) => d.slug === divFilter)?.name ?? "")}</div></div>
        <div className="cell"><div className="label">Win rate</div><div className="v mono">{wonCount + rows.filter((c) => c.stage === "lost").length > 0 ? Math.round((wonCount / (wonCount + rows.filter((c) => c.stage === "lost").length)) * 100) : 0}%</div><div className="d dim">won / closed</div></div>
      </div>

      <div className="toolbar">
        <button className={`fpill ${divFilter === "all" ? "on" : ""}`} onClick={() => setDivFilter("all")}>All divisions</button>
        {divisions.map((d) => (
          <button key={d.slug} className={`fpill ${divFilter === d.slug ? "on" : ""}`} onClick={() => setDivFilter(d.slug)}>{short(d.name)}</button>
        ))}
        <div className="spacer" />
        <form method="get" onSubmit={openModalFromSubmit}>
          {divFilter !== "all" && <input type="hidden" name="div" value={divFilter} />}
          <input type="hidden" name="new" value="1" />
          <button className="btn" type="submit"><IconPlus size={15} />Add client</button>
        </form>
      </div>

      {err && <div className="form-err" style={{ marginBottom: 14 }} role="alert">{err}</div>}

      {rows.length === 0 ? (
        <div className="glass" style={{ borderRadius: 14, padding: "44px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 15, color: "var(--text)", marginBottom: 6 }}>No clients yet</div>
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 18 }}>Add your first client or lead — projects and invoices hang off these.</div>
          <form method="get" onSubmit={openModalFromSubmit} style={{ display: "inline-flex", justifyContent: "center", width: "100%" }}>
            {divFilter !== "all" && <input type="hidden" name="div" value={divFilter} />}
            <input type="hidden" name="new" value="1" />
            <button className="btn" type="submit" style={{ margin: "0 auto" }}><IconPlus size={15} />Add client</button>
          </form>
        </div>
      ) : (
        <div className="pipe">
          {CLIENT_STAGES.map((st) => {
            const col = rows.filter((c) => c.stage === st.key);
            const colVal = sum(col.map((c) => c.value_paise));
            return (
              <div className="col" key={st.key}>
                <div className="col-head">
                  <span className="ct"><span className="cdot" style={{ background: stageDot[st.key] }} />{st.label}</span>
                  <span className="fsub mono">{col.length}{colVal > 0 ? ` · ${inrShort(colVal)}` : ""}</span>
                </div>
                <div className="col-body">
                  {col.length === 0 ? <div className="col-empty">—</div> : col.map((c) => (
                    <div className="ccard" key={c.id}>
                      <div className="ccard-top">
                        <span className="ccard-name">{c.name}</span>
                        {c.value_paise > 0 && <span className="ccard-val mono">{inr(c.value_paise)}</span>}
                      </div>
                      {(c.contact_name || c.email) && <div className="ccard-meta">{[c.contact_name, c.email].filter(Boolean).join(" · ")}</div>}
                      <div className="ccard-foot">
                        <span className="chip">{short(c.division_name)}</span>
                        <select className="ccard-stage" value={c.stage} disabled={busyId === c.id} onChange={(e) => run(c.id, () => setClientStage(c.id, e.target.value))} aria-label="Move stage">
                          {CLIENT_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </select>
                        <button className="iconbtn danger" aria-label="Delete" disabled={busyId === c.id} onClick={() => setConfirm({ id: c.id, label: c.name })}><Trash /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <RecordModal
          title="Add client"
          fields={fields}
          initial={{ division_id: firstDiv, stage: "lead" }}
          divisions={divisions}
          projects={[]}
          onClose={() => setModal(false)}
          onSave={async (v) => {
            const res = await addClient({ division_id: v.division_id, name: v.name, contact_name: v.contact_name, email: v.email, phone: v.phone, stage: v.stage, value_paise: v.value, note: v.note });
            if ("ok" in res) router.refresh();
            return res;
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog title="Delete client" message={`Delete ${confirm.label}? This can be restored from the database.`} busy={busyId === confirm.id} onConfirm={doConfirm} onCancel={() => setConfirm(null)} />
      )}
    </>
  );
}
