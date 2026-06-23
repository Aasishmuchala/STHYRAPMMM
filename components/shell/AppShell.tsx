"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "./CommandPalette";

type Nav = { slug: string; name: string };

export function AppShell({
  divisions, canSeeFinances, isOwner = false, initials, children,
}: {
  divisions: Nav[];
  canSeeFinances: boolean;
  isOwner?: boolean;
  initials: string;
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  return (
    <div className={`app${navOpen ? " nav-open" : ""}`}>
      <Sidebar divisions={divisions} canSeeFinances={canSeeFinances} isOwner={isOwner} onNavigate={() => setNavOpen(false)} />
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      <div>
        <TopBar initials={initials} onMenu={() => setNavOpen((v) => !v)} divisions={divisions} />
        {children}
      </div>
      <CommandPalette divisions={divisions} canSeeFinances={canSeeFinances} isOwner={isOwner} />
    </div>
  );
}
