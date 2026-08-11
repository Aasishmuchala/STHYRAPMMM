"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Warm up the most-visited routes after the browser is idle. This is the
// "aggressive" prefetch the user asked for — the four routes the user is most
// likely to land on next get their RSC payload in flight before they click.
const PREFETCH_TARGETS = [
  "/tasks",
  "/projects",
  "/finances",
  "/attendance",
  "/people",
  "/clients",
];

export function IdlePrefetch() {
  const router = useRouter();

  useEffect(() => {
    const idle = (cb: () => void) => {
      const ric = (
        window as typeof window & {
          requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        }
      ).requestIdleCallback;
      if (typeof ric === "function") ric(cb, { timeout: 2000 });
      else window.setTimeout(cb, 1500);
    };
    idle(() => {
      for (const href of PREFETCH_TARGETS) router.prefetch(href);
    });
  }, [router]);

  return null;
}
