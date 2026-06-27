"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { approvePending, rejectPending } from "@/app/ai/actions";
import { beginToast, finishToast } from "@/lib/client-toast";
import { fmtInr } from "@/lib/ai/cost";
import { IconSparkle, IconCheck, IconX } from "@/components/icons";
import { AiComposer } from "./AiComposer";

export type Run = {
  id: string;
  purpose: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_inr: number;
  prompt: string | null;
  response: string | null;
  actions: unknown;
  status: string;
  error: string | null;
  created_at: string;
};

export type Pending = {
  id: string;
  kind: string;
  summary: string;
  payload: unknown;
  status: string;
  created_at: string;
};

type AskResult = {
  ok: true;
  text: string;
  actions: { tool: string; ok: boolean; detail: string }[];
  cost: number;
};

function when(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso?.slice(0, 16) ?? "";
  }
}

export function AiConsole({
  configured,
  isOwner,
  runs,
  pending,
  latestBrief,
  spendToday,
  spendMonth,
  runCount,
  variant = "page",
}: {
  configured: boolean;
  isOwner: boolean;
  runs: Run[];
  pending: Pending[];
  latestBrief: Run | null;
  spendToday: number;
  spendMonth: number;
  runCount: number;
  variant?: "page" | "drawer";
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AskResult | null>(null);

  async function approve(id: string) {
    const toastId = beginToast("Approving action...");
    const res = await approvePending(id);
    if (!finishToast(res, { id: toastId, success: "Action approved." })) {
      setErr(res.error);
      return;
    }
    router.refresh();
  }

  async function reject(id: string) {
    const toastId = beginToast("Rejecting action...");
    const res = await rejectPending(id);
    if (!finishToast(res, { id: toastId, success: "Action rejected." })) {
      setErr(res.error);
      return;
    }
    router.refresh();
  }

  const chatRuns = runs
    .slice(0, 8)
    .reverse()
    .flatMap((run) => {
      const messages: { key: string; who: string; body: string }[] = [];
      if (run.purpose !== "digest" && run.prompt) {
        messages.push({ key: `${run.id}-user`, who: "You", body: run.prompt });
      }
      if (run.response) {
        messages.push({
          key: `${run.id}-assistant`,
          who: run.purpose === "digest" ? "Morning brief" : "Assistant",
          body: run.response,
        });
      }
      return messages;
    });

  if (answer?.text) {
    chatRuns.push({ key: "local-answer", who: "Assistant", body: answer.text });
  }

  if (variant === "drawer") {
    return (
      <div className="ai-console-drawer">
        {!configured && (
          <div className="ai-drawer-banner">
            <strong>Assistant not yet connected.</strong> Add your Omega API key in{" "}
            <a href="/settings">Settings → AI Assistant</a> and use <em>Test</em> to verify it.
          </div>
        )}

        {pending.length > 0 && (
          <section className="ai-drawer-summary">
            <div className="head">
              <span className="label">Needs approval</span>
              <span className="ai-count">{pending.length}</span>
            </div>
            <div className="items">
              {pending.slice(0, 4).map((p) => (
                <div key={p.id} className="item">
                  <span className="dot" />
                  <div className="grow">
                    <div className="title">{p.summary}</div>
                    <div className="meta">{p.kind}</div>
                  </div>
                  <button className="btn cta" onClick={() => approve(p.id)}>Approve</button>
                  <button className="btn-ghost cta" onClick={() => reject(p.id)}>Reject</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {latestBrief?.response && (
          <section className="ai-drawer-summary">
            <div className="head">
              <span className="label">Latest brief</span>
              <span className="mono ai-dim">{when(latestBrief.created_at)}</span>
            </div>
            <div className="ai-brief">{latestBrief.response}</div>
          </section>
        )}

        <div className="ai-chatlog" aria-label="Assistant conversation">
          {chatRuns.length === 0 ? (
            <div className="ai-drawer-empty">Start a conversation and it will appear here like a chat.</div>
          ) : (
            chatRuns.map((message) => (
              <div key={message.key} className={`ai-msg ${message.who === "You" ? "user" : ""}`}>
                <div className="who">{message.who}</div>
                <div className="body">{message.body}</div>
              </div>
            ))
          )}
        </div>

        {err && <div className="form-err" role="alert">{err}</div>}

        <AiComposer
          configured={configured}
          spendToday={spendToday}
          spendMonth={spendMonth}
          runCount={runCount}
          compact
          onAnswer={(result) => {
            if ("error" in result) {
              setErr(result.error);
              return;
            }
            setErr(null);
            setAnswer(result);
          }}
        />
      </div>
    );
  }

  return (
    <div className="ai-wrap">
      {!configured && (
        <div className="ai-banner">
          <strong>Assistant not yet connected.</strong> Add your Omega API key in{" "}
          <a className="link" href="/settings">Settings → AI Assistant</a> and use <em>Test</em> to verify it.
        </div>
      )}

      <div className="ai-grid">
        <section className="set-card">
          <h3><IconSparkle size={16} /> Ask the assistant</h3>
          <p className="sub">
            It reads your live workspace (your divisions only), can create tasks and draft notes
            automatically, and proposes any money or irreversible action for your approval. Model:{" "}
            <span className="mono">claude-opus-4-8</span>.
          </p>

          <AiComposer
            configured={configured}
            spendToday={spendToday}
            spendMonth={spendMonth}
            runCount={runCount}
            onAnswer={(result) => {
              if ("error" in result) {
                setErr(result.error);
                return;
              }
              setErr(null);
              setAnswer(result);
            }}
          />
          {err && <div className="form-err" style={{ marginTop: 10 }}>{err}</div>}

          {answer && (
            <div className="ai-answer">
              {answer.text && <div className="ai-text">{answer.text}</div>}
              {answer.actions.length > 0 && (
                <div className="ai-acts">
                  {answer.actions.map((a, i) => (
                    <span key={i} className={`ai-act ${a.ok ? "ok" : "no"}`}>
                      {a.ok ? <IconCheck size={12} /> : <IconX size={12} />}
                      {a.detail}
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
              <div className="ai-cost mono">
                {when(latestBrief.created_at)} · {fmtInr(Number(latestBrief.cost_inr))}
              </div>
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
        <p className="sub">{isOwner ? "Every AI call across the company" : "Every AI call you&apos;ve made"} — logged with token usage and rupee cost.</p>
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
