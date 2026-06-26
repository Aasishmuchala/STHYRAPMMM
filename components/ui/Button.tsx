import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

type Variant = "primary" | "ghost" | "danger" | "icon";
type Size = "sm" | "md";

/**
 * Button primitive. Wraps the existing class-based `.btn` / `.btn-ghost` / `.btn-danger` / `.iconbtn`
 * styles so new screens consume a typed API instead of re-stamping classNames.
 *
 * Pass `href` to render an anchor (Link) instead of a button. All other props forward.
 */
export function Button({
  variant = "primary",
  size = "md",
  href,
  children,
  className,
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  href?: string;
  children: ReactNode;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  const cls = [
    variant === "primary" ? "btn" : variant === "ghost" ? "btn-ghost" : variant === "danger" ? "btn-danger" : "btn-icon",
    size === "sm" ? "btn-sm" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Link href={href} className={cls} style={variant === "icon" ? { width: 32, height: 32, display: "inline-grid", placeItems: "center", padding: 0 } : undefined}>
        {children}
      </Link>
    );
  }
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}