"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { inr, inrShort, pct, dueLabel } from "@/lib/format";
import type { DivisionOpt, ProjectOpt } from "@/lib/tasks-types";
import type { Txn, Inv, Bom, Ra, FinView } from "@/lib/finances-types";
import { IconPlus, IconDownload, IconDoc } from "@/components/icons";
import { toCsv, downloadCsv, rupees } from "@/lib/csv";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { InvoicePrint } from "./InvoicePrint";
import { RecordModal, type Field } from "./RecordModal";
import {
  createTransaction, deleteTransaction,
  createInvoice, setInvoiceStatus, deleteInvoice,
  createBomItem, deleteBomItem,
  createRaBill, deleteRaBill,
} from "@/app/finances/actions";

const VIEWS: { key: FinView; label: string }[] = [
  { key: "ledger", label: "Ledger" },
  { key: "invoices", label: "Invoices" },
  { key: "pnl", label: "P&L" },
  { key: "bom", label: "BOM" },
  { key: "ra", label: "RA bills" },
];

function Trash() {
  return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>;
}

function Chevron({ dir }: { dir: "l" | "r" }) {
  return <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{dir === "l" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}</svg>;
}

function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  const start = page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, fontSize: 12, color: "var(--text-dim)" }}>
      <span>{start}–{end} of {total}</span>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="iconbtn" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page"><Chevron dir="l" /></button>
        <button className="iconbtn" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Next page"><Chevron dir="r" /></button>
      </div>
    </div>
  );
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const nextInvoiceStatus: Record<string, string> = { draft: "sent", sent: "paid", overdue: "paid", paid: "paid" };

