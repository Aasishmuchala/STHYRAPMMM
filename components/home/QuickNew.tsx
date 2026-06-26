"use client";

import { useState } from "react";
import Link from "next/link";
import { IconPlus, IconClients, IconTasks, IconFinance, IconDoc } from "@/components/icons";

export function QuickNew({ canSeeFinances }: { canSeeFinances: boolean }) {
  const [open, setOpen] = useState(false);
  const items = [
    ...(canSeeFinances ? [{ href: "/clients?new=1", label: "New client", Icon: IconClients }] : []),
    { href: "/tasks", label: "New task", Icon: IconTasks },
    ...(canSeeFinances ? [{ href: "/finances?new=1", label: "New invoice", Icon: IconFinance }] : []),
    { href: "/documents", label: "New document", Icon: IconDoc },
  ];
  return (
    <div className="qn">
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <IconPlus size={15} />New
      </button>
      {open && (
        <>
          <div className="notif-backdrop" onClick={() => setOpen(false)} />
          <div className="qn-pop glass" role="menu">
            {items.map((it) => (
              <Link key={it.href} href={it.href} className="qn-item" role="menuitem" onClick={() => setOpen(false)}>
                <it.Icon size={15} />{it.label}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
