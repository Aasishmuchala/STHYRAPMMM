import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "positive" | "warning" | "danger";

/**
 * Compact pill for status, count, priority. Wraps the `.badge` class.
 */
export function Badge({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  title?: string;
}) {
  const cls = tone === "neutral" ? "badge" : `badge ${tone}`;
  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}