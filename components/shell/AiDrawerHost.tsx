"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getAiDrawerData } from "@/app/ai/actions";
import { IconX } from "@/components/icons";
import { AiConsole, type Pending, type Run } from "@/components/ai/AiConsole";

/**
 * Global AI drawer host, mounted once in <AppShell>. Opens via:
 *   - window event "sthyra:open-ai" (top-bar AI button)
 *   - future in-page "Ask AI about this X" buttons
 *
 * Renders the same AiConsole that lives at /ai — single source of truth for the
 * assistant surface. Server-side data is loaded by /ai/page.tsx and passed
 * down via the props below (or defaults if the drawer is opened before /ai
 * has ever been visited).
 */
export type AiDrawerData = {
  configured: boolean;
  isOwner: boolean;
  runs: Run[];
  pending: Pending[];
  latestBrief: Run | null;
  spendToday: number;
  spendMonth: number;
  runCount: number;
};

const EMPTY: AiDrawerData = {
  configured: false,
  isOwner: false,
  runs: [],
  pending: [],
  latestBrief: null,
  spendToday: 0,
  spendMonth: 0,
  runCount: 0,
};

export function AiDrawerHost({ initialData }: { initialData?: AiDrawerData }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [liveData, setLiveData] = useState<AiDrawerData | null>(null);
  const data = liveData ?? initialData ?? EMPTY;

  async function refreshData() {
    const next = await getAiDrawerData();
    if ("error" in next) return;
    setLiveData(next);
  }

  // Don't double-mount the drawer on the full-screen /ai route.
  const hideOnAi = path === "/ai";

  useEffect(() => {
    const on = () => {
      setOpen(true);
      void refreshData();
    };
    window.addEventListener("sthyra:open-ai", on);
    return () => window.removeEventListener("sthyra:open-ai", on);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Allow any AiConsole mutation (router.refresh in the console) to push the
  // fresh data back up to the drawer so the header pill shows the latest
  // pending count, spend, etc. without a full reload.
  useEffect(() => {
    function onUpdated(e: Event) {
      const detail = (e as CustomEvent<Partial<AiDrawerData>>).detail;
      if (!detail) return;
      setLiveData((prev) => ({ ...(prev ?? initialData ?? EMPTY), ...detail }));
    }
    window.addEventListener("sthyra:ai-data-updated", onUpdated as EventListener);
    return () => window.removeEventListener("sthyra:ai-data-updated", onUpdated as EventListener);
  }, [initialData]);

  if (hideOnAi) return null;
  if (!open) return null;

  return (
    <div
      className="ai-drawer-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
    >
      <aside className="ai-drawer" data-testid="ai-drawer" role="dialog" aria-label="Assistant">
        <div className="ai-drawer-head">
          <div className="title">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ai-agent.png" srcSet="/ai-agent.png 1x, /ai-agent@2x.png 2x" width={24} height={24} alt="" className="ai-avatar" draggable={false} />
            Assistant <span className="model">Opus 4.8</span>
          </div>
          <button className="btn-icon" aria-label="Close" onClick={() => setOpen(false)}>
            <IconX size={15} />
          </button>
        </div>
        <div className="ai-drawer-body ai-drawer-body--chat">
          <AiConsole
            configured={data.configured}
            isOwner={data.isOwner}
            runs={data.runs}
            pending={data.pending}
            latestBrief={data.latestBrief}
            spendToday={data.spendToday}
            spendMonth={data.spendMonth}
            runCount={data.runCount}
            variant="drawer"
          />
        </div>
      </aside>
    </div>
  );
}
