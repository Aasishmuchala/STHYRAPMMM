"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconCheck } from "@/components/icons";

type Step = { done: boolean; label: string; why: string; href: string; cta: string };

export function GettingStarted({
  aiConnected,
  hasClients,
  hasTeam,
  hasBriefs,
  canSeeFinances,
  firstName = "there",
}: {
  aiConnected: boolean;
  hasClients: boolean;
  hasTeam: boolean;
  hasBriefs: boolean;
  canSeeFinances: boolean;
  firstName?: string;
}) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => { setHidden(localStorage.getItem("sthyra-gs-dismissed") === "1"); }, []);

  const steps: Step[] = [
    { done: aiConnected, label: "Turn on your AI assistant", why: "It reads your numbers and writes your morning brief.", href: "/settings", cta: "Connect" },
    ...(canSeeFinances ? [{ done: hasClients, label: "Add your clients & leads", why: "Your pipeline lives here — projects and invoices hang off it.", href: "/clients", cta: "Add" }] : []),
    { done: hasTeam, label: "Invite your team", why: "Each person gets their own login, scoped to their division.", href: "/settings", cta: "Invite" },
    { done: hasBriefs, label: "Set a goal for each division", why: "So the assistant can flag when you're off target.", href: "/divisions/studios", cta: "Set goal" },
  ];
  const done = steps.filter((s) => s.done).length;

  if (hidden || done === steps.length) return null;

  function dismiss() { localStorage.setItem("sthyra-gs-dismissed", "1"); setHidden(true); }

  return (
    <section className="onboard panel" aria-label="Getting started">
      {/* Left: teal hero */}
      <div className="onboard-hero">
        <div className="onboard-art-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/onboarding-stack.png" alt="" className="onboard-art" />
        </div>
        <div className="onboard-hero-body">
          <h3>Let&apos;s get you set up, {firstName}</h3>
          <p>A few quick steps to unlock the power of STHYRA.</p>
          <Link href="/settings" className="onboard-guide">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M4 5h9a3 3 0 013 3v11a2.5 2.5 0 00-2.5-2.5H4z" /><path d="M20 5h-1a3 3 0 00-3 3v11a2.5 2.5 0 012.5-2.5H20z" /></svg>
            View guide
          </Link>
        </div>
      </div>

      {/* Right: checklist */}
      <div className="onboard-list">
        <div className="onboard-progress-row">
          <span className="onboard-progress-label">{done} of {steps.length} completed</span>
          <button className="onboard-dismiss" onClick={dismiss}>Dismiss</button>
        </div>
        <div className="onboard-bar"><span style={{ width: `${(done / steps.length) * 100}%` }} /></div>
        <ul className="onboard-steps">
          {steps.map((s, i) => (
            <li className={`onboard-step ${s.done ? "done" : ""}`} key={i}>
              <span className="onboard-step-ic">{s.done ? <IconCheck size={14} /> : i + 1}</span>
              <div className="onboard-step-text">
                <div className="onboard-step-label">{s.label}</div>
                {!s.done && <div className="onboard-step-why">{s.why}</div>}
              </div>
              {s.done ? <span className="onboard-done">Done</span> : <Link href={s.href} className="onboard-cta">{s.cta} →</Link>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
