"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconChevronDown,
  IconClients,
  IconConstruction,
  IconDigital,
  IconDoc,
  IconFinance,
  IconLayers,
  IconLivingTwin,
  IconPeople,
  IconSettings,
  IconSparkle,
  IconStudios,
  IconTasks,
} from "@/components/icons";
import { FiClock, FiHome, FiPlus, FiTarget, FiTrendingUp, FiUserCheck, FiZap } from "react-icons/fi";
import { DivisionSwitcher } from "./DivisionSwitcher";

type Nav = { slug: string; name: string };
type Item = { href: string; label: string; Icon: React.ComponentType<{ size?: number }>; show: boolean };
type Group = {
  title: string;
  items: Item[];
  CardIcon: React.ComponentType<{ size?: number }>;
  defaultOpen?: boolean;
};

const divisionMeta: Record<string, { Icon: (p: { size?: number }) => React.ReactElement; start: string; end: string; tint: string }> = {
  studios: { Icon: IconStudios, start: "#0f766e", end: "#115e59", tint: "rgba(255,255,255,0.14)" },
  digital: { Icon: IconDigital, start: "#15803d", end: "#0f766e", tint: "rgba(255,255,255,0.14)" },
  construction: { Icon: IconConstruction, start: "#c2410c", end: "#ea580c", tint: "rgba(255,255,255,0.14)" },
  living_twin: { Icon: IconLivingTwin, start: "#1d4ed8", end: "#2563eb", tint: "rgba(255,255,255,0.14)" },
};

function getDivisionMeta(slug: string, name: string) {
  const key = slug.toLowerCase();
  if (divisionMeta[key]) return divisionMeta[key];

  const normalized = name.toLowerCase();
  if (normalized.includes("construction")) return { Icon: IconConstruction, start: "#c2410c", end: "#ea580c", tint: "rgba(255,255,255,0.14)" };
  if (normalized.includes("digital")) return { Icon: IconDigital, start: "#15803d", end: "#0f766e", tint: "rgba(255,255,255,0.14)" };
  if (normalized.includes("studio")) return { Icon: IconStudios, start: "#0f766e", end: "#115e59", tint: "rgba(255,255,255,0.14)" };
  return { Icon: IconLivingTwin, start: "#1d4ed8", end: "#2563eb", tint: "rgba(255,255,255,0.14)" };
}

