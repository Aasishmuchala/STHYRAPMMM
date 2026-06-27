"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { askAi, generateBrief } from "@/app/ai/actions";
import { beginToast, finishToast } from "@/lib/client-toast";

type AskResult = {
  ok: true;
  text: string;
  actions: { tool: string; ok: boolean; detail: string }[];
  cost: number;
};

/**
 * Shared composer row: textarea, send button, brief button, and hints.
 * Used by both the /ai full-screen console and the global drawer.
 */
export function AiComposer({
  configured,
  spendToday,
  spendMonth,
  runCount,
  onAnswer,
  compact = false,
}: {
  configured: boolean;
  spendToday: number;
  spendMonth: number;
  runCount: number;
  onAnswer: (r: AskResult | { error: string }) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<null | "ask" | "brief">(null);
  const [err, setErr] = useState<string | null>(null);

  void spendToday;
  void spendMonth;
  void runCount;

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setErr(null);
    setBusy("ask");
    const toastId = beginToast("Asking the assistant...");
    const res = await askAi(text);
    setBusy(null);
    if ("error" in res) {
      finishToast(res, { id: toastId, success: "" });
      setErr(res.error);
      onAnswer({ error: res.error });
      return;
    }
    finishToast(res, { id: toastId, success: "Assistant response ready." });
    setInput("");
    onAnswer(res);
    router.refresh();
  }

  async function brief() {
    if (busy) return;
    setErr(null);
    setBusy("brief");
    const toastId = beginToast("Generating morning brief...");
    const res = await generateBrief();
    setBusy(null);
    if ("error" in res) {
      finishToast(res, { id: toastId, success: "" });
      setErr(res.error);
      onAnswer({ error: res.error });
      return;
    }
    finishToast(res, { id: toastId, success: "Morning brief generated." });
    onAnswer({ ok: true, text: res.text, actions: [], cost: res.cost });
    router.refresh();
  }

  return (
    <div className="ai-composer">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
        }}
        placeholder={
          compact
            ? "Ask about your work..."
            : "e.g. Summarise what needs attention in Construction this week, and create follow-up tasks."
        }
        rows={compact ? 2 : 3}
        disabled={!configured || busy !== null}
        style={compact ? { minHeight: 44 } : undefined}
      />
      {err && <div className="form-err" style={{ marginTop: 6, fontSize: 12 }}>{err}</div>}
      <div className="row">
        <button type="button" className="btn" onClick={send} disabled={!configured || busy !== null}>
          {busy === "ask" ? "Thinking..." : "Ask"}
        </button>
        <button type="button" className="btn-ghost" onClick={brief} disabled={!configured || busy !== null}>
          {busy === "brief" ? "Writing..." : "Morning brief"}
        </button>
      </div>
      <div className="hints">
        <span><kbd>Ctrl</kbd><kbd>Enter</kbd> send</span>
        <span><kbd>@</kbd> for context</span>
        <span><kbd>/</kbd> for commands</span>
      </div>
    </div>
  );
}
