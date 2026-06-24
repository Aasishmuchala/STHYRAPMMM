"use client";

import { useState, useTransition } from "react";
import { createProjectWithWorkflow } from "@/app/projects/actions";
import type { DivisionOpt } from "@/lib/tasks-types";

type ProjectCard = {
  id: string;
  name: string;
  division_id: string;
  division_name: string;
  client: string | null;
  openTasks: number;
};

export function ProjectsView({
  divisions,
  projects,
}: {
  divisions: DivisionOpt[];
  projects: ProjectCard[];
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    division_id: divisions[0]?.id ?? "",
    client: "",
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    start(async () => {
      const res = await createProjectWithWorkflow(form);
      if ("error" in res) {
        setErr(res.error);
        return;
      }
      setForm((current) => ({ ...current, name: "", client: "" }));
      window.location.assign("/projects");
    });
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section className="glass" style={{ padding: 22, borderRadius: 18 }}>
        <div className="label" style={{ marginBottom: 10 }}>New project</div>
        <div style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 18 }}>
          Each project gets its own workflow automatically, so switching projects in Tasks also switches the board structure.
        </div>
        <form onSubmit={submit}>
          <div className="field-row">
            <label className="field">
              <span className="label">Project name</span>
              <input className="input" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} placeholder="Veranza Tower B" />
            </label>
            <label className="field">
              <span className="label">Division</span>
              <select className="select" value={form.division_id} onChange={(e) => setForm((current) => ({ ...current, division_id: e.target.value }))}>
                {divisions.map((division) => (
                  <option key={division.id} value={division.id}>{division.name.replace(/^Sthyra\s+/, "")}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span className="label">Client</span>
            <input className="input" value={form.client} onChange={(e) => setForm((current) => ({ ...current, client: e.target.value }))} placeholder="Optional client name" />
          </label>
          {err && <div className="form-err" role="alert">{err}</div>}
          <div className="modal-actions" style={{ justifyContent: "flex-start", marginTop: 12 }}>
            <button type="submit" className="btn" disabled={pending} style={{ opacity: pending ? 0.7 : 1 }}>Create project</button>
          </div>
        </form>
      </section>

      <section className="workflow-panel glass" aria-label="Active projects">
        <div className="workflow-panel-head">
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Projects</div>
            <div className="workflow-panel-copy">Open any project to load its own workflow, planning layers, and task board.</div>
          </div>
        </div>
        <div className="workflow-grid">
          {projects.map((project) => (
            <div key={project.id} className="workflow-card">
              <div className="workflow-card-head">
                <span className="statuspill">{project.division_name}</span>
                <span className="workflow-hint">{project.openTasks} open tasks</span>
              </div>
              <div className="tcard-title" style={{ marginBottom: 8 }}>{project.name}</div>
              <div className="workflow-panel-copy" style={{ fontSize: 13, marginBottom: 18 }}>
                {project.client ? `Client: ${project.client}` : "No client linked yet."}
              </div>
              <div className="workflow-actions">
                <a href={`/tasks?project=${project.id}`} className="btn" style={{ textDecoration: "none" }}>
                  Open board
                </a>
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="workflow-card">
              <div className="workflow-panel-copy">No projects yet. Create one above and it will immediately appear in the Tasks project switcher.</div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
