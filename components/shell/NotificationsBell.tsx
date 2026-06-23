"use client";

import { useEffect, useRef, useState } from "react";
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

  async function load() {
    const { data } = await supabase
      .from("notifications")
      .select("id,kind,title,body,link,read_at,created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data ?? []) as Note[]);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div className="notif">
      <button className="pill" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} onClick={() => setOpen((o) => !o)}>
        <IconBell size={14} />
        {unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <>
          <div className="notif-backdrop" onClick={() => setOpen(false)} />
          <div className="notif-pop glass" role="menu" aria-label="Notifications">
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
      )}
    </div>
  );
}
