"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import type { AiDrawerData } from "./AiDrawerHost";

// Optional surfaces — loaded only when the user activates them. The on-screen
// trigger (Cmd-K, the AI pill) is part of the static TopBar chunk, so the
// perceived latency drops to whatever the dynamic chunk fetch takes.
const CommandPalette = dynamic(
  () => import("./CommandPalette").then((m) => m.CommandPalette),
  { ssr: false },
);
const AiDrawerHost = dynamic(
  () => import("./AiDrawerHost").then((m) => m.AiDrawerHost),
  { ssr: false },
);

type Nav = { slug: string; name: string };

export function AppShell({
  divisions, canSeeFinances, canSeePeople = canSeeFinances, isOwner = false, initials, userName, userRoleLabel, children, aiInitialData,
}: {
  divisions: Nav[];
  canSeeFinances: boolean;
  canSeePeople?: boolean;
  isOwner?: boolean;
  initials: string;
  userName?: string;
  userRoleLabel?: string;
  children: React.ReactNode;
  aiInitialData?: AiDrawerData;
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
      <a href="#main" className="skip-link">Skip to main content</a>
      <Sidebar
        divisions={divisions}
        canSeeFinances={canSeeFinances}
        canSeePeople={canSeePeople}
        isOwner={isOwner}
        initials={initials}
        userName={userName}
        userRoleLabel={userRoleLabel}
        onNavigate={() => setNavOpen(false)}
      />
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      <div className="app-content">
        <TopBar initials={initials} canSeeFinances={canSeeFinances} onMenu={() => setNavOpen((v) => !v)} />
        {children}
      </div>
      <CommandPalette divisions={divisions} canSeeFinances={canSeeFinances} isOwner={isOwner} />
      <AiDrawerHost initialData={aiInitialData} />
    </div>
  );
}
