"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRule, deleteRule, setRuleEnabled } from "@/app/projects/automations-actions";
import { createWebhook, deleteWebhook } from "@/app/projects/webhooks-actions";
import { beginToast, finishToast } from "@/lib/client-toast";
import { fmtDate } from "@/lib/format";

type Rule = {
  id: string;
  name: string;
  trigger_event: string;
  conditions: Record<string, unknown>;
  action: string;
  action_payload: Record<string, unknown>;
  enabled: boolean;
  project_id: string | null;
  division_id: string | null;
  created_at: string;
};

type Webhook = {
  id: string;
  name: string;
  channel: string;
  enabled: boolean;
  project_id: string | null;
  division_id: string | null;
};

export function AutomationsView({
  divisions,
  projects,
  rules,
  webhooks,
}: {
  divisions: { id: string; slug: string; name: string }[];
  projects: { id: string; name: string; division_id: string }[];
  rules: Rule[];
  webhooks: Webhook[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // Rule form state
  const [ruleName, setRuleName] = useState("");
  const [ruleTrigger, setRuleTrigger] = useState("task_status_changed");
  const [ruleAction, setRuleAction] = useState("send_notification");
  const [ruleProjectId, setRuleProjectId] = useState<string>("");

  // Webhook form state
  const [hookName, setHookName] = useState("");
  const [hookChannel, setHookChannel] = useState("slack");
  const [hookUrl, setHookUrl] = useState("");
  const [hookProjectId, setHookProjectId] = useState<string>("");

  async function submitRule() {
    if (!ruleName.trim() || busy) return;
    setBusy(true);
    const toastId = beginToast("Creating rule...");
    const res = await createRule({
      projectId: ruleProjectId || null,
      divisionId: null,
      name: ruleName,
      triggerEvent: ruleTrigger,
      action: ruleAction,
    });
    setBusy(false);
    if (!finishToast(res, { id: toastId, success: "Rule created." })) return;
    setRuleName("");
    router.refresh();
  }

  async function toggleRule(id: string, enabled: boolean) {
    setBusy(true);
    const toastId = beginToast("Updating rule...");
    const res = await setRuleEnabled(id, enabled);
    setBusy(false);
    if (!finishToast(res, { id: toastId, success: "Saved." })) return;
    router.refresh();
  }

  async function removeRule(id: string) {
    if (busy) return;
    setBusy(true);
    const res = await deleteRule(id);
    setBusy(false);
    if (!finishToast(res, { id: beginToast("Deleting rule..."), success: "Deleted." })) return;
    router.refresh();
  }

  async function submitHook() {
    if (!hookName.trim() || !hookUrl.trim() || busy) return;
    setBusy(true);
    const toastId = beginToast("Creating webhook...");
    const res = await createWebhook({
      projectId: hookProjectId || null,
      divisionId: null,
      name: hookName,
      channel: hookChannel,
      config: { url: hookUrl.trim() },
    });
    setBusy(false);
    if (!finishToast(res, { id: toastId, success: "Webhook created." })) return;
    setHookName("");
    setHookUrl("");
    router.refresh();
  }

  async function removeHook(id: string) {
    if (busy) return;
    setBusy(true);
    const res = await deleteWebhook(id);
    setBusy(false);
    if (!finishToast(res, { id: beginToast("Deleting webhook..."), success: "Deleted." })) return;
    router.refresh();
  }

  return (
    <div className="automations-wrap">
      <section className="glass" style={{ padding: 18, marginBottom: 16 }}>
        <h3>New automation rule</h3>
        <div className="automations-form">
          <input className="input" placeholder="Rule name" value={ruleName} onChange={(e) => setRuleName(e.target.value)} />
          <select className="select" value={ruleTrigger} onChange={(e) => setRuleTrigger(e.target.value)}>
            <option value="task_created">When task is created</option>
            <option value="task_updated">When task is updated</option>
            <option value="task_status_changed">When task status changes</option>
            <option value="task_assigned">When task is assigned</option>
            <option value="task_completed">When task is completed</option>
            <option value="invoice_overdue">When invoice is overdue</option>
          </select>
          <select className="select" value={ruleAction} onChange={(e) => setRuleAction(e.target.value)}>
            <option value="send_notification">Send notification</option>
            <option value="post_webhook">Post to webhook</option>
            <option value="add_label">Add label</option>
            <option value="create_followup_task">Create follow-up task</option>
          </select>
          <select className="select" value={ruleProjectId} onChange={(e) => setRuleProjectId(e.target.value)}>
            <option value="">No project scope (workspace)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button className="btn" onClick={submitRule} disabled={busy || !ruleName.trim()}>Create</button>
        </div>
      </section>

      <section className="glass" style={{ padding: 18, marginBottom: 16 }}>
        <h3>Active rules</h3>
        {rules.length === 0 ? (
          <p className="sub">No rules yet.</p>
        ) : (
          <div className="ftable">
            <table>
              <thead>
                <tr><th>Name</th><th>When</th><th>Then</th><th>Scope</th><th>Enabled</th><th></th></tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td className="mono">{r.trigger_event}</td>
                    <td className="mono">{r.action}</td>
                    <td>{r.project_id ? "Project" : "Workspace"}</td>
                    <td>
                      <input type="checkbox" checked={r.enabled} onChange={(e) => toggleRule(r.id, e.target.checked)} disabled={busy} aria-label={`Enable ${r.name}`} />
                    </td>
                    <td>
                      <button className="btn-ghost btn-sm" onClick={() => removeRule(r.id)} disabled={busy}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="glass" style={{ padding: 18 }}>
        <h3>Webhooks</h3>
        <div className="automations-form">
          <input className="input" placeholder="Webhook name" value={hookName} onChange={(e) => setHookName(e.target.value)} />
          <select className="select" value={hookChannel} onChange={(e) => setHookChannel(e.target.value)}>
            <option value="slack">Slack</option>
            <option value="teams">Microsoft Teams</option>
            <option value="whatsapp">WhatsApp Business</option>
            <option value="github">GitHub</option>
            <option value="generic">Generic HTTP</option>
          </select>
          <input className="input" placeholder="Webhook URL" value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} />
          <select className="select" value={hookProjectId} onChange={(e) => setHookProjectId(e.target.value)}>
            <option value="">Workspace</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button className="btn" onClick={submitHook} disabled={busy || !hookName.trim() || !hookUrl.trim()}>Add</button>
        </div>
        {webhooks.length > 0 && (
          <div className="ftable" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr><th>Name</th><th>Channel</th><th>Scope</th><th></th></tr>
              </thead>
              <tbody>
                {webhooks.map((w) => (
                  <tr key={w.id}>
                    <td>{w.name}</td>
                    <td className="mono">{w.channel}</td>
                    <td>{w.project_id ? "Project" : "Workspace"}</td>
                    <td>
                      <button className="btn-ghost btn-sm" onClick={() => removeHook(w.id)} disabled={busy}>Delete</button>
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