export function FinancesView({
  transactions, invoices, bom, ra, divisions, projects, initialDivision, openNew,
}: {
  transactions: Txn[]; invoices: Inv[]; bom: Bom[]; ra: Ra[];
  divisions: DivisionOpt[]; projects: ProjectOpt[]; initialDivision?: string; openNew?: boolean;
}) {
  const router = useRouter();
  const [divFilter, setDivFilter] = useState(initialDivision ?? "all");
  const [view, setView] = useState<FinView>(openNew ? "invoices" : "ledger");
  const [modal, setModal] = useState<FinView | null>(openNew ? "invoices" : null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; label: string; fn: () => Promise<{ ok: true } | { error: string }> } | null>(null);
  const [printInv, setPrintInv] = useState<Inv | null>(null);
  const [page, setPage] = useState(0);
  const PAGE = 25;
  useEffect(() => { setPage(0); }, [view, divFilter]);
  const today = new Date();

  const inScope = (slug: string) => divFilter === "all" || slug === divFilter;
  const txns = transactions.filter((t) => inScope(t.division_slug));
  const invs = invoices.filter((i) => inScope(i.division_slug));
  const boms = bom.filter((b) => inScope(b.division_slug));
  const ras = ra.filter((r) => inScope(r.division_slug));

  const moneyIn = sum(txns.filter((t) => t.direction === "in").map((t) => t.amount_paise));
  const moneyOut = sum(txns.filter((t) => t.direction === "out").map((t) => t.amount_paise));
  const owed = sum(invs.filter((i) => i.status === "sent" || i.status === "overdue").map((i) => i.amount_paise));
  const margin = moneyIn > 0 ? ((moneyIn - moneyOut) / moneyIn) * 100 : 0;

  async function run(id: string, fn: () => Promise<{ ok: true } | { error: string }>) {
    setErr(null);
    setBusyId(id);
    const res = await fn();
    setBusyId(null);
    if ("error" in res) { setErr(res.error); return false; }
    router.refresh();
    return true;
  }
  function askDelete(id: string, label: string, fn: () => Promise<{ ok: true } | { error: string }>) {
    setConfirm({ id, label, fn });
  }
  async function doConfirm() {
    if (!confirm) return;
    const ok = await run(confirm.id, confirm.fn);
    if (ok) setConfirm(null);
  }

  function exportCsv() {
    const dn = (s: string) => s.replace(/^Sthyra\s+/, "");
    const tag = divFilter === "all" ? "all-divisions" : divFilter;
    let headers: string[] = [];
    let rows: (string | number | null)[][] = [];
    if (view === "ledger") {
      headers = ["Date", "Category", "Counterparty", "Division", "Status", "Direction", "Amount (₹)"];
      rows = txns.map((t) => [t.occurred_on, t.category ?? "", t.counterparty ?? "", dn(t.division_name), t.status, t.direction === "in" ? "in" : "out", rupees(t.direction === "in" ? t.amount_paise : -t.amount_paise)]);
    } else if (view === "invoices") {
      headers = ["Number", "Counterparty", "Division", "Issued", "Due", "Status", "Amount (₹)"];
      rows = invs.map((i) => [i.number, i.counterparty ?? "", dn(i.division_name), i.issued_on ?? "", i.due_on ?? "", i.status, rupees(i.amount_paise)]);
    } else if (view === "bom") {
      headers = ["Item", "Vendor", "Category", "Qty", "Unit", "Unit cost (₹)", "Line total (₹)", "Division"];
      rows = boms.map((b) => [b.item, b.vendor ?? "", b.category ?? "", b.qty, b.unit ?? "", rupees(b.unit_cost_paise), rupees(b.unit_cost_paise * b.qty), dn(b.division_name)]);
    } else if (view === "ra") {
      headers = ["RA", "Period", "Division", "Gross (₹)", "Deduction (₹)", "Net (₹)", "Status", "Certified on"];
      rows = ras.map((r) => [r.sequence, r.period ?? "", dn(r.division_name), rupees(r.gross_paise), rupees(r.deduction_paise), rupees(r.net_paise ?? r.gross_paise - r.deduction_paise), r.status, r.certified_on ?? ""]);
    } else {
      headers = ["Division", "Revenue (₹)", "Costs (₹)", "Net (₹)", "Margin (%)"];
      rows = divisions.filter((d) => inScope(d.slug)).map((d) => {
        const dt = transactions.filter((t) => t.division_id === d.id);
        const rev = sum(dt.filter((t) => t.direction === "in").map((t) => t.amount_paise));
        const cost = sum(dt.filter((t) => t.direction === "out").map((t) => t.amount_paise));
        return [dn(d.name), rupees(rev), rupees(cost), rupees(rev - cost), rev > 0 ? Math.round(((rev - cost) / rev) * 100) : 0];
      });
    }
    downloadCsv(`sthyra-${view}-${tag}.csv`, toCsv(headers, rows));
  }

  const firstDiv = divisions[0]?.id ?? "";
  const livingTwin = divisions.find((d) => d.slug === "living_twin")?.id ?? firstDiv;
  const construction = divisions.find((d) => d.slug === "construction")?.id ?? firstDiv;
  const todayStr = today.toISOString().slice(0, 10);

  // ----- modal field configs + save handlers -----
  const txnFields: Field[] = [
    { key: "type", label: "Type", type: "select", options: [{ value: "revenue", label: "Revenue (money in)" }, { value: "cost", label: "Cost (money out)" }], half: true },
    { key: "amount", label: "Amount", type: "money", half: true },
    { key: "division_id", label: "Division", type: "division", half: true },
    { key: "project_id", label: "Project", type: "project", half: true },
    { key: "category", label: "Category", type: "text", placeholder: "e.g. Project billing", half: true },
    { key: "occurred_on", label: "Date", type: "date", half: true },
    { key: "counterparty", label: "Counterparty", type: "text", half: true },
    { key: "status", label: "Status", type: "select", options: [{ value: "cleared", label: "Cleared" }, { value: "pending", label: "Pending" }, { value: "draft", label: "Draft" }], half: true },
    { key: "note", label: "Note", type: "textarea" },
  ];
  const invFields: Field[] = [
    { key: "number", label: "Invoice no.", type: "text", placeholder: "STD-0143", half: true },
    { key: "amount", label: "Amount", type: "money", half: true },
    { key: "division_id", label: "Division", type: "division", half: true },
    { key: "project_id", label: "Project", type: "project", half: true },
    { key: "counterparty", label: "Counterparty", type: "text" },
    { key: "status", label: "Status", type: "select", options: [{ value: "draft", label: "Draft" }, { value: "sent", label: "Sent" }, { value: "paid", label: "Paid" }, { value: "overdue", label: "Overdue" }], half: true },
    { key: "issued_on", label: "Issued", type: "date", half: true },
    { key: "due_on", label: "Due", type: "date", half: true },
  ];
  const bomFields: Field[] = [
    { key: "item", label: "Item", type: "text", placeholder: "Selec EM2M energy meter" },
    { key: "vendor", label: "Vendor", type: "text", half: true },
    { key: "category", label: "Category", type: "text", half: true },
    { key: "qty", label: "Quantity", type: "number", step: "1", half: true },
    { key: "unit", label: "Unit", type: "text", placeholder: "pcs", half: true },
    { key: "unit_cost", label: "Unit cost", type: "money", half: true },
    { key: "division_id", label: "Division", type: "division", half: true },
  ];
  const raFields: Field[] = [
    { key: "sequence", label: "RA sequence", type: "number", step: "1", half: true },
    { key: "period", label: "Period", type: "text", placeholder: "Jun 2026", half: true },
    { key: "division_id", label: "Division", type: "division", half: true },
    { key: "project_id", label: "Project", type: "project", half: true },
    { key: "gross_paise", label: "Gross", type: "money", half: true },
    { key: "deduction_paise", label: "Deduction", type: "money", half: true },
    { key: "status", label: "Status", type: "select", options: [{ value: "pending", label: "Pending" }, { value: "certified", label: "Certified" }], half: true },
    { key: "certified_on", label: "Certified on", type: "date", half: true },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modalConfig: Record<FinView, { title: string; fields: Field[]; initial: any; save: (v: any) => Promise<{ ok: true } | { error: string }> }> = {
    ledger: {
      title: "New transaction", fields: txnFields,
      initial: { type: "revenue", division_id: firstDiv, project_id: "", status: "cleared", occurred_on: todayStr },
      save: (v) => createTransaction({
        division_id: v.division_id, project_id: v.project_id, kind: v.type, direction: v.type === "revenue" ? "in" : "out",
        amount_paise: v.amount, category: v.category, status: v.status, occurred_on: v.occurred_on, counterparty: v.counterparty, note: v.note,
      }),
    },
    invoices: {
      title: "New invoice", fields: invFields,
      initial: { division_id: firstDiv, project_id: "", status: "draft", issued_on: todayStr },
      save: (v) => createInvoice({
        division_id: v.division_id, project_id: v.project_id, number: v.number, counterparty: v.counterparty,
        amount_paise: v.amount, status: v.status, issued_on: v.issued_on, due_on: v.due_on,
      }),
    },
    bom: {
      title: "New BOM item", fields: bomFields,
      initial: { division_id: livingTwin, qty: 1 },
      save: (v) => createBomItem({ division_id: v.division_id, item: v.item, qty: v.qty, unit: v.unit, unit_cost_paise: v.unit_cost, category: v.category, vendor: v.vendor }),
    },
    ra: {
      title: "New RA bill", fields: raFields,
      initial: { division_id: construction, project_id: "", status: "pending" },
      save: (v) => createRaBill({ division_id: v.division_id, project_id: v.project_id, sequence: v.sequence, period: v.period, gross_paise: v.gross_paise, deduction_paise: v.deduction_paise, status: v.status, certified_on: v.certified_on }),
    },
    pnl: { title: "", fields: [], initial: {}, save: async () => ({ ok: true } as const) },
  };

  return (
    <>
      <div className="fin" aria-label="Finance summary" style={{ marginBottom: 22 }}>
        <div className="cell"><div className="label">Money in</div><div className="v mono">{inrShort(moneyIn)}</div><div className="d dim">{txns.filter((t) => t.direction === "in").length} entries</div></div>
        <div className="cell"><div className="label">Money out</div><div className="v mono">{inrShort(moneyOut)}</div><div className="d dim">{txns.filter((t) => t.direction === "out").length} entries</div></div>
        <div className="cell"><div className="label">Owed to us</div><div className="v mono">{inrShort(owed)}</div><div className={`d ${invs.some((i) => i.status === "overdue") ? "down" : "dim"}`}>{invs.filter((i) => i.status === "overdue").length} overdue</div></div>
        <div className="cell"><div className="label">Margin</div><div className="v mono">{pct(margin)}</div><div className="d dim">in − out</div></div>
      </div>

      <div className="toolbar">
        <button className={`fpill ${divFilter === "all" ? "on" : ""}`} onClick={() => setDivFilter("all")}>All divisions</button>
        {divisions.map((d) => (
          <button key={d.slug} className={`fpill ${divFilter === d.slug ? "on" : ""}`} onClick={() => setDivFilter(d.slug)}>{d.name.replace(/^Sthyra\s+/, "")}</button>
        ))}
        <div className="spacer" />
        <div className="segctl" role="group" aria-label="View">
          {VIEWS.map((v) => <button key={v.key} className={view === v.key ? "on" : ""} onClick={() => setView(v.key)}>{v.label}</button>)}
        </div>
        <button className="btn-ghost" onClick={exportCsv} title="Export current view to CSV"><IconDownload size={15} />Export</button>
        {view !== "pnl" && <button className="btn" onClick={() => setModal(view)}><IconPlus size={15} />Add</button>}
      </div>

      {err && <div className="form-err" style={{ marginBottom: 14 }} role="alert">{err}</div>}

      {view === "ledger" && (
        <>
        <div className="ftable">
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Division</th><th>Status</th><th style={{ textAlign: "right" }}>Amount</th><th></th></tr></thead>
            <tbody>
              {txns.length === 0 ? <tr><td colSpan={6} className="ftable-empty">No transactions yet. Add one to start the ledger.</td></tr> :
                txns.slice(page * PAGE, page * PAGE + PAGE).map((t) => (
                  <tr key={t.id}>
                    <td className="fsub mono">{t.occurred_on}</td>
                    <td>{t.category ?? "—"}{t.counterparty ? <span className="fsub"> · {t.counterparty}</span> : ""}</td>
                    <td className="fsub">{t.division_name.replace(/^Sthyra\s+/, "")}</td>
                    <td><span className={`spill ${t.status}`}>{t.status}</span></td>
                    <td className={`num ${t.direction === "in" ? "money-in" : "money-out"}`}>{t.direction === "in" ? "+" : "−"}{inr(t.amount_paise)}</td>
                    <td><div className="rowact"><button className="iconbtn danger" aria-label="Delete" disabled={busyId === t.id} onClick={() => askDelete(t.id, "this transaction", () => deleteTransaction(t.id))}><Trash /></button></div></td>
                  </tr>
                ))}
            </tbody>
          </table>
          {txns.length > 0 && <div className="ftable-foot"><span className="fsub">Net (in − out)</span><span className={`num ${moneyIn - moneyOut >= 0 ? "money-in" : "money-out"}`}>{inr(moneyIn - moneyOut)}</span></div>}
        </div>
        <Pager page={page} pageSize={PAGE} total={txns.length} onPage={setPage} />
        </>
      )}

      {view === "invoices" && (
        <>
        <div className="ftable">
          <table>
            <thead><tr><th>Number</th><th>Counterparty</th><th>Division</th><th>Due</th><th>Status</th><th style={{ textAlign: "right" }}>Amount</th><th></th></tr></thead>
            <tbody>
              {invs.length === 0 ? <tr><td colSpan={7} className="ftable-empty">No invoices yet.</td></tr> :
                invs.slice(page * PAGE, page * PAGE + PAGE).map((i) => (
                  <tr key={i.id}>
                    <td className="mono">{i.number}</td>
                    <td>{i.counterparty ?? "—"}</td>
                    <td className="fsub">{i.division_name.replace(/^Sthyra\s+/, "")}</td>
                    <td className="fsub">{i.due_on ? dueLabel(i.due_on, today) : "—"}</td>
                    <td><button className={`spill ${i.status}`} title="Click to advance status" disabled={busyId === i.id || i.status === "paid"} onClick={(e) => { e.stopPropagation(); run(i.id, () => setInvoiceStatus(i.id, nextInvoiceStatus[i.status])); }}>{i.status}</button></td>
                    <td className="num">{inr(i.amount_paise)}</td>
                    <td><div className="rowact"><button className="iconbtn" aria-label="Invoice PDF" title="View / Save PDF" onClick={() => setPrintInv(i)}><IconDoc size={14} /></button><button className="iconbtn danger" aria-label="Delete" disabled={busyId === i.id} onClick={() => askDelete(i.id, `invoice ${i.number}`, () => deleteInvoice(i.id))}><Trash /></button></div></td>
                  </tr>
                ))}
            </tbody>
          </table>
          {invs.length > 0 && <div className="ftable-foot"><span className="fsub">Outstanding (sent + overdue)</span><span className="num">{inr(owed)}</span></div>}
        </div>
        <Pager page={page} pageSize={PAGE} total={invs.length} onPage={setPage} />
        </>
      )}

      {view === "pnl" && (
        <div className="pnl-grid">
          {divisions.filter((d) => inScope(d.slug)).map((d) => {
            const dt = transactions.filter((t) => t.division_id === d.id);
            const rev = sum(dt.filter((t) => t.direction === "in").map((t) => t.amount_paise));
            const cost = sum(dt.filter((t) => t.direction === "out").map((t) => t.amount_paise));
            const m = rev > 0 ? ((rev - cost) / rev) * 100 : 0;
            return (
              <div className="pnl-card" key={d.id}>
                <div className="pn">{d.name.replace(/^Sthyra\s+/, "")}<span className="badge">{dt.length} txns</span></div>
                <div className="pnl-row"><span className="k">Revenue</span><span className="v money-in">{inr(rev)}</span></div>
                <div className="pnl-row"><span className="k">Costs</span><span className="v money-out">{inr(cost)}</span></div>
                <div className="pnl-line" />
                <div className="pnl-row"><span className="k">Net</span><span className="v">{inr(rev - cost)}</span></div>
                <div className="pnl-row" style={{ marginTop: 6 }}><span className="k">Margin</span><span className="pnl-margin" style={{ color: m >= 20 ? "var(--positive)" : m >= 0 ? "var(--warning)" : "var(--danger)" }}>{pct(m)}</span></div>
              </div>
            );
          })}
        </div>
      )}

      {view === "bom" && (
        <div className="ftable">
          <table>
            <thead><tr><th>Item</th><th>Vendor</th><th style={{ textAlign: "right" }}>Qty</th><th style={{ textAlign: "right" }}>Unit cost</th><th style={{ textAlign: "right" }}>Line total</th><th></th></tr></thead>
            <tbody>
              {boms.length === 0 ? <tr><td colSpan={6} className="ftable-empty">No BOM items. Build the bill of materials (Living Twin).</td></tr> :
                boms.map((b) => (
                  <tr key={b.id}>
                    <td>{b.item}{b.unit ? <span className="fsub"> / {b.unit}</span> : ""}</td>
                    <td className="fsub">{b.vendor ?? "—"}</td>
                    <td className="num">{b.qty}</td>
                    <td className="num">{inr(b.unit_cost_paise)}</td>
                    <td className="num">{inr(b.unit_cost_paise * b.qty)}</td>
                    <td><div className="rowact"><button className="iconbtn danger" aria-label="Delete" disabled={busyId === b.id} onClick={() => askDelete(b.id, b.item, () => deleteBomItem(b.id))}><Trash /></button></div></td>
                  </tr>
                ))}
            </tbody>
          </table>
          {boms.length > 0 && <div className="ftable-foot"><span className="fsub">BOM total</span><span className="num">{inr(sum(boms.map((b) => b.unit_cost_paise * b.qty)))}</span></div>}
        </div>
      )}

      {view === "ra" && (
        <div className="ftable">
          <table>
            <thead><tr><th>RA</th><th>Period</th><th>Division</th><th style={{ textAlign: "right" }}>Gross</th><th style={{ textAlign: "right" }}>Deduction</th><th style={{ textAlign: "right" }}>Net</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {ras.length === 0 ? <tr><td colSpan={8} className="ftable-empty">No RA bills. Add running-account bills (Construction).</td></tr> :
                ras.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">#{r.sequence}</td>
                    <td className="fsub">{r.period ?? "—"}</td>
                    <td className="fsub">{r.division_name.replace(/^Sthyra\s+/, "")}</td>
                    <td className="num">{inr(r.gross_paise)}</td>
                    <td className="num money-out">−{inr(r.deduction_paise)}</td>
                    <td className="num">{inr(r.net_paise ?? r.gross_paise - r.deduction_paise)}</td>
                    <td><span className={`spill ${r.status === "certified" ? "paid" : "pending"}`}>{r.status}</span></td>
                    <td><div className="rowact"><button className="iconbtn danger" aria-label="Delete" disabled={busyId === r.id} onClick={() => askDelete(r.id, `RA #${r.sequence}`, () => deleteRaBill(r.id))}><Trash /></button></div></td>
                  </tr>
                ))}
            </tbody>
          </table>
          {ras.length > 0 && <div className="ftable-foot"><span className="fsub">Net certified value</span><span className="num">{inr(sum(ras.map((r) => r.net_paise ?? r.gross_paise - r.deduction_paise)))}</span></div>}
        </div>
      )}

      {modal && modal !== "pnl" && (
        <RecordModal
          title={modalConfig[modal].title}
          fields={modalConfig[modal].fields}
          initial={modalConfig[modal].initial}
          divisions={divisions}
          projects={projects}
          onClose={() => setModal(null)}
          onSave={async (v) => { const res = await modalConfig[modal].save(v); if ("ok" in res) router.refresh(); return res; }}
        />
      )}

      {printInv && <InvoicePrint inv={printInv} onClose={() => setPrintInv(null)} />}

      {confirm && (
        <ConfirmDialog
          title="Delete"
          message={`Delete ${confirm.label}? This can be restored from the database.`}
          busy={busyId === confirm.id}
          onConfirm={doConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
