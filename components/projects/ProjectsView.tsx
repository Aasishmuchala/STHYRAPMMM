"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { createProjectWithWorkflow, deleteProject, updateProjectDetails } from "@/app/projects/actions";
import type { DivisionOpt } from "@/lib/tasks-types";

type ProjectRow = {
  id: string;
  name: string;
  division_id: string;
  division_name: string;
  client: string | null;
  description: string | null;
  starts_on: string | null;
  target_end_on: string | null;
  lead_id: string | null;
  lead_name: string | null;
  openTasks: number;
};
type Member = { id: string; name: string; email: string | null };
type DivisionMembership = { user_id: string; division_id: string; role: string };
type ProjectDraft = {
  name: string;
  client: string;
  description: string;
  starts_on: string;
  target_end_on: string;
  lead_id: string;
};

export function ProjectsView({
  projects,
  canManageProjects,
  creatableDivisions,
  isOwner,
  members,
  divisionMemberships,
}: {
  projects: ProjectRow[];
  canManageProjects: boolean;
  creatableDivisions: DivisionOpt[];
  isOwner: boolean;
  members: Member[];
  divisionMemberships: DivisionMembership[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [createError, setCreateError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string | null>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ id: string; name: string } | null>(null);
  const [promotionDialog, setPromotionDialog] = useState<
    | { mode: "create"; memberName: string }
    | { mode: "update"; projectId: string; memberName: string }
    | null
  >(null);
  const [form, setForm] = useState({
    name: "",
    division_id: creatableDivisions[0]?.id ?? "",
    client: "",
    description: "",
    starts_on: "",
    target_end_on: "",
    lead_id: "",
  });
  const [drafts, setDrafts] = useState<Record<string, ProjectDraft>>(
    Object.fromEntries(
      projects.map((project) => [
        project.id,
        {
          name: project.name,
          client: project.client ?? "",
          description: project.description ?? "",
          starts_on: project.starts_on ?? "",
          target_end_on: project.target_end_on ?? "",
          lead_id: project.lead_id ?? "",
        },
      ])
    )
  );

  function projectMembers(divisionId: string) {
    const roster = members
      .map((member) => {
        const membership = divisionMemberships.find(
          (item) => item.user_id === member.id && item.division_id === divisionId
        );
        if (!isOwner && !membership) return null;
        return {
          id: member.id,
          name: member.name,
          email: member.email,
          role: membership?.role ?? "member",
          inDivision: Boolean(membership),
        };
      })
      .filter((member): member is { id: string; name: string; email: string | null; role: string; inDivision: boolean } => Boolean(member));

    return roster
      .sort((a, b) => {
        if (a.inDivision !== b.inDivision) return a.inDivision ? -1 : 1;
        if (a.role !== b.role) return a.role === "lead" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  function updateDraft(projectId: string, patch: Partial<ProjectDraft>) {
    setDrafts((current) => ({
      ...current,
      [projectId]: { ...current[projectId], ...patch },
    }));
  }

  function createSubmit(promoteLead = false) {
    setCreateError(null);
    setBusyKey("create");
    start(async () => {
      const res = await createProjectWithWorkflow({ ...form, lead_id: form.lead_id || null, promote_lead: promoteLead });
      setBusyKey(null);
      if ("error" in res) {
        if (res.requiresLeadPromotion && res.memberName) {
          setPromotionDialog({ mode: "create", memberName: res.memberName });
          return;
        }
        setCreateError(res.error);
        return;
      }
      setPromotionDialog(null);
      setForm({
        name: "",
        division_id: creatableDivisions[0]?.id ?? "",
        client: "",
        description: "",
        starts_on: "",
        target_end_on: "",
        lead_id: "",
      });
      router.refresh();
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    createSubmit(false);
  }

  function saveProject(projectId: string, promoteLead = false) {
    const draft = drafts[projectId];
    if (!draft) return;
    setRowErrors((current) => ({ ...current, [projectId]: null }));
    setBusyKey(`save:${projectId}`);
    start(async () => {
      const res = await updateProjectDetails({
        project_id: projectId,
        name: draft.name,
        client: draft.client,
        description: draft.description,
        starts_on: draft.starts_on || null,
        target_end_on: draft.target_end_on || null,
        lead_id: draft.lead_id || null,
        promote_lead: promoteLead,
      });
      setBusyKey(null);
      if ("error" in res) {
        if (res.requiresLeadPromotion && res.memberName) {
          setPromotionDialog({ mode: "update", projectId, memberName: res.memberName });
          return;
        }
        setRowErrors((current) => ({ ...current, [projectId]: res.error }));
        return;
      }
      setPromotionDialog(null);
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!deleteDialog) return;
    setRowErrors((current) => ({ ...current, [deleteDialog.id]: null }));
    setBusyKey(`delete:${deleteDialog.id}`);
    start(async () => {
      const res = await deleteProject(deleteDialog.id);
      setBusyKey(null);
      if ("error" in res) {
        setRowErrors((current) => ({ ...current, [deleteDialog.id]: res.error }));
        return;
      }
      setDeleteDialog(null);
      router.refresh();
    });
  }

  function dateRangeLabel(startsOn: string | null, targetEndOn: string | null) {
    const format = (value: string) =>
      new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    if (startsOn && targetEndOn) return `${format(startsOn)} to ${format(targetEndOn)}`;
    if (startsOn) return `Starts ${format(startsOn)}`;
    if (targetEndOn) return `Target ${format(targetEndOn)}`;
    return "No timeline";
  }

  return (
    <>
      <div className="projects-launch-grid">
        <section className="projects-create-card glass">
          <div className="projects-section-head">
            <div>
              <div className="label" style={{ marginBottom: 8 }}>Create project</div>
              <h2>New project workspace</h2>
              <p>
                Capture the lead, delivery window, client context, and working brief now so tasks, cycles, and modules start with the right ownership.
              </p>
            </div>
          </div>
          <div className="projects-section-note">
          {canManageProjects
            ? "Each project still gets its own workflow automatically. Lead assignment here can also widen access when the owner confirms a promotion."
            : "Owners and leads create projects. Members can still open any existing board and work inside it."}
          </div>
          {canManageProjects ? (
            <form onSubmit={submit} className="projects-create-form">
              <label className="field">
                <span className="label">Project name</span>
                <input className="input" value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} placeholder="Veranza Tower B" />
              </label>
              <label className="field">
                <span className="label">Division</span>
                <select className="select" value={form.division_id} onChange={(e) => setForm((current) => ({ ...current, division_id: e.target.value, lead_id: "" }))}>
                  {creatableDivisions.map((division) => (
                    <option key={division.id} value={division.id}>{division.name.replace(/^Sthyra\s+/, "")}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="label">Project lead</span>
                <select className="select" value={form.lead_id} onChange={(e) => setForm((current) => ({ ...current, lead_id: e.target.value }))}>
                  <option value="">Unassigned</option>
                  {projectMembers(form.division_id).map((member) => (
                    <option key={member.id} value={member.id}>{member.name} - {member.inDivision ? member.role : "not in division yet"}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="label">Client</span>
                <input className="input" value={form.client} onChange={(e) => setForm((current) => ({ ...current, client: e.target.value }))} placeholder="Client or internal sponsor" />
              </label>
              <label className="field">
                <span className="label">Starts on</span>
                <input className="input" type="date" value={form.starts_on} onChange={(e) => setForm((current) => ({ ...current, starts_on: e.target.value }))} />
              </label>
              <label className="field">
                <span className="label">Target end</span>
                <input className="input" type="date" value={form.target_end_on} onChange={(e) => setForm((current) => ({ ...current, target_end_on: e.target.value }))} />
              </label>
              <label className="field projects-create-span">
                <span className="label">Project brief</span>
                <input className="input" value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} placeholder="Scope, goal, or one-line delivery brief" />
              </label>
              {createError && <div className="form-err projects-create-span" role="alert">{createError}</div>}
              <div className="modal-actions projects-create-actions">
                <button type="submit" className="btn" disabled={pending && busyKey === "create"} style={{ opacity: pending && busyKey === "create" ? 0.7 : 1 }}>
                  Create project
                </button>
              </div>
            </form>
          ) : (
            <div className="workflow-panel-copy" style={{ fontSize: 13 }}>Project planning stays editable only for leads and the owner, but members still have full board access inside each project.</div>
          )}
        </section>

        <section className="projects-list-card glass" aria-label="Active projects">
          <div className="projects-section-head">
            <div>
              <div className="label" style={{ marginBottom: 8 }}>Projects</div>
              <h2>Live project roster</h2>
              <p>Smaller rows, direct lead ownership, inline dates, and one-click board access.</p>
            </div>
          </div>
          {projects.length === 0 ? (
            <div className="projects-empty">No projects yet. Create one above and it will appear in Tasks immediately.</div>
          ) : (
            <div className="projects-list">
              <div className="projects-list-head">
                <span>Project</span>
                <span>Lead</span>
                <span>Timeline</span>
                <span>Tasks</span>
                <span>Actions</span>
              </div>
              {projects.map((project) => {
                const draft = drafts[project.id];
                if (!draft) return null;
                const options = projectMembers(project.division_id);
                return (
                  <article key={project.id} className="project-row">
                    <div className="project-main">
                      {canManageProjects ? (
                        <>
                          <input className="project-inline-input" value={draft.name} onChange={(e) => updateDraft(project.id, { name: e.target.value })} />
                          <input className="project-inline-subinput" value={draft.description} onChange={(e) => updateDraft(project.id, { description: e.target.value })} placeholder="Scope or delivery brief" />
                          <div className="project-main-meta">
                            <span>{project.division_name}</span>
                            <span>{draft.client ? `Client: ${draft.client}` : "No client"}</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="project-name">{project.name}</div>
                          <div className="project-description">{project.description || "No project brief yet."}</div>
                          <div className="project-main-meta">
                            <span>{project.division_name}</span>
                            <span>{project.client ? `Client: ${project.client}` : "No client"}</span>
                          </div>
                        </>
                      )}
                      {rowErrors[project.id] && <div className="form-err project-row-error">{rowErrors[project.id]}</div>}
                    </div>
                    <div className="project-cell">
                      <div className="project-cell-label">Lead</div>
                      {canManageProjects ? (
                        <select className="select project-compact-select" value={draft.lead_id} onChange={(e) => updateDraft(project.id, { lead_id: e.target.value })}>
                          <option value="">Unassigned</option>
                          {options.map((member) => (
                            <option key={member.id} value={member.id}>{member.name} - {member.inDivision ? member.role : "not in division yet"}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="project-value">{project.lead_name ?? "Unassigned"}</div>
                      )}
                    </div>
                    <div className="project-cell">
                      <div className="project-cell-label">Timeline</div>
                      {canManageProjects ? (
                        <div className="project-date-grid">
                          <input className="input project-date-input" type="date" value={draft.starts_on} onChange={(e) => updateDraft(project.id, { starts_on: e.target.value })} />
                          <input className="input project-date-input" type="date" value={draft.target_end_on} onChange={(e) => updateDraft(project.id, { target_end_on: e.target.value })} />
                        </div>
                      ) : (
                        <div className="project-value">{dateRangeLabel(project.starts_on, project.target_end_on)}</div>
                      )}
                    </div>
                    <div className="project-count">
                      <strong>{project.openTasks}</strong>
                      <span>tasks</span>
                    </div>
                    <div className="project-actions">
                      <a href={`/tasks?project=${project.id}`} className="btn-ghost" style={{ textDecoration: "none" }}>
                        Open board
                      </a>
                      {canManageProjects && (
                        <>
                          <input
                            className="project-inline-client"
                            value={draft.client}
                            onChange={(e) => updateDraft(project.id, { client: e.target.value })}
                            placeholder="Client"
                          />
                          <button type="button" className="btn-ghost" onClick={() => saveProject(project.id)} disabled={pending && busyKey === `save:${project.id}`}>
                            Save
                          </button>
                          <button type="button" className="btn-danger" onClick={() => setDeleteDialog({ id: project.id, name: project.name })} disabled={pending && busyKey === `delete:${project.id}`}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {deleteDialog && (
        <ConfirmDialog
          title="Delete project"
          message={`Delete "${deleteDialog.name}"? Its tasks, cycles, and modules will be hidden from the app.`}
          confirmLabel="Delete project"
          busy={pending && busyKey === `delete:${deleteDialog.id}`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteDialog(null)}
        />
      )}

      {promotionDialog && (
        <ConfirmDialog
          title="Promote project lead"
          message={`${promotionDialog.memberName} is currently a member. Confirming will promote them to division lead and widen their access across this division.`}
          confirmLabel="Promote and continue"
          busy={pending && (busyKey === "create" || busyKey === `save:${promotionDialog.mode === "update" ? promotionDialog.projectId : ""}`)}
          onConfirm={() => {
            if (promotionDialog.mode === "create") createSubmit(true);
            else saveProject(promotionDialog.projectId, true);
          }}
          onCancel={() => setPromotionDialog(null)}
        />
      )}
    </>
  );
}
