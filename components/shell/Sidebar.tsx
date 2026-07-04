"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconHome, IconTasks, IconFinance, IconDoc, IconClients,
  IconStudios, IconDigital, IconConstruction, IconLivingTwin, IconSettings, IconSparkle, IconLayers, IconPeople, IconChevronDown,
} from "@/components/icons";
import { FiClock, FiTarget, FiZap, FiUserCheck, FiTrendingUp } from "react-icons/fi";
import { DivisionSwitcher } from "./DivisionSwitcher";

type Nav = { slug: string; name: string };
type Item = { href: string; label: string; Icon: React.ComponentType<{ size?: number }>; show: boolean };

const divisionMeta: Record<string, { Icon: (p: { size?: number }) => React.ReactElement; dot: string }> = {
  studios: { Icon: IconStudios, dot: "var(--positive)" },
  digital: { Icon: IconDigital, dot: "var(--positive)" },
  construction: { Icon: IconConstruction, dot: "var(--warning)" },
  living_twin: { Icon: IconLivingTwin, dot: "var(--accent)" },
};

function NavGroup({
  title,
  items,
  activeHref,
  onNavigate,
}: {
  title: string;
  items: Item[];
  activeHref: (href: string) => boolean;
  onNavigate?: () => void;
}) {
  const visible = items.filter((i) => i.show);
  // Keep a group open if it holds the current route.
  const hasActive = visible.some((i) => activeHref(i.href));
  const [open, setOpen] = useState(true);
  const isOpen = open || hasActive;
  if (visible.length === 0) return null;

  return (
    <nav className="nav-group" aria-label={title}>
      <button
        type="button"
        className="seg label nav-seg-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={isOpen}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", cursor: "pointer", font: "inherit" }}
      >
        <span>{title}</span>
        <span style={{ display: "inline-flex", transform: isOpen ? "none" : "rotate(-90deg)", transition: "transform .15s ease", opacity: 0.6 }}>
          <IconChevronDown size={13} />
        </span>
      </button>
      {isOpen && visible.map((i) => {
        const active = activeHref(i.href);
        return (
          <Link key={i.href} href={i.href} onClick={onNavigate} className={`nav-item ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
            <i.Icon size={16} />{i.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({
  divisions,
  canSeeFinances,
  canSeePeople = canSeeFinances,
  isOwner = false,
  onNavigate,
}: {
  divisions: Nav[];
  canSeeFinances: boolean;
  canSeePeople?: boolean;
  isOwner?: boolean;
  onNavigate?: () => void;
}) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  const groups: { title: string; items: Item[] }[] = [
    {
      title: "Work",
      items: [
        { href: "/tasks", label: "Tasks", Icon: IconTasks, show: true },
        { href: "/roadmap", label: "Roadmap", Icon: FiTarget, show: true },
        { href: "/projects", label: "Projects", Icon: IconLayers, show: true },
        { href: "/timesheet", label: "Timesheet", Icon: FiClock, show: true },
      ],
    },
    {
      title: "Sales & CRM",
      items: [
        { href: "/sales", label: "Sales", Icon: FiTrendingUp, show: true },
        { href: "/clients", label: "Clients", Icon: IconClients, show: canSeeFinances },
      ],
    },
    {
      title: "Team",
      items: [
        { href: "/people", label: "People", Icon: IconPeople, show: canSeePeople },
        { href: "/attendance", label: "Attendance", Icon: FiUserCheck, show: true },
      ],
    },
    {
      title: "Finance",
      items: [{ href: "/finances", label: "Finances", Icon: IconFinance, show: canSeeFinances }],
    },
    {
      title: "Library",
      items: [
        { href: "/documents", label: "Documents", Icon: IconDoc, show: true },
        { href: "/reports", label: "Reports", Icon: FiZap, show: true },
      ],
    },
  ];

  return (
    <aside className="side" aria-label="Primary navigation">
      <div className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sthyra-mark.png" alt="Sthyra" className="brand-mark-img" />
        <div>
          <div className="name">Sthyra</div>
          <div className="sub">Redefining Reality</div>
        </div>
      </div>

      <div style={{ padding: "4px 14px 10px" }}>
        <DivisionSwitcher divisions={divisions} canPickAll={isOwner} />
      </div>

      <nav className="nav-group" aria-label="Home">
        <Link href="/" onClick={onNavigate} className={`nav-item ${active("/") ? "active" : ""}`} aria-current={active("/") ? "page" : undefined}>
          <IconHome size={16} />Home · Inbox
        </Link>
      </nav>

      {groups.map((g) => (
        <NavGroup key={g.title} title={g.title} items={g.items} activeHref={active} onNavigate={onNavigate} />
      ))}

      {divisions.length > 0 && (
        <nav className="nav-group" aria-label="Your teams">
          <div className="seg label">Your teams</div>
          {divisions.map((d) => {
            const meta = divisionMeta[d.slug] ?? { Icon: IconLivingTwin, dot: "var(--accent)" };
            const Icon = meta.Icon;
            const href = `/divisions/${d.slug}`;
            return (
              <Link key={d.slug} href={href} onClick={onNavigate} className={`nav-item ${active(href) ? "active" : ""}`} aria-current={active(href) ? "page" : undefined}>
                <Icon size={16} />
                {d.name}
                <span className="dot" style={{ background: meta.dot }} />
              </Link>
            );
          })}
        </nav>
      )}

      <nav className="nav-group" style={{ marginTop: "auto" }} aria-label="Settings">
        {(isOwner || canSeeFinances) && (
          <Link href="/automations" onClick={onNavigate} className={`nav-item ${active("/automations") ? "active" : ""}`} aria-current={active("/automations") ? "page" : undefined}>
            <FiZap size={16} />Automations
          </Link>
        )}
        {isOwner && (
          <Link href="/ai" onClick={onNavigate} className={`nav-item ${active("/ai") ? "active" : ""}`} aria-current={active("/ai") ? "page" : undefined}>
            <IconSparkle size={16} />Assistant
          </Link>
        )}
        <Link href="/settings" onClick={onNavigate} className={`nav-item ${active("/settings") ? "active" : ""}`} aria-current={active("/settings") ? "page" : undefined}>
          <IconSettings size={16} />Settings
        </Link>
      </nav>
    </aside>
  );
}
