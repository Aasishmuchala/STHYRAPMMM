"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { IconBell } from "@/components/icons";

type Note = { id: string; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

function rel(iso: string): string {
  try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

export function NotificationsBell() {
  const router = useRouter();
  // Loose cast: the typed browser client infers `never` for select/update (supabase-js quirk).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = useRef(createClient()).current as any;
  const [items, setItems] = useState<Note[]>([]);
  const [open, setOpen] = useState(false);
  const [popStyle, setPopStyle] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function load() {
    const { data } = await supabase
      .from("notifications")
      .select("id,kind,title,body,link,read_at,created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data ?? []) as Note[]);
  }

  useEffect(() => {
    setMounted(true);
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recompute the dropdown's fixed-position coordinates whenever it opens or
  // the window scrolls/resizes. We measure the bell button and pin the pop-up
  // underneath it so it never gets clipped by a parent with overflow:hidden or
  // by the top-bar's z-index:5 stacking context.
  useLayoutEffect(() => {
    if (!open) return;
    function measure() {
      const btn = containerRef.current?.querySelector<HTMLButtonElement>("button.pill");
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setPopStyle({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  // Listen for clicks anywhere outside the bell to close the dropdown.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      // The dropdown itself is portalled into document.body, so any click
      // outside `containerRef` (including on the dropdown's backdrop) closes it.
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = items.filter((n) => !n.read_at).length;

  async function openItem(n: Note) {
    if (!n.read_at) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    }
    setOpen(false);
    await load();
    if (n.link) router.push(n.link);
  }

  async function markAll() {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    await load();
  }

  function toggle() {
    setOpen((previous) => !previous);
  }

  const dropdown = open && mounted ? (
    <>
      <div className="notif-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
      <div
        className="notif-pop"
        role="menu"
        aria-label="Notifications"
        style={{ top: popStyle.top, right: popStyle.right }}
      >
        <div className="notif-head">
          <span className="label">Notifications</span>
          {unread > 0 && <button className="link" onClick={markAll}>Mark all read</button>}
        </div>
        {items.length === 0 ? (
          <div className="notif-empty">Nothing yet. Your daily brief and alerts will show up here.</div>
        ) : (
          <div className="notif-list">
            {items.map((n) => (
              <button key={n.id} className={`notif-item ${n.read_at ? "" : "unread"}`} onClick={() => openItem(n)}>
                <div className="notif-title">{n.title}</div>
                {n.body && <div className="notif-body">{n.body.slice(0, 150)}</div>}
                <div className="notif-time mono">{rel(n.created_at)}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  ) : null;

  return (
    <div className="notif" ref={containerRef}>
      <button
        className="pill"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={toggle}
        type="button"
      >
        <IconBell size={14} />
        {unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {mounted && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
