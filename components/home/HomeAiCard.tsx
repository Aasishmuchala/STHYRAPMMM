"use client";

import { useState } from "react";
import { IconSparkle } from "@/components/icons";

const CHIPS = ["Show overdue invoices", "Division performance", "Top tasks today", "Cash flow summary"];

/**
 * Home "STHYRA AI Assistant" card (ref image 1). Chips + input hand off to the
 * existing AI drawer via the `sthyra:open-ai` window event (same one the top-bar
 * "Ask AI" pill uses); the prompt rides along in the event detail.
 */
export function HomeAiCard() {
  const [q, setQ] = useState("");

  function ask(prompt: string) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("sthyra:open-ai", { detail: { prompt } }));
  }

  return (
    <div className="ai-card panel">
      <div className="ai-card-head">
        <span className="ai-card-mark"><IconSparkle size={15} /></span>
        <span className="ai-card-title">Sthyra AI Assistant</span>
      </div>
      <p className="ai-card-sub">I can help you with insights, reports, follow-ups, and more.</p>
      <div className="ai-chips">
        {CHIPS.map((c) => (
          <button key={c} type="button" className="ai-chip" onClick={() => ask(c)}>{c}</button>
        ))}
      </div>
      <form
        className="ai-input"
        onSubmit={(e) => { e.preventDefault(); ask(q.trim() || "Give me a summary of today"); setQ(""); }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask anything…"
          aria-label="Ask the assistant"
        />
        <button type="submit" className="ai-send" aria-label="Send">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      </form>
    </div>
  );
}
