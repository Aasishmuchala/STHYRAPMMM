"use client";

import { inr } from "@/lib/format";
import type { Inv } from "@/lib/finances-types";

// Print-to-PDF invoice. Fixed light colors so the printed/saved PDF looks right in any theme.
export function InvoicePrint({ inv, onClose }: { inv: Inv; onClose: () => void }) {
  const div = inv.division_name.replace(/^Sthyra\s+/, "");
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="inv-print-wrap" onClick={(e) => e.stopPropagation()}>
        <div className="inv-paper" id="invoice-print">
          <div className="inv-head">
            <div>
              <div className="inv-brand">STHYRA</div>
              <div className="inv-tagline">Redefining Reality</div>
              <div className="inv-sub">{div} division</div>
            </div>
            <div className="inv-title">
              <div className="inv-doc">INVOICE</div>
              <div className="inv-no">{inv.number}</div>
            </div>
          </div>

          <div className="inv-meta">
            <div>
              <div className="inv-k">Bill to</div>
              <div className="inv-v">{inv.counterparty || "—"}</div>
            </div>
            <div className="inv-dates">
              <div><span className="inv-k">Issued</span><span className="inv-v">{inv.issued_on || "—"}</span></div>
              <div><span className="inv-k">Due</span><span className="inv-v">{inv.due_on || "—"}</span></div>
              <div><span className="inv-k">Status</span><span className="inv-v" style={{ textTransform: "capitalize" }}>{inv.status}</span></div>
            </div>
          </div>

          <table className="inv-table">
            <thead><tr><th>Description</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
            <tbody>
              <tr><td>Professional services — {div}</td><td style={{ textAlign: "right" }}>{inr(inv.amount_paise)}</td></tr>
            </tbody>
            <tfoot><tr><td>Total</td><td style={{ textAlign: "right" }}>{inr(inv.amount_paise)}</td></tr></tfoot>
          </table>

          <div className="inv-foot">Computer-generated invoice · Amounts in INR · Sthyra</div>
        </div>
        <div className="inv-print-actions">
          <button className="btn-ghost" onClick={onClose}>Close</button>
          <button className="btn" onClick={() => window.print()}>Print / Save PDF</button>
        </div>
      </div>
    </div>
  );
}
