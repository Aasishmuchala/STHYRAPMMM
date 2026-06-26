import type { ReactNode } from "react";

/**
 * Small-caps page label, used above h1 titles.
 * Visually identical to a tracking-heavy label, mono family, faint color.
 */
export function Eyebrow({ children, mono = true }: { children: ReactNode; mono?: boolean }) {
  return (
    <span className="eyebrow" style={mono ? undefined : { fontFamily: "var(--font-inter), sans-serif" }}>
      {children}
    </span>
  );
}