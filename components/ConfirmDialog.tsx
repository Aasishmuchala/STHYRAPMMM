"use client";

import { useRef } from "react";
import { useDismiss } from "@/lib/useDismiss";

export function ConfirmDialog({
  title, message, confirmLabel = "Delete", busy = false, onConfirm, onCancel,
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onCancel);

  return (
    <div className="modal-overlay" onClick={onCancel} role="alertdialog" aria-modal="true" aria-label={title} style={{ zIndex: 80 }}>
      <div className="modal" ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <h3>{title}</h3>
        {message && <p style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.6, marginBottom: 22 }}>{message}</p>}
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn" onClick={onConfirm} disabled={busy} style={{ background: "var(--danger)", color: "#fff" }}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
