"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logTime, deleteTimeLog } from "@/app/tasks/time-logs-actions";
import { beginToast, finishToast } from "@/lib/client-toast";
import { fmtDuration } from "@/lib/format";

export type WorkLog = {
  id: string;
  task_id: string;
  profile_id: string;
  profile_name?: string | null;
  started_at: string;
  minutes: number;
  note: string | null;
};

export function TimeLogTab({
  taskId,
  logs,
  currentUserId,
}: {
  taskId: string;
  logs: WorkLog[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const [startedAt, setStartedAt] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const totalMinutes = logs.reduce((s, l) => s + l.minutes, 0);

  async function add() {
    if (!duration.trim() || busy) return;
    setBusy(true);
    const toastId = beginToast("Logging time...");
    const res = await logTime({ taskId, startedAt, minutes: duration, note });
    setBusy(false);
    if (!finishToast(res, { id: toastId, success: "Time logged." })) return;
    setDuration("");
    setNote("");
    router.refresh();
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    const toastId = beginToast("Deleting log...");
    const res = await deleteTimeLog(id);
    setBusy(false);
    if (!finishToast(res, { id: toastId, success: "Deleted." })) return;
    router.refresh();
  }

  return (
    <div className="time-tab">
      <div className="time-summary">
        <div className="time-total">
          <span className="label">Total logged</span>
          <span className="big mono">{fmtDuration(totalMinutes)}</span>
        </div>
      </div>

      <div className="time-list">
        {logs.length === 0 ? (
          <p className="sub" style={{ marginBottom: 12 }}>No time logged yet.</p>
        ) : (
          logs.map((l) => (
            <div className="time-row" key={l.id}>
              <div className="grow">
                <div className="time-when mono">{l.started_at}</div>
                <div className="time-meta">{l.profile_name ?? "Member"} · {fmtDuration(l.minutes)}{l.note ? ` · ${l.note}` : ""}</div>
              </div>
              {l.profile_id === currentUserId && (
                <button className="btn-icon" aria-label="Delete log" onClick={() => remove(l.id)}>×</button>
              )}
            </div>
          ))
        )}
      </div>

      <div className="time-composer">
        <div className="time-row">
          <input
            type="date"
            className="input"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
            aria-label="Date"
          />
          <input
            type="text"
            className="input"
            placeholder="e.g. 1h 30m or 45m"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            aria-label="Duration"
          />
          <input
            type="text"
            className="input"
            placeholder="What did you do?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Note"
          />
          <button className="btn" onClick={add} disabled={busy || !duration.trim()}>Log</button>
        </div>
      </div>
    </div>
  );
}