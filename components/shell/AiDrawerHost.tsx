"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { IconSparkle, IconX } from "@/components/icons";

/**
 * Global AI drawer host, mounted once in <AppShell>. Opens via:
 *   - window event "sthyra:open-ai" (top-bar AI button)
 *   - future in-page "Ask AI about this X" buttons
 *
 * Full implementation lives in components/ai/AiDrawerSurface.tsx (Phase 4).
 * This is a thin shell wrapper that holds the open-state and mounts the surface.
 */
export function AiDrawerHost() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  // Don't double-mount the drawer on the full-screen /ai route.
  const hideOnAi = path === "/ai";

  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener("sthyra:open-ai", on);
    return () => window.removeEventListener("sthyra:open-ai", on);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (hideOnAi) return null;
  if (!open) return null;

  return (
    <div className="ai-drawer-overlay" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <aside className="ai-drawer" role="dialog" aria-label="Assistant">
        <div className="ai-drawer-head">
          <div className="title">
            <IconSparkle size={16} />
            Assistant <span className="model">Opus 4.8</span>
          </div>
          <button className="btn-icon" aria-label="Close" onClick={() => setOpen(false)}>
            <IconX size={15} />
          </button>
        </div>
        <div className="ai-drawer-body">
          <div className="ai-drawer-empty">
            The assistant surface ships in the next phase. The drawer wiring, animation, and shell are live.
          </div>
        </div>
        <div className="ai-drawer-foot">
          <div className="ai-composer">
            <textarea placeholder="Ask AI about your work…" disabled />
            <div className="hints">
              <span><kbd>@</kbd> for context</span>
              <span><kbd>/</kbd> for commands</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}