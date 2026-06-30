"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import {
  askAi,
  generateBrief,
  listAiSessions,
  loadAiSession,
  deleteAiSession,
  approvePending,
  rejectPending,
  type ChatMessage,
  type SessionSummary,
} from "@/app/ai/actions";
import { beginToast, finishToast } from "@/lib/client-toast";
import { fmtInr } from "@/lib/ai/cost";
import { IconSparkle, IconPlus, IconX, IconCheck } from "@/components/icons";

// Kept for backwards compatibility with AiDrawerHost + loadAiConsoleData.
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

const THINKING_PHRASES = [
  "Reading your workspace…",
  "Thinking it through…",
  "Checking tasks and deadlines…",
  "Putting it together…",
];

const EXAMPLE_PROMPTS = [
  "Plan the Living Twin demo end-to-end with deadlines and owners",
  "Create follow-up tasks for every overdue Studios deliverable",
  "What needs my attention across all divisions this week?",
  "Draft a weekly update for Digital from the latest work",
];

function AiMarkdown({ text }: { text: string }) {
  return (
    <div className="ai-markdown">
      <ReactMarkdown>{text}</ReactMarkdown>
    </div>
  );
}

function AgentAvatar({ size = 30 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/ai-agent.png"
      srcSet="/ai-agent.png 1x, /ai-agent@2x.png 2x"
      width={size}
      height={size}
      alt=""
      className="ai-avatar"
      draggable={false}
    />
  );
}

