import type { ReactNode } from "react";
import Link from "next/link";
import { Eyebrow } from "./Eyebrow";

export type Crumb = { label: string; href?: string };

/**
 * Plane-style page header. Composes eyebrow + h1 + sub + breadcrumbs + tabs + actions.
 *
 *   <PageHeader
 *     eyebrow="Tasks"
 *     title="Core product"
 *     sub="Switch projects at the top to load that project's board and workflow."
 *     breadcrumbs={[{ label: "Tasks" }]}
 *     tabs={[
 *       { label: "Overview", href: "/projects/core" },
 *       { label: "Work items", active: true, count: 112 },
 *       { label: "Cycles" },
 *       { label: "Modules" },
 *     ]}
 *     actions={<Button>Add work item</Button>}
 *   />
 */
export function PageHeader({
  eyebrow,
  title,
  sub,
  breadcrumbs,
  tabs,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  sub?: ReactNode;
  breadcrumbs?: Crumb[];
  tabs?: { label: string; href?: string; active?: boolean; count?: number; onClick?: () => void }[];
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="row">
        <div>
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="crumbs" aria-label="Breadcrumb">
              {breadcrumbs.map((c, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
                  {i < breadcrumbs.length - 1 && <span className="sep">/</span>}
                </span>
              ))}
            </nav>
          )}
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <h1>{title}</h1>
          {sub && <p className="sub">{sub}</p>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>

      {tabs && tabs.length > 0 && (
        <nav className="page-tabs" aria-label="Page sections">
          {tabs.map((t, i) => {
            const content = (
              <>
                {t.label}
                {typeof t.count === "number" && <span className="count">{t.count}</span>}
              </>
            );
            if (t.href) {
              return (
                <Link key={i} href={t.href} className={t.active ? "active" : ""}>
                  {content}
                </Link>
              );
            }
            return (
              <button key={i} type="button" className={t.active ? "active" : ""} onClick={t.onClick}>
                {content}
              </button>
            );
          })}
        </nav>
      )}
    </header>
  );
}