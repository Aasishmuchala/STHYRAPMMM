"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { beginToast, finishToast } from "@/lib/client-toast";
import { setProfileRoles, addCompanyRole } from "@/app/settings/roles-actions";

export type CompanyRole = { id: string; name: string };
export type RolePerson = { id: string; full_name: string | null; email: string | null };

export function TeamRolesCard({
  people,
  roles,
  assignments,
}: {
  people: RolePerson[];
  roles: CompanyRole[];
  assignments: Record<string, string[]>; // profileId -> roleId[]
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [selected, setSelected] = useState<Record<string, Set<string>>>(() => {
    const init: Record<string, Set<string>> = {};
    for (const p of people) init[p.id] = new Set(assignments[p.id] ?? []);
    return init;
  });
  const [savingFor, setSavingFor] = useState<string | null>(null);
  const [newRole, setNewRole] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function toggle(personId: string, roleId: string) {
    setErr(null);
    const current = new Set(selected[personId] ?? []);
    if (current.has(roleId)) current.delete(roleId);
    else current.add(roleId);
    setSelected((s) => ({ ...s, [personId]: current }));
    setSavingFor(personId);
    start(async () => {
      const res = await setProfileRoles(personId, [...current]);
      setSavingFor(null);
      if ("error" in res) {
        setErr(res.error);
        // revert on failure
        setSelected((s) => ({ ...s, [personId]: new Set(assignments[personId] ?? []) }));
        return;
      }
      router.refresh();
    });
  }

  function add() {
    const name = newRole.trim();
    if (!name) return;
    setErr(null);
    start(async () => {
      const toastId = beginToast("Adding role…");
      const res = await addCompanyRole(name);
      if (!finishToast(res, { id: toastId, success: "Role added." })) {
        setErr(res.error);
        return;
      }
      setNewRole("");
      router.refresh();
    });
  }

  return (
    <section className="set-card">
      <h3>Team skill roles</h3>
      <p className="sub">
        Give each person the crafts they do (e.g. 3ds Max &amp; V-Ray, Lighting, Full-stack). The assistant uses these
        to break a project into tasks and assign each one to the right person automatically.
      </p>

      <div className="set-add" style={{ marginBottom: 16 }}>
        <div className="field" style={{ margin: 0, flex: 1 }}>
          <label className="label" htmlFor="new-role">Add a role to the list</label>
          <input
            id="new-role"
            className="input"
            value={newRole}
            placeholder="e.g. Drone / Photogrammetry Operator"
            onChange={(e) => setNewRole(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          />
        </div>
        <div className="field" style={{ margin: 0, alignSelf: "end" }}>
          <button className="btn" onClick={add}>Add role</button>
        </div>
      </div>

      {err && <div className="form-err" style={{ marginBottom: 12 }}>{err}</div>}

      {people.length === 0 ? (
        <p className="sub" style={{ margin: 0 }}>No team members yet.</p>
      ) : (
        <div className="roles-people">
          {people.map((p) => {
            const sel = selected[p.id] ?? new Set<string>();
            return (
              <div className="roles-person" key={p.id}>
                <div className="roles-person-head">
                  <span className="rn">{p.full_name ?? p.email}</span>
                  {savingFor === p.id && <span className="re">saving…</span>}
                </div>
                <div className="roles-chips">
                  {roles.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className={`role-chip ${sel.has(r.id) ? "on" : ""}`}
                      onClick={() => toggle(p.id, r.id)}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