export function AiConsole({
  configured,
  isOwner,
  pending,
  variant = "page",
}: {
  configured: boolean;
  isOwner: boolean;
  runs?: Run[];
  pending: Pending[];
  latestBrief?: Run | null;
  spendToday?: number;
  spendMonth?: number;
  runCount?: number;
  variant?: "page" | "drawer";
}) {
  const router = useRouter();
  const idRef = useRef(0);
  const nextId = () => `local-${idRef.current++}`;

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<null | "ask" | "brief">(null);
  const [phrase, setPhrase] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [pendingList, setPendingList] = useState<Pending[]>(pending);
  const [showHistory, setShowHistory] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const refreshSessions = useCallback(async () => {
    const list = await listAiSessions();
    setSessions(list);
    return list;
  }, []);

  // Load the most recent session on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await refreshSessions();
      const first = list[0];
      if (!alive || !first) return;
      const res = await loadAiSession(first.id);
      if (!alive || "error" in res) return;
      setActiveId(res.id);
      setMessages(res.messages);
    })();
    return () => {
      alive = false;
    };
  }, [refreshSessions]);

  // Rotate the thinking phrase while busy.
  useEffect(() => {
    if (!busy) return;
    setPhrase(0);
    const t = setInterval(() => setPhrase((p) => (p + 1) % THINKING_PHRASES.length), 1800);
    return () => clearInterval(t);
  }, [busy]);

  // Keep the thread pinned to the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setErr(null);
    setShowHistory(false);
    taRef.current?.focus();
  }

  async function openSession(id: string) {
    setShowHistory(false);
    if (id === activeId) return;
    const res = await loadAiSession(id);
    if ("error" in res) {
      setErr(res.error);
      return;
    }
    setActiveId(res.id);
    setMessages(res.messages);
    setErr(null);
  }

  async function removeSession(id: string) {
    const res = await deleteAiSession(id);
    if ("error" in res) {
      setErr(res.error);
      return;
    }
    if (id === activeId) newChat();
    refreshSessions();
  }

  async function send(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    setErr(null);
    setInput("");
    setMessages((m) => [...m, { id: nextId(), role: "user", text: value, createdAt: new Date().toISOString() }]);
    setBusy("ask");
    const res = await askAi(activeId, value);
    setBusy(null);
    if ("error" in res) {
      setMessages((m) => [
        ...m,
        { id: nextId(), role: "assistant", text: `⚠️ ${res.error}`, createdAt: new Date().toISOString() },
      ]);
      return;
    }
    setActiveId(res.sessionId);
    setMessages((m) => [
      ...m,
      {
        id: nextId(),
        role: "assistant",
        text: res.text,
        actions: res.actions,
        cost: res.cost,
        createdAt: new Date().toISOString(),
      },
    ]);
    refreshSessions();
    router.refresh();
  }

  async function brief() {
    if (busy) return;
    setErr(null);
    setBusy("brief");
    const res = await generateBrief(activeId);
    setBusy(null);
    if ("error" in res) {
      setErr(res.error);
      return;
    }
    setActiveId(res.sessionId);
    setMessages((m) => [
      ...m,
      { id: nextId(), role: "assistant", text: res.text, cost: res.cost, createdAt: new Date().toISOString() },
    ]);
    refreshSessions();
    router.refresh();
  }

  async function approve(id: string) {
    const toastId = beginToast("Approving action…");
    const res = await approvePending(id);
    if (!finishToast(res, { id: toastId, success: "Action approved." })) {
      setErr(res.error);
      return;
    }
    setPendingList((list) => list.filter((p) => p.id !== id));
    router.refresh();
  }

  async function reject(id: string) {
    const toastId = beginToast("Rejecting action…");
    const res = await rejectPending(id);
    if (!finishToast(res, { id: toastId, success: "Action rejected." })) {
      setErr(res.error);
      return;
    }
    setPendingList((list) => list.filter((p) => p.id !== id));
    router.refresh();
  }

  const empty = messages.length === 0 && !busy;

  const sessionsRail = (
    <div className="ai-sessions">
      <button className="ai-newchat" onClick={newChat} disabled={!configured}>
        <IconPlus size={15} /> New chat
      </button>
      <div className="ai-session-list">
        {sessions.length === 0 ? (
          <div className="ai-session-empty">No conversations yet.</div>
        ) : (
          sessions.map((s) => (
            <div key={s.id} className={`ai-session-item ${s.id === activeId ? "on" : ""}`}>
              <button className="ai-session-open" onClick={() => openSession(s.id)} title={s.title}>
                {s.title}
              </button>
              <button className="ai-session-del" aria-label="Delete chat" onClick={() => removeSession(s.id)}>
                <IconX size={13} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const thread = (
    <div className="ai-thread">
      <div className="ai-thread-top">
        <button className="ai-newchat compact" onClick={newChat} disabled={!configured}>
          <IconPlus size={14} /> New chat
        </button>
        <div className="ai-thread-top-right">
          <button className="ai-ghost-btn" onClick={brief} disabled={!configured || busy !== null}>
            {busy === "brief" ? "Writing…" : "Morning brief"}
          </button>
          <div className="ai-history-wrap">
            <button className="ai-ghost-btn" onClick={() => setShowHistory((v) => !v)}>
              History
            </button>
            {showHistory && (
              <div className="ai-history-pop" onMouseLeave={() => setShowHistory(false)}>
                {sessions.length === 0 ? (
                  <div className="ai-session-empty">No conversations yet.</div>
                ) : (
                  sessions.map((s) => (
                    <div key={s.id} className={`ai-session-item ${s.id === activeId ? "on" : ""}`}>
                      <button className="ai-session-open" onClick={() => openSession(s.id)} title={s.title}>
                        {s.title}
                      </button>
                      <button className="ai-session-del" aria-label="Delete chat" onClick={() => removeSession(s.id)}>
                        <IconX size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {pendingList.length > 0 && (
        <div className="ai-approve-banner">
          <div className="ai-approve-head">
            <span>Needs your approval</span>
            <span className="ai-count">{pendingList.length}</span>
          </div>
          {pendingList.slice(0, 4).map((p) => (
            <div key={p.id} className="ai-approve-item">
              <div className="grow">
                <div className="title">{p.summary}</div>
                <div className="meta mono">{p.kind}</div>
              </div>
              <button className="btn cta" onClick={() => approve(p.id)}>
                <IconCheck size={13} /> Approve
              </button>
              <button className="btn-ghost cta" onClick={() => reject(p.id)}>
                Reject
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="ai-scroll" ref={scrollRef}>
        {empty ? (
          <div className="ai-welcome">
            <AgentAvatar size={56} />
            <h2>How can I help?</h2>
            <p>
              I can plan whole projects, create tasks across teams with deadlines, draft notes, and answer
              anything about your live workspace.
            </p>
            <div className="ai-examples">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button key={ex} className="ai-example" onClick={() => send(ex)} disabled={!configured}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="ai-messages">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="ai-row user">
                  <div className="ai-bubble user">{m.text}</div>
                </div>
              ) : (
                <div key={m.id} className="ai-row assistant">
                  <AgentAvatar />
                  <div className="ai-bubble assistant">
                    {m.text && <AiMarkdown text={m.text} />}
                    {m.actions && m.actions.length > 0 && (
                      <div className="ai-acts">
                        {m.actions.map((a, i) => (
                          <span key={i} className={`ai-act ${a.ok ? "ok" : "no"}`}>
                            {a.ok ? <IconCheck size={11} /> : <IconX size={11} />}
                            {a.detail}
                          </span>
                        ))}
                      </div>
                    )}
                    {typeof m.cost === "number" && m.cost > 0 && (
                      <div className="ai-cost mono">{fmtInr(m.cost)}</div>
                    )}
                  </div>
                </div>
              ),
            )}
            {busy && (
              <div className="ai-row assistant">
                <AgentAvatar />
                <div className="ai-bubble assistant thinking">
                  <span className="ai-dots"><i /><i /><i /></span>
                  <span className="ai-thinking-text">{THINKING_PHRASES[phrase]}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {err && <div className="form-err ai-thread-err" role="alert">{err}</div>}

      <div className="ai-composer-bar">
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={configured ? "Message the assistant…" : "Add your Omega key in Settings to start"}
          rows={1}
          disabled={!configured || busy !== null}
        />
        <button
          className="ai-send"
          onClick={() => send(input)}
          disabled={!configured || busy !== null || !input.trim()}
          aria-label="Send"
        >
          <IconSparkle size={16} />
        </button>
      </div>
    </div>
  );

  return (
    <div className={`ai-chat ai-chat--${variant}`}>
      {variant === "page" && sessionsRail}
      {thread}
    </div>
  );
}
