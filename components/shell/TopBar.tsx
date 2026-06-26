"use client";

import { IconSearch, IconSparkle } from "@/components/icons";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { NotificationsBell } from "./NotificationsBell";
import { GlobalSearch } from "./GlobalSearch";

export function TopBar({ initials, onMenu }: { initials: string; onMenu?: () => void }) {
  function openAi() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("sthyra:open-ai"));
    }
  }

  return (
    <div className="top">
      <button className="menu-btn" onClick={onMenu} aria-label="Open menu">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
      <GlobalSearch />
      <div style={{ flex: 1 }} />
      <button className="iconbtn top-search-m" aria-label="Search" onClick={() => window.dispatchEvent(new Event("sthyra:open-cmdk"))}>
        <IconSearch size={17} />
      </button>
      <button className="pill ai-pill" aria-label="Open assistant" onClick={openAi} title="Assistant (Claude Opus 4.8)">
        <IconSparkle size={14} />
        <span>Ask AI</span>
      </button>
      <NotificationsBell />
      <SignOutButton initials={initials} />
    </div>
  );
}