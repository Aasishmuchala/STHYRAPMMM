"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveOmegaKey, testOmegaKey, clearOmegaKey } from "@/app/ai/actions";

type Status = { configured: boolean; last4?: string; updated_at?: string } | null;

function when(iso?: string): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso.slice(0, 16); }
}

export function OmegaKeyCard({ status }: { status: Status }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<null | "save" | "test" | "clear">(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const configured = Boolean(status?.configured);

  async function save() {
    const k = key.trim();
    if (!k) { setMsg({ ok: false, text: "Paste a key first." }); return; }
    setBusy("save"); setMsg(null);
    const r = await saveOmegaKey(k);
    setBusy(null);
    if ("error" in r) { setMsg({ ok: false, text: r.error }); return; }
    setKey("");
    setMsg({ ok: true, text: r.status === "updated" ? "Key updated and encrypted in Vault." : "Key saved and encrypted in Vault." });
    router.refresh();
  }

  async function test() {
    setBusy("test"); setMsg(null);
    const r = await testOmegaKey();
    setBusy(null);
    if ("error" in r) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({
      ok: true,
      text: `Connected — ${r.count} model${r.count === 1 ? "" : "s"} available${r.hasDefault ? ", claude-opus-4-8 ready." : ". Note: claude-opus-4-8 not in the list."}`,
    });
  }

  async function remove() {
    setBusy("clear"); setMsg(null);
    const r = await clearOmegaKey();
    setBusy(null);
    if ("error" in r) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: "Key removed." });
    router.refresh();
  }

  return (
    <section className="set-card">
      <h3>AI Assistant</h3>
      <p className="sub">
        Powers the <a className="link" href="/ai">Assistant</a> (daily brief, ask-AI, task drafting). Paste your KesarCloud Omega key — it&apos;s encrypted in Supabase Vault, never shown in full again, and never sent to the browser. Default model: <span className="mono">claude-opus-4-8</span>.
      </p>

      <div className="set-row" style={{ paddingTop: 0, borderTop: "none" }}>
        <span className={`okey-dot ${configured ? "on" : ""}`} />
        <div className="grow">
          <div className="rn">{configured ? "Connected" : "Not connected"}</div>
          {configured && (
            <div className="re mono">key ••••{status?.last4 ?? "????"}{status?.updated_at ? ` · updated ${when(status.updated_at)}` : ""}</div>
          )}
        </div>
        {configured && <button className="btn-ghost" onClick={test} disabled={busy !== null}>{busy === "test" ? "Testing…" : "Test connection"}</button>}
      </div>

      <div className="field" style={{ marginTop: 6 }}>
        <label className="label" htmlFor="omega-key">{configured ? "Replace key" : "Omega API key"}</label>
        <input
          id="omega-key"
          className="input mono"
          type="password"
          value={key}
          onChange={(e) => { setKey(e.target.value); setMsg(null); }}
          placeholder="sk-…"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {msg && <div className="form-err" style={{ color: msg.ok ? "var(--positive)" : "var(--danger)", marginTop: 10 }}>{msg.text}</div>}

      <div className="modal-actions">
        {configured && <button className="btn-danger" onClick={remove} disabled={busy !== null}>{busy === "clear" ? "Removing…" : "Remove key"}</button>}
        <button className="btn" onClick={save} disabled={busy !== null}>{busy === "save" ? "Saving…" : configured ? "Update & test" : "Save key"}</button>
        {!configured && key.trim() === "" && <span className="re" style={{ marginRight: "auto" }} />}
      </div>
    </section>
  );
}
