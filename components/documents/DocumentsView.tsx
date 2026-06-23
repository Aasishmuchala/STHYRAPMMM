"use client";

import { useState } from "react";
import { docKind, type Doc, type DocKind } from "@/lib/doc-types";
import type { DivisionOpt } from "@/lib/tasks-types";
import { IconDoc, IconPlus } from "@/components/icons";
import { DocModal } from "./DocModal";
import { DocReader } from "./DocReader";

const DIV_SHORT: Record<string, string> = { studios: "Studios", digital: "Digital", construction: "Construction", living_twin: "Living Twin" };

function KindIcon({ kind }: { kind: DocKind }) {
  if (kind === "file") return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.5 12.5 21a4.5 4.5 0 0 1-6.36-6.36l8.49-8.49a3 3 0 0 1 4.24 4.24l-8.49 8.49a1.5 1.5 0 0 1-2.12-2.12L14.5 8.5" /></svg>;
  if (kind === "link") return <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>;
  return <IconDoc size={17} />;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const NEW_OPTS: { kind: DocKind; label: string }[] = [
  { kind: "note", label: "Write a note" },
  { kind: "file", label: "Upload a file" },
  { kind: "link", label: "Add a link" },
];

export function DocumentsView({ documents, divisions, initialDivision }: { documents: Doc[]; divisions: DivisionOpt[]; initialDivision?: string }) {
  const [divFilter, setDivFilter] = useState(initialDivision ?? "all");
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState<DocKind | null>(null);
  const [reader, setReader] = useState<Doc | null>(null);

  const docs = documents.filter((d) => divFilter === "all" || d.division_slug === divFilter);

  return (
    <>
      <div className="toolbar">
        <button className={`fpill ${divFilter === "all" ? "on" : ""}`} onClick={() => setDivFilter("all")}>All divisions</button>
        {divisions.map((d) => (
          <button key={d.slug} className={`fpill ${divFilter === d.slug ? "on" : ""}`} onClick={() => setDivFilter(d.slug)}>{d.name.replace(/^Sthyra\s+/, "")}</button>
        ))}
        <div className="spacer" />
        <div className="newmenu">
          <button className="btn" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}><IconPlus size={15} />New</button>
          {menu && (
            <>
              <div onClick={() => setMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
              <div className="newmenu-pop" role="menu">
                {NEW_OPTS.map((o) => (
                  <button key={o.kind} role="menuitem" onClick={() => { setModal(o.kind); setMenu(false); }}>
                    <KindIcon kind={o.kind} />{o.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {docs.length === 0 ? (
        <div className="glass" style={{ borderRadius: 13, padding: "44px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, color: "var(--text-dim)" }}>
          <IconDoc size={24} style={{ opacity: 0.6 }} />
          <span style={{ fontSize: 13 }}>No documents here yet. Write a note, upload a file, or add a link.</span>
        </div>
      ) : (
        <div className="doc-grid">
          {docs.map((d) => {
            const k = docKind(d);
            return (
              <button key={d.id} className="doc-card" onClick={() => setReader(d)}>
                <span className="dk"><KindIcon kind={k} /></span>
                <span className="dt">{d.title}</span>
                <span className="dm">
                  {d.doc_type && <span className="dchip">{d.doc_type}</span>}
                  <span>{DIV_SHORT[d.division_slug] ?? d.division_name}</span>
                  <span style={{ marginLeft: "auto" }}>{fmtDate(d.updated_at)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {modal && <DocModal kind={modal} divisions={divisions} onClose={() => setModal(null)} />}
      {reader && <DocReader doc={reader} onClose={() => setReader(null)} />}
    </>
  );
}
