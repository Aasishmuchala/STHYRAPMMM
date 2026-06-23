"use client";

import { IconSearch } from "@/components/icons";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { NotificationsBell } from "./NotificationsBell";
import { DivisionSwitcher } from "./DivisionSwitcher";
import { GlobalSearch } from "./GlobalSearch";

type Nav = { slug: string; name: string };

export function TopBar({ initials, onMenu, divisions = [] }: { initials: string; onMenu?: () => void; divisions?: Nav[] }) {
  return (
    <div className="top">
      <button className="menu-btn" onClick={onMenu} aria-label="Open menu">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
      <DivisionSwitcher divisions={divisions} />
      <GlobalSearch />
      <div style={{ flex: 1 }} />
      <button className="iconbtn top-search-m" aria-label="Search" onClick={() => window.dispatchEvent(new Event("sthyra:open-cmdk"))}>
        <IconSearch size={17} />
      </button>
      <NotificationsBell />
      <SignOutButton initials={initials} />
    </div>
  );
}
