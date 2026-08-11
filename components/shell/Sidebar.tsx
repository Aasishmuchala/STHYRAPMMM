"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconChevronDown,
  IconClients,
  IconClock,
  IconDoc,
  IconFinance,
  IconHome,
  IconLayers,
  IconPeople,
  IconSettings,
  IconSparkle,
  IconTarget,
  IconTasks,
  IconTrendingUp,
  IconUserCheck,
  IconZap,
} from "@/components/icons";
import { DivisionSwitcher } from "./DivisionSwitcher";

type Nav = { slug: string; name: string };
type Item = { href: string; label: string; Icon: React.ComponentType<{ size?: number }>; show: boolean };
type Group = {
  title: string;
  items: Item[];
  defaultOpen?: boolean;
};

function NavGroup({
  title,
  items,
  activeHref,
  defaultOpen = false,
  onNavigate,
}: Group & {
  activeHref: (href: string) => boolean;
  onNavigate?: () => void;
}) {
  const visible = items.filter((item) => item.show);
  const hasActive = visible.some((item) => activeHref(item.href));
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = open || hasActive;

  if (visible.length === 0) return null;

  return (
    <section className={`sidebar-section ${isOpen ? "open" : "closed"}`} aria-label={title}>
      <button type="button" className="nav-seg-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={isOpen}>
        <span>{title}</span>
        <span className="nav-seg-caret" style={{ transform: isOpen ? "none" : "rotate(-90deg)" }}>
          <IconChevronDown size={13} />
        </span>
      </button>

      {isOpen && (
        <nav className="side-card nav-card-list" aria-label={title}>
          {visible.map((item, index) => {
            const isActive = activeHref(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                onClick={onNavigate}
                className={`nav-item ${isActive ? "active" : ""}${index < visible.length - 1 ? " nav-item-border" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <item.Icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </section>
  );
}

export function Sidebar({
  divisions,
  canSeeFinances,
  canSeePeople = canSeeFinances,
  isOwner = false,
  initials,
  userName = "Workspace User",
  userRoleLabel = isOwner ? "Super Admin" : canSeeFinances ? "Admin" : "Member",
  onNavigate,
}: {
  divisions: Nav[];
  canSeeFinances: boolean;
  canSeePeople?: boolean;
  isOwner?: boolean;
  initials: string;
  userName?: string;
  userRoleLabel?: string;
  onNavigate?: () => void;
}) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  const groups: Group[] = [
    {
      title: "Work",
      defaultOpen: true,
      items: [
        { href: "/tasks", label: "Tasks", Icon: IconTasks, show: true },
        { href: "/roadmap", label: "Roadmap", Icon: IconTarget, show: true },
        { href: "/projects", label: "Projects", Icon: IconLayers, show: true },
        { href: "/timesheet", label: "Timesheet", Icon: IconClock, show: true },
      ],
    },
    {
      title: "Sales & CRM",
      items: [
        { href: "/sales", label: "Sales", Icon: IconTrendingUp, show: true },
        { href: "/clients", label: "Clients", Icon: IconClients, show: canSeeFinances },
      ],
    },
    {
      title: "Team",
      items: [
        { href: "/people", label: "People", Icon: IconPeople, show: canSeePeople },
        { href: "/attendance", label: "Attendance", Icon: IconUserCheck, show: true },
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
        { href: "/reports", label: "Reports", Icon: IconZap, show: true },
      ],
    },
  ];

  return (
    <aside className="side" aria-label="Primary navigation">
      <div className="side-top">
        <div className="side-card side-brand-card">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sthyra-mark.png" alt="Sthyra" className="brand-mark-img" />
            <div>
              <div className="name">Sthyra</div>
              <div className="sub">Redefining Reality</div>
            </div>
          </div>
        </div>

        <div className="side-switcher">
          <DivisionSwitcher divisions={divisions} canPickAll={isOwner} />
        </div>

        <nav className="nav-home" aria-label="Home">
          <Link href="/" prefetch={true} onClick={onNavigate} className={`side-card nav-item nav-home-link ${active("/") ? "active" : ""}`} aria-current={active("/") ? "page" : undefined}>
            <span className="card-icon card-icon-soft">
              <IconHome size={18} />
            </span>
            <span>Home &middot; Inbox</span>
          </Link>
        </nav>

        <div className="side-sections">
          {groups.map((group) => (
            <NavGroup key={group.title} {...group} activeHref={active} onNavigate={onNavigate} />
          ))}
        </div>
      </div>

      <div className="side-bottom">
        <nav className="side-card utility-card" aria-label="Utilities">
          {(isOwner || canSeeFinances) && (
            <Link href="/automations" prefetch={true} onClick={onNavigate} className={`nav-item utility-item ${active("/automations") ? "active" : ""}`} aria-current={active("/automations") ? "page" : undefined}>
              <IconZap size={16} />
              <span>Automations</span>
              <span className="nav-card-arrow">
                <IconChevronDown size={15} style={{ transform: "rotate(-90deg)" }} />
              </span>
            </Link>
          )}
          {isOwner && (
            <Link href="/ai" prefetch={true} onClick={onNavigate} className={`nav-item utility-item ${active("/ai") ? "active" : ""}`} aria-current={active("/ai") ? "page" : undefined}>
              <IconSparkle size={16} />
              <span>Assistant</span>
              <span className="nav-card-arrow">
                <IconChevronDown size={15} style={{ transform: "rotate(-90deg)" }} />
              </span>
            </Link>
          )}
          <Link href="/settings" prefetch={true} onClick={onNavigate} className={`nav-item utility-item ${active("/settings") ? "active" : ""}`} aria-current={active("/settings") ? "page" : undefined}>
            <IconSettings size={16} />
            <span>Settings</span>
            <span className="nav-card-arrow">
              <IconChevronDown size={15} style={{ transform: "rotate(-90deg)" }} />
            </span>
          </Link>
        </nav>

        <div className="side-card profile-card" aria-label="Current user">
          <div className="profile-avatar">{initials.slice(0, 1)}</div>
          <div className="profile-copy">
            <div className="profile-name">{userName}</div>
            <div className="profile-role">{userRoleLabel}</div>
          </div>
          <span className="nav-card-arrow">
            <IconChevronDown size={15} style={{ transform: "rotate(-90deg)" }} />
          </span>
        </div>
      </div>
    </aside>
  );
}
