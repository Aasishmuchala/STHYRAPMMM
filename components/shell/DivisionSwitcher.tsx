"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { IconLayers, IconChevronDown } from "@/components/icons";

type Nav = { slug: string; name: string };

export function DivisionSwitcher({ divisions }: { divisions: Nav[] }) {
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const current = divisions.find((d) => path === `/divisions/${d.slug}`);
  const label = current ? current.name : "All divisions";

  function go(href: string) { setOpen(false); router.push(href); }

  return (
    <div className="dsw">
      <button className="pill" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <IconLayers size={14} />
        {label}
        <IconChevronDown size={13} />
      </button>
      {open && (
        <>
          <div className="notif-backdrop" onClick={() => setOpen(false)} />
          <div className="dsw-pop glass" role="menu">
            <button className={`dsw-item ${!current ? "on" : ""}`} onClick={() => go("/")} role="menuitem">All divisions</button>
            {divisions.map((d) => (
              <button key={d.slug} className={`dsw-item ${current?.slug === d.slug ? "on" : ""}`} onClick={() => go(`/divisions/${d.slug}`)} role="menuitem">{d.name}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
