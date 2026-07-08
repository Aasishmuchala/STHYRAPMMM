"use client";

import { useEffect, useState } from "react";
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
export function DivisionSwitcher({ divisions, canPickAll = false }: { divisions: Nav[]; canPickAll?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  // Read the cookie after mount. Doing it here (rather than during render) keeps
  // SSR and the first client paint identical — no hydration mismatch — and the
  // server has already scoped this render to the same default company.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveSlug(readCookie(COOKIE));
  }, []);

  const current = divisions.find((d) => d.slug === activeSlug);
  // Mirror the server default (see resolveActiveCompany): owners with no valid
  // selection land on "All companies"; everyone else on their first company.
  const showingAll = canPickAll && !current;
  const selectedSlug = showingAll ? ALL : (current?.slug ?? divisions[0]?.slug ?? null);
  const label = showingAll ? "All companies" : (current?.name ?? divisions[0]?.name ?? "No company");

  function pick(slug: string) {
    document.cookie = `${COOKIE}=${encodeURIComponent(slug)}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    setActiveSlug(slug);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="dsw">
      <button className="pill dsw-trigger" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="dsw-trigger-icon" aria-hidden="true">
          <FiBriefcase size={15} />
        </span>
        <span className="dsw-label">{label}</span>
        <span className="dsw-trigger-caret" aria-hidden="true">
          <IconChevronDown size={13} />
        </span>
      </button>
      {open && (
        <>
          <div className="notif-backdrop" onClick={() => setOpen(false)} />
          <div className="dsw-pop glass" role="menu">
            {canPickAll && (
              <button className={`dsw-item ${showingAll ? "on" : ""}`} onClick={() => pick(ALL)} role="menuitem">All companies</button>
            )}
            {divisions.map((d) => (
              <button key={d.slug} className={`dsw-item ${selectedSlug === d.slug ? "on" : ""}`} onClick={() => pick(d.slug)} role="menuitem">{d.name}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