function NavGroup({
  title,
  items,
  CardIcon,
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

      {isOpen ? (
        <nav className="side-card nav-card-list" aria-label={title}>
          {visible.map((item, index) => {
            const isActive = activeHref(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
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
      ) : (
        <button type="button" className="side-card side-card-compact nav-card-toggle" onClick={() => setOpen(true)} aria-label={`Open ${title}`}>
          <span className="card-icon card-icon-soft">
            <CardIcon size={16} />
          </span>
          <span className="nav-card-title">{title}</span>
          <span className="nav-card-arrow">
            <IconChevronDown size={15} style={{ transform: "rotate(-90deg)" }} />
          </span>
        </button>
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
  onNavigate,
}: {
  divisions: Nav[];
  canSeeFinances: boolean;
  canSeePeople?: boolean;
  isOwner?: boolean;
  initials: string;
  onNavigate?: () => void;
}) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  const groups: Group[] = [
    {
      title: "Work",
      CardIcon: IconTasks,
      defaultOpen: true,
      items: [
        { href: "/tasks", label: "Tasks", Icon: IconTasks, show: true },
        { href: "/roadmap", label: "Roadmap", Icon: FiTarget, show: true },
        { href: "/projects", label: "Projects", Icon: IconLayers, show: true },
        { href: "/timesheet", label: "Timesheet", Icon: FiClock, show: true },
      ],
    },
    {
      title: "Sales & CRM",
      CardIcon: IconClients,
      items: [
        { href: "/sales", label: "Sales", Icon: FiTrendingUp, show: true },
        { href: "/clients", label: "Clients", Icon: IconClients, show: canSeeFinances },
      ],
    },
    {
      title: "Team",
      CardIcon: IconPeople,
      items: [
        { href: "/people", label: "People", Icon: IconPeople, show: canSeePeople },
        { href: "/attendance", label: "Attendance", Icon: FiUserCheck, show: true },
      ],
    },
    {
      title: "Finance",
      CardIcon: IconFinance,
      items: [{ href: "/finances", label: "Finances", Icon: IconFinance, show: canSeeFinances }],
    },
    {
      title: "Library",
      CardIcon: IconDoc,
      items: [
        { href: "/documents", label: "Documents", Icon: IconDoc, show: true },
        { href: "/reports", label: "Reports", Icon: FiZap, show: true },
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
          <Link href="/" onClick={onNavigate} className={`side-card nav-item nav-home-link ${active("/") ? "active" : ""}`} aria-current={active("/") ? "page" : undefined}>
            <span className="card-icon card-icon-soft">
              <FiHome size={18} />
            </span>
            <span>Home &middot; Inbox</span>
          </Link>
        </nav>

        <div className="side-sections">
          {groups.map((group) => (
            <NavGroup key={group.title} {...group} activeHref={active} onNavigate={onNavigate} />
          ))}
        </div>

        {divisions.length > 0 && (
          <section className="sidebar-section" aria-label="Your teams">
            <div className="side-card teams-card">
              <div className="teams-head">
                <div className="teams-label">Your Teams</div>
                <button type="button" className="teams-add" aria-label="Add team">
                  <FiPlus size={14} />
                </button>
              </div>
              <nav className="teams-list">
                {divisions.map((division, index) => {
                  const meta = getDivisionMeta(division.slug, division.name);
                  const href = `/divisions/${division.slug}`;
                  const Icon = meta.Icon;
                  const teamStyle = {
                    "--team-start": meta.start,
                    "--team-end": meta.end,
                    "--team-tint": meta.tint,
                  } as CSSProperties;
                  return (
                    <Link
                      key={division.slug}
                      href={href}
                      onClick={onNavigate}
                      className={`nav-item team-item ${active(href) ? "active" : ""}`}
                      aria-current={active(href) ? "page" : undefined}
                      style={teamStyle}
                    >
                      <span className="card-icon team-icon">
                        <Icon size={16} />
                      </span>
                      <span>{division.name}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </section>
        )}
      </div>

      <div className="side-bottom">
        <nav className="side-card utility-card" aria-label="Utilities">
          {(isOwner || canSeeFinances) && (
            <Link href="/automations" onClick={onNavigate} className={`nav-item utility-item ${active("/automations") ? "active" : ""}`} aria-current={active("/automations") ? "page" : undefined}>
              <FiZap size={16} />
              <span>Automations</span>
              <span className="nav-card-arrow">
                <IconChevronDown size={15} style={{ transform: "rotate(-90deg)" }} />
              </span>
            </Link>
          )}
          {isOwner && (
            <Link href="/ai" onClick={onNavigate} className={`nav-item utility-item ${active("/ai") ? "active" : ""}`} aria-current={active("/ai") ? "page" : undefined}>
              <IconSparkle size={16} />
              <span>Assistant</span>
              <span className="nav-card-arrow">
                <IconChevronDown size={15} style={{ transform: "rotate(-90deg)" }} />
              </span>
            </Link>
          )}
          <Link href="/settings" onClick={onNavigate} className={`nav-item utility-item ${active("/settings") ? "active" : ""}`} aria-current={active("/settings") ? "page" : undefined}>
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
            <div className="profile-name">Workspace User</div>
            <div className="profile-role">{isOwner ? "Super Admin" : canSeeFinances ? "Admin" : "Member"}</div>
          </div>
          <span className="nav-card-arrow">
            <IconChevronDown size={15} style={{ transform: "rotate(-90deg)" }} />
          </span>
        </div>
      </div>
    </aside>
  );
}
