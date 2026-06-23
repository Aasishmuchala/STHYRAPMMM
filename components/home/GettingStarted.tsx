"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconSparkle, IconClients, IconSettings, IconLivingTwin, IconCheck } from "@/components/icons";

type Step = { done: boolean; label: string; why: string; href: string; cta: string; Icon: (p: { size?: number }) => React.ReactElement };

export function GettingStarted({ aiConnected, hasClients, hasTeam, hasBriefs }: { aiConnected: boolean; hasClients: boolean; hasTeam: boolean; hasBriefs: boolean }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => { setHidden(localStorage.getItem("sthyra-gs-dismissed") === "1"); }, []);

  const steps: Step[] = [
    { done: aiConnected, label: "Turn on your AI assistant", why: "It reads your numbers and writes your morning brief.", href: "/settings", cta: "Connect", Icon: IconSparkle },
    { done: hasClients, label: "Add your clients & leads", why: "Your pipeline lives here — projects and invoices hang off it.", href: "/clients", cta: "Add", Icon: IconClients },
    { done: hasTeam, label: "Invite your team", why: "Each person gets their own login, scoped to their division.", href: "/settings", cta: "Invite", Icon: IconSettings },
    { done: hasBriefs, label: "Set a goal for each division", why: "So the assistant can flag when you're off target.", href: "/divisions/studios", cta: "Set", Icon: IconLivingTwin },
  ];
  const done = steps.filter((s) => s.done).length;

  if (hidden || done === steps.length) return null;

  function dismiss() { localStorage.setItem("sthyra-gs-dismissed", "1"); setHidden(true); }

  return (
    <section className="gs" aria-label="Getting started">
      <div className="gs-head">
        <div>
          <div className="gs-title">Get set up</div>
          <div className="gs-sub">A few steps to make this yours. {done} of {steps.length} done.</div>
        </div>
        <button className="gs-dismiss" onClick={dismiss}>Dismiss</button>
      </div>
      <div className="gs-bar"><div className="gs-bar-fill" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <div className="gs-steps">
        {steps.map((s, i) => (
          <div className={`gs-step ${s.done ? "done" : ""}`} key={i}>
            <span className="gs-ic">{s.done ? <IconCheck size={15} /> : <s.Icon size={16} />}</span>
            <div className="gs-text">
              <div className="gs-label">{s.label}</div>
              {!s.done && <div className="gs-why">{s.why}</div>}
            </div>
            {s.done ? <span className="gs-tag">Done</span> : <Link href={s.href} className="gs-cta">{s.cta} →</Link>}
          </div>
        ))}
      </div>
    </section>
  );
}
