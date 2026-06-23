"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { IconSearch, IconTasks, IconDoc, IconFinance, IconClients } from "@/components/icons";

type Hit = { kind: "task" | "document" | "invoice" | "client"; label: string; sub: string; href: string };

export function GlobalSearch() {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = useRef(createClient()).current as any;
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const like = `%${term}%`;
      // PostgREST .or() parses commas/parens/dots as filter syntax — strip them for that call.
      const orLike = `%${term.replace(/[,.()*]/g, " ")}%`;
      const [tk, dc, iv, cl] = await Promise.all([
        supabase.from("tasks").select("title,divisions(slug)").is("deleted_at", null).ilike("title", like).limit(5),
        supabase.from("documents").select("title,doc_type,divisions(slug)").is("deleted_at", null).ilike("title", like).limit(5),
        supabase.from("invoices").select("number,counterparty,divisions(slug)").is("deleted_at", null).or(`number.ilike.${orLike},counterparty.ilike.${orLike}`).limit(5),
        supabase.from("clients").select("name,stage,divisions(slug)").is("deleted_at", null).ilike("name", like).limit(5),
      ]);
      if (cancelled) return;
      const out: Hit[] = [];
      for (const r of (cl.data ?? [])) out.push({ kind: "client", label: r.name, sub: r.stage || r.divisions?.slug || "", href: `/clients${r.divisions?.slug ? `?div=${r.divisions.slug}` : ""}` });
      for (const r of (tk.data ?? [])) out.push({ kind: "task", label: r.title, sub: r.divisions?.slug ?? "", href: `/tasks${r.divisions?.slug ? `?div=${r.divisions.slug}` : ""}` });
      for (const r of (dc.data ?? [])) out.push({ kind: "document", label: r.title, sub: r.doc_type || r.divisions?.slug || "", href: `/documents${r.divisions?.slug ? `?div=${r.divisions.slug}` : ""}` });
      for (const r of (iv.data ?? [])) out.push({ kind: "invoice", label: r.number, sub: r.counterparty || r.divisions?.slug || "", href: `/finances${r.divisions?.slug ? `?div=${r.divisions.slug}` : ""}` });
      setHits(out.slice(0, 8));
      setActive(0);
      setOpen(true);
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, supabase]);

  function go(h: Hit) {
    setOpen(false); setQ("");
    router.push(h.href);
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open || hits.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(hits[active]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  const Icon = (k: Hit["kind"]) => (k === "task" ? <IconTasks size={14} /> : k === "document" ? <IconDoc size={14} /> : k === "client" ? <IconClients size={14} /> : <IconFinance size={14} />);

  return (
    <div className="gsearch">
      <div className="search">
        <IconSearch size={15} />
        <input
          className="gsearch-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { if (hits.length) setOpen(true); }}
          onKeyDown={onKey}
          placeholder="Search tasks, docs, invoices…"
          aria-label="Search"
        />
        <kbd className="gsearch-kbd" aria-hidden="true">⌘K</kbd>
      </div>
      {open && q.trim().length >= 2 && (
        <>
          <div className="notif-backdrop" onClick={() => setOpen(false)} />
          <div className="gsearch-pop glass" role="listbox">
            {hits.length === 0 ? (
              <div className="gsearch-empty">No matches for &ldquo;{q.trim()}&rdquo;</div>
            ) : (
              hits.map((h, i) => (
                <button key={i} className={`gsearch-hit ${i === active ? "on" : ""}`} onMouseEnter={() => setActive(i)} onClick={() => go(h)}>
                  <span className="gsearch-ic">{Icon(h.kind)}</span>
                  <span className="gsearch-label">{h.label}</span>
                  {h.sub && <span className="gsearch-sub">{h.sub}</span>}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
