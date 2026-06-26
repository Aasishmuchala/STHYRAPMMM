"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "./CommandPalette";
import { AiDrawerHost } from "./AiDrawerHost";

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

  useEffect(() => {
    document.documentElement.setAttribute("data-workspace-surface", "plane");
    return () => {
      document.documentElement.removeAttribute("data-workspace-surface");
    };
  }, []);

  return (
    <div className={`app${navOpen ? " nav-open" : ""}`}>
      <Sidebar divisions={divisions} canSeeFinances={canSeeFinances} isOwner={isOwner} onNavigate={() => setNavOpen(false)} />
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      <div>
        <TopBar initials={initials} canSeeFinances={canSeeFinances} onMenu={() => setNavOpen((v) => !v)} />
        {children}
      </div>
      <CommandPalette divisions={divisions} canSeeFinances={canSeeFinances} isOwner={isOwner} />
      <AiDrawerHost />
    </div>
  );
}
