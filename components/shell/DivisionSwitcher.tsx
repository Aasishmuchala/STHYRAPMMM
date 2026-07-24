"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IconChevronDown } from "@/components/icons";
import { FiBriefcase } from "react-icons/fi";

type Nav = { slug: string; name: string };

const COOKIE = "sthyra_active_company";
const ALL = "all";
const ONE_YEAR = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  const value = match?.[1];
  return value ? decodeURIComponent(value) : null;
}

// Persistent "active company" switcher. Picking a company writes the cookie and
// refreshes the current route, so every server page re-renders scoped to that
// one company (see lib/activeCompany.ts). "All companies" is owner-only.
//
// Implementation note: the dropdown is portaled to document.body so it sits
// above its own click-outside backdrop (z-index 199). Rendering it as a
// sibling inside the sidebar would put the pop UNDER the backdrop because the
// pop's z-index is lower than the backdrop's — clicks on the items would
// never reach the buttons. Portal-escaping to the body fixes that.
export function DivisionSwitcher({ divisions, canPickAll = false }: { divisions: Nav[]; canPickAll?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [popStyle, setPopStyle] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Read the cookie after mount. Doing it here (rather than during render) keeps
  // SSR and the first client paint identical — no hydration mismatch — and the
  // server has already scoped this render to the same default company.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveSlug(readCookie(COOKIE));
    setMounted(true);
  }, []);

  const current = divisions.find((d) => d.slug === activeSlug);
  // Mirror the server default (see resolveActiveCompany): owners with no valid
  // selection land on "All companies"; everyone else on their first company.
  const showingAll = canPickAll && !current;
  const selectedSlug = showingAll ? ALL : (current?.slug ?? divisions[0]?.slug ?? null);
  const label = showingAll ? "All companies" : (current?.name ?? divisions[0]?.name ?? "No company");

  // Measure the trigger so the portaled pop sits flush under it regardless of
  // sidebar width / scroll position.
  useLayoutEffect(() => {
    if (!open) return;
    function measure() {
      const btn = triggerRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setPopStyle({ top: rect.bottom + 8, left: rect.left, width: rect.width });
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  function pick(slug: string) {
    document.cookie = `${COOKIE}=${encodeURIComponent(slug)}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    setActiveSlug(slug);
    setOpen(false);
    router.refresh();
  }

  const dropdown = open && mounted ? (
    <>
      <div className="notif-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
      <div
        className="dsw-pop glass"
        role="menu"
        style={{ position: "fixed", top: popStyle.top, left: popStyle.left, width: popStyle.width }}
      >
        {canPickAll && (
          <button className={`dsw-item ${showingAll ? "on" : ""}`} onClick={() => pick(ALL)} role="menuitem">All companies</button>
        )}
        {divisions.map((d) => (
          <button key={d.slug} className={`dsw-item ${selectedSlug === d.slug ? "on" : ""}`} onClick={() => pick(d.slug)} role="menuitem">{d.name}</button>
        ))}
      </div>
    </>
  ) : null;

  return (
    <div className="dsw">
      <button
        ref={triggerRef}
        className="pill dsw-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        type="button"
      >
        <span className="dsw-trigger-icon" aria-hidden="true">
          <FiBriefcase size={15} />
        </span>
        <span className="dsw-label">{label}</span>
        <span className="dsw-trigger-caret" aria-hidden="true">
          <IconChevronDown size={13} />
        </span>
      </button>
      {mounted && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
}
