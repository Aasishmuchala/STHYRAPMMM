"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconHome, IconTasks, IconFinance, IconDoc, IconClients,
  IconStudios, IconDigital, IconConstruction, IconLivingTwin, IconSettings, IconSparkle, IconLayers,
} from "@/components/icons";
import { DivisionSwitcher } from "./DivisionSwitcher";

type Nav = { slug: string; name: string };

const divisionMeta: Record<string, { Icon: (p: { size?: number }) => React.ReactElement; dot: string }> = {
  studios: { Icon: IconStudios, dot: "var(--positive)" },
  digital: { Icon: IconDigital, dot: "var(--positive)" },
  construction: { Icon: IconConstruction, dot: "var(--warning)" },
  living_twin: { Icon: IconLivingTwin, dot: "var(--accent)" },
};

export function Sidebar({
  divisions,
  canSeeFinances,
  isOwner = false,
  onNavigate,
}: {
  divisions: Nav[];
  canSeeFinances: boolean;
  isOwner?: boolean;
  onNavigate?: () => void;
}) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <aside className="side">
      <div className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sthyra-mark.png" alt="" className="brand-mark-img" />
        <div>
          <div className="name">Sthyra</div>
          <div className="sub">Redefining Reality</div>
        </div>
      </div>

      {/* Workspace pill — lives in the sidebar instead of the top bar (Plane-style). */}
      <div style={{ padding: "4px 14px 10px" }}>
        <DivisionSwitcher divisions={divisions} />
      </div>

      <nav className="nav-group" aria-label="Workspace">
        <Link href="/" onClick={onNavigate} className={`nav-item ${active("/") ? "active" : ""}`} aria-current={active("/") ? "page" : undefined}>
          <IconHome size={16} />Home · Inbox
        </Link>
        <Link href="/tasks" onClick={onNavigate} className={`nav-item ${active("/tasks") ? "active" : ""}`} aria-current={active("/tasks") ? "page" : undefined}>
          <IconTasks size={16} />Tasks
        </Link>
        <Link href="/projects" onClick={onNavigate} className={`nav-item ${active("/projects") ? "active" : ""}`} aria-current={active("/projects") ? "page" : undefined}>
          <IconLayers size={16} />Projects
        </Link>
        <Link href="/clients" onClick={onNavigate} className={`nav-item ${active("/clients") ? "active" : ""}`} aria-current={active("/clients") ? "page" : undefined}>
          <IconClients size={16} />Clients
        </Link>
        {canSeeFinances && (
          <Link href="/finances" onClick={onNavigate} className={`nav-item ${active("/finances") ? "active" : ""}`} aria-current={active("/finances") ? "page" : undefined}>
            <IconFinance size={16} />Finances
          </Link>
        )}
        <Link href="/documents" onClick={onNavigate} className={`nav-item ${active("/documents") ? "active" : ""}`} aria-current={active("/documents") ? "page" : undefined}>
          <IconDoc size={16} />Documents
        </Link>
      </nav>

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