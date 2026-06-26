"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  IconSearch, IconHome, IconTasks, IconFinance, IconDoc, IconSparkle, IconSettings, IconClients,
  IconStudios, IconDigital, IconConstruction, IconLivingTwin, IconLayers,
} from "@/components/icons";

type Nav = { slug: string; name: string };
type Item = { id: string; label: string; sub?: string; href: string; icon: React.ReactNode; group: "Go to" | "Results" };

const divIcon: Record<string, (p: { size?: number }) => React.ReactElement> = {
  studios: IconStudios, digital: IconDigital, construction: IconConstruction, living_twin: IconLivingTwin,
};

export function CommandPalette({ divisions, canSeeFinances, isOwner }: { divisions: Nav[]; canSeeFinances: boolean; isOwner: boolean }) {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = useRef(createClient()).current as any;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global ⌘K / Ctrl+K, plus a custom event so mobile (no keyboard) can open it via a button.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "Escape") setOpen(false);
    }
    function onOpen() { setOpen(true); }
    document.addEventListener("keydown", onKey);
    window.addEventListener("sthyra:open-cmdk", onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("sthyra:open-cmdk", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) { setQ(""); setHits([]); setActive(0); setTimeout(() => inputRef.current?.focus(), 20); }
  }, [open]);

  const navItems = useMemo<Item[]>(() => {
    const items: Item[] = [
      { id: "nav-home", label: "Home · Inbox", href: "/", icon: <IconHome size={15} />, group: "Go to" },
      { id: "nav-tasks", label: "Tasks", href: "/tasks", icon: <IconTasks size={15} />, group: "Go to" },
      { id: "nav-projects", label: "Projects", href: "/projects", icon: <IconLayers size={15} />, group: "Go to" },
      { id: "nav-clients", label: "Clients", href: "/clients", icon: <IconClients size={15} />, group: "Go to" },
      ...(canSeeFinances ? [{ id: "nav-fin", label: "Finances", href: "/finances", icon: <IconFinance size={15} />, group: "Go to" as const }] : []),
      { id: "nav-docs", label: "Documents", href: "/documents", icon: <IconDoc size={15} />, group: "Go to" },
      ...(isOwner ? [{ id: "nav-ai", label: "Assistant", href: "/ai", icon: <IconSparkle size={15} />, group: "Go to" as const }] : []),
      { id: "nav-settings", label: "Settings", href: "/settings", icon: <IconSettings size={15} />, group: "Go to" },
      ...divisions.map((d) => {
        const Ic = divIcon[d.slug] ?? IconLivingTwin;
        return { id: `nav-${d.slug}`, label: d.name, sub: "division", href: `/divisions/${d.slug}`, icon: <Ic size={15} />, group: "Go to" as const };
      }),
    ];
    return items;
  }, [divisions, canSeeFinances, isOwner]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setActive(0); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const like = `%${term}%`;
      const orLike = `%${term.replace(/[,.()*]/g, " ")}%`;
      const [tk, dc, iv, cl] = await Promise.all([
        supabase.from("tasks").select("title,divisions(slug)").is("deleted_at", null).ilike("title", like).limit(5),
        supabase.from("documents").select("title,doc_type,divisions(slug)").is("deleted_at", null).ilike("title", like).limit(5),
        supabase.from("invoices").select("number,counterparty,divisions(slug)").is("deleted_at", null).or(`number.ilike.${orLike},counterparty.ilike.${orLike}`).limit(5),
        supabase.from("clients").select("name,stage,divisions(slug)").is("deleted_at", null).ilike("name", like).limit(5),
      ]);
      if (cancelled) return;
      const out: Item[] = [];
      for (const r of (cl.data ?? [])) out.push({ id: `c-${r.name}`, label: r.name, sub: r.stage || r.divisions?.slug, href: `/clients${r.divisions?.slug ? `?div=${r.divisions.slug}` : ""}`, icon: <IconClients size={15} />, group: "Results" });
      for (const r of (tk.data ?? [])) out.push({ id: `t-${r.title}`, label: r.title, sub: r.divisions?.slug, href: `/tasks${r.divisions?.slug ? `?div=${r.divisions.slug}` : ""}`, icon: <IconTasks size={15} />, group: "Results" });
      for (const r of (dc.data ?? [])) out.push({ id: `d-${r.title}`, label: r.title, sub: r.doc_type || r.divisions?.slug, href: `/documents${r.divisions?.slug ? `?div=${r.divisions.slug}` : ""}`, icon: <IconDoc size={15} />, group: "Results" });
      for (const r of (iv.data ?? [])) out.push({ id: `i-${r.number}`, label: r.number, sub: r.counterparty || r.divisions?.slug, href: `/finances${r.divisions?.slug ? `?div=${r.divisions.slug}` : ""}`, icon: <IconFinance size={15} />, group: "Results" });
      setHits(out);
      setActive(0);
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, supabase]);

  const term = q.trim().toLowerCase();
  const shown = useMemo<Item[]>(() => {
    if (term.length < 2) return navItems;
    const navMatch = navItems.filter((i) => i.label.toLowerCase().includes(term));
    return [...navMatch, ...hits];
  }, [term, navItems, hits]);

  function go(it: Item) { setOpen(false); router.push(it.href); }

  function onKey(e: React.KeyboardEvent) {
    if (shown.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (shown[active]) go(shown[active]); }
  }

  if (!open) return null;

  let lastGroup = "";
  return (
    <div className="cmdk-overlay" onClick={() => setOpen(false)}>
      <div className="cmdk glass" role="dialog" aria-modal="true" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input-row">
          <IconSearch size={16} />
          <input
            ref={inputRef}
            className="cmdk-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search or jump to…"
            aria-label="Command palette search"
          />
          <kbd className="cmdk-esc">esc</kbd>
        </div>
        <div className="cmdk-list">
          {shown.length === 0 ? (
            <div className="cmdk-empty">No matches.</div>
          ) : (
            shown.map((it, i) => {
              const header = it.group !== lastGroup ? it.group : null;
              lastGroup = it.group;
              return (
                <div key={it.id}>
                  {header && <div className="cmdk-group">{header}</div>}
                  <button className={`cmdk-item ${i === active ? "on" : ""}`} onMouseEnter={() => setActive(i)} onClick={() => go(it)}>
                    <span className="cmdk-ic">{it.icon}</span>
                    <span className="cmdk-label">{it.label}</span>
                    {it.sub && <span className="cmdk-sub">{it.sub}</span>}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
