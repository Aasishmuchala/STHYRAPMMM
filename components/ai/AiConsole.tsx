"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { askAi, generateBrief, approvePending, rejectPending } from "@/app/ai/actions";
import { beginToast, finishToast } from "@/lib/client-toast";
import { fmtInr } from "@/lib/ai/cost";
import { IconSparkle, IconCheck, IconX } from "@/components/icons";

export type Run = {
  id: string; purpose: string; model: string; input_tokens: number; output_tokens: number;
  cost_inr: number; prompt: string | null; response: string | null;
  actions: unknown; status: string; error: string | null; created_at: string;
};
export type Pending = {
  id: string; kind: string; summary: string; payload: unknown; status: string; created_at: string;
};

type AskResult = { ok: true; text: string; actions: { tool: string; ok: boolean; detail: string }[]; cost: number };

function when(iso: string): string {
  try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso?.slice(0, 16) ?? ""; }
}

export function AiConsole({
  configured, isOwner, runs, pending, latestBrief, spendToday, spendMonth, runCount,
}: {
  configured: boolean; isOwner: boolean;
  runs: Run[]; pending: Pending[]; latestBrief: Run | null;
  spendToday: number; spendMonth: number; runCount: number;
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<null | "ask" | "brief">(null);
  const [err, setErr] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AskResult | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setErr(null); setBusy("ask");
    const toastId = beginToast("Asking the assistant...");
    const res = await askAi(text);
    setBusy(null);
    if (!finishToast(res, { id: toastId, success: "Assistant response ready." })) { setErr(res.error); return; }
    setAnswer(res); setInput("");
    router.refresh();
  }

  async function brief() {
    if (busy) return;
    setErr(null); setBusy("brief");
    const toastId = beginToast("Generating morning brief...");
    const res = await generateBrief();
    setBusy(null);
    if (!finishToast(res, { id: toastId, success: "Morning brief generated." })) { setErr(res.error); return; }
    router.refresh();
  }

  async function approve(id: string) {
    const toastId = beginToast("Approving action...");
    const res = await approvePending(id);
    if (!finishToast(res, { id: toastId, success: "Action approved." })) { setErr(res.error); return; }
    router.refresh();
  }
  async function reject(id: string) {
    const toastId = beginToast("Rejecting action...");
    const res = await rejectPending(id);
    if (!finishToast(res, { id: toastId, success: "Action rejected." })) { setErr(res.error); return; }
    router.refresh();
  }

  return (
    <div className="ai-wrap">
      {!configured && (
        <div className="ai-banner">
          <strong>Assistant not yet connected.</strong> Add your Omega API key in <a className="link" href="/settings">Settings → AI Assistant</a> and use <em>Test</em> to verify it.
        </div>
      )}

      <div className="ai-grid">
        <section className="set-card">
          <h3><IconSparkle size={16} /> Ask the assistant</h3>
          <p className="sub">It reads your live workspace (your divisions only), can create tasks and draft notes automatically, and proposes any money or irreversible action for your approval. Model: <span className="mono">claude-opus-4-8</span>.</p>

          <textarea
            className="input textarea"
            placeholder="e.g. Summarise what needs attention in Construction this week, and create follow-up tasks."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send(); }}
            rows={3}
            disabled={!configured || busy === "ask"}
          />
          {err && <div className="form-err" style={{ marginTop: 10 }}>{err}</div>}

          <div className="ai-actions">
            <button className="btn" onClick={send} disabled={!configured || busy !== null}>
              {busy === "ask" ? "Thinking…" : "Ask"}
            </button>
            <button className="btn-ghost" onClick={brief} disabled={!configured || busy !== null}>
              {busy === "brief" ? "Writing…" : "Generate morning brief"}
            </button>
            <span className="ai-spend mono">Today {fmtInr(spendToday)} · Month {fmtInr(spendMonth)} · {runCount} runs</span>
          </div>

          {answer && (
            <div className="ai-answer">
              {answer.text && <div className="ai-text">{answer.text}</div>}
              {answer.actions.length > 0 && (
                <div className="ai-acts">
                  {answer.actions.map((a, i) => (
                    <span key={i} className={`ai-act ${a.ok ? "ok" : "no"}`}>
                      {a.ok ? <IconCheck size={12} /> : <IconX size={12} />}{a.detail}
                    </span>
                  ))}
                </div>
              )}
              <div className="ai-cost mono">Cost {fmtInr(answer.cost)}</div>
            </div>
          )}
        </section>

        <section className="set-card">
          <h3>Morning brief</h3>
          {latestBrief ? (
            <>
              <div className="ai-brief">{latestBrief.response}</div>
              <div className="ai-cost mono">{when(latestBrief.created_at)} · {fmtInr(Number(latestBrief.cost_inr))}</div>
            </>
          ) : (
            <p className="sub">No brief yet. Hit <strong>Generate morning brief</strong> to get today&apos;s ranked priorities.</p>
          )}
        </section>
      </div>

      {pending.length > 0 && (
        <section className="set-card">
          <h3>Needs your approval <span className="ai-count">{pending.length}</span></h3>
          <p className="sub">Money or irreversible actions the assistant proposed. Nothing happens until you approve.</p>
          {pending.map((p) => (
            <div key={p.id} className="ai-pend">
              <div className="grow">
                <div className="ai-pend-kind mono">{p.kind}</div>
                <div className="ai-pend-sum">{p.summary}</div>
              </div>
              <button className="btn" onClick={() => approve(p.id)}><IconCheck size={14} /> Approve</button>
              <button className="btn-ghost" onClick={() => reject(p.id)}><IconX size={14} /> Reject</button>
            </div>
          ))}
        </section>
      )}

      <section className="set-card">
        <h3>Activity &amp; spend</h3>
        <p className="sub">{isOwner ? "Every AI call across the company" : "Every AI call you've made"} — logged with token usage and rupee cost.</p>
        {runs.length === 0 ? (
          <p className="sub" style={{ marginBottom: 0 }}>No activity yet.</p>
        ) : (
          <div className="ftable">
            <table>
              <thead>
                <tr>
                  <th>When</th><th>Type</th><th>Model</th><th>Tokens</th><th style={{ textAlign: "right" }}>Cost</th><th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="mono" style={{ whiteSpace: "nowrap" }}>{when(r.created_at)}</td>
                    <td>{r.purpose === "digest" ? "Brief" : "Ask"}</td>
                    <td className="mono ai-dim">{r.model}</td>
                    <td className="mono ai-dim" style={{ whiteSpace: "nowrap" }}>{r.input_tokens}/{r.output_tokens}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{fmtInr(Number(r.cost_inr))}</td>
                    <td className="ai-detail">
                      {r.status === "failed"
                        ? <span className="ai-fail">Failed: {r.error}</span>
                        : (r.purpose === "digest" ? "Morning brief" : (r.prompt || "—"))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
