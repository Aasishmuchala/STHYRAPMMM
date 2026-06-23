"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setTaskStatus } from "@/app/tasks/actions";
import { STATUS_COLUMNS } from "@/lib/tasks-types";
import type { BoardTask, DivisionOpt, ProjectOpt, MemberOpt, TaskStatus } from "@/lib/tasks-types";
import { dueLabel, initials } from "@/lib/format";
import { avatarBg } from "@/lib/avatar";
import { IconPlus } from "@/components/icons";
import { TaskDrawer } from "./TaskDrawer";

const prioColor: Record<string, string> = { high: "var(--danger)", med: "var(--warning)", low: "var(--text-faint)" };
const DIV_SHORT: Record<string, string> = { studios: "Studios", digital: "Digital", construction: "Construction", living_twin: "Living Twin" };
type GroupBy = "none" | "project" | "division";
type DrawerState = { mode: "view"; task: BoardTask } | { mode: "create"; presetStatus: TaskStatus } | null;

export function TaskBoard({
  tasks, divisions, projects, members, currentUserId, initialDivision,
}: {
  tasks: BoardTask[];
  divisions: DivisionOpt[];
  projects: ProjectOpt[];
  members: MemberOpt[];
  currentUserId: string;
  initialDivision?: string;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [divFilter, setDivFilter] = useState(initialDivision ?? "all");
  const [asgFilter, setAsgFilter] = useState("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const today = new Date();

  const filtered = tasks.filter(
    (t) =>
      (divFilter === "all" || t.division_slug === divFilter) &&
      (asgFilter === "all" || (asgFilter === "unassigned" ? !t.assignee_id : t.assignee_id === asgFilter)) &&
      (!mineOnly || t.assignee_id === currentUserId)
  );

  function groupItems(items: BoardTask[]) {
    if (groupBy === "none") return [{ name: "", items }];
    const map = new Map<string, BoardTask[]>();
    for (const t of items) {
      const name = groupBy === "project" ? (t.project_name ?? "No project") : t.division_name.replace(/^Sthyra\s+/, "");
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(t);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, items]) => ({ name, items }));
  }

  function drop(colKey: TaskStatus, e?: React.DragEvent) {
    const id = e?.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId(null);
    setDragOverCol(null);
    if (!id) return;
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === colKey) return;
    start(async () => {
      await setTaskStatus(id, colKey);
      router.refresh();
    });
  }

  function Card({ t }: { t: BoardTask }) {
    return (
      <article
        className={`tcard ${draggingId === t.id ? "dragging" : ""}`}
        draggable
        onDragStart={(e) => { setDraggingId(t.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); }}
        onDragEnd={() => { setDraggingId(null); setDragOverCol(null); }}
        onClick={() => setDrawer({ mode: "view", task: t })}
        onKeyDown={(e) => { if (e.key === "Enter") setDrawer({ mode: "view", task: t }); }}
        role="button"
        tabIndex={0}
        aria-label={`Open ${t.title}`}
      >
        <div className="tcard-top">
          <span className="tprio" style={{ background: prioColor[t.priority] }} title={t.priority} />
          {t.project_name && groupBy !== "project" && <span className="chip">{t.project_name}</span>}
          {t.assignee_name && <span className="tasg" style={{ background: avatarBg(t.assignee_name), marginLeft: "auto" }} title={t.assignee_name}>{initials(t.assignee_name, null)}</span>}
        </div>
        <div className="tcard-title">{t.title}</div>
        {t.description && <div className="tcard-desc">{t.description}</div>}
        <div className="tmeta">
          {groupBy !== "division" ? <span className="chip">{DIV_SHORT[t.division_slug] ?? t.division_name}</span> : <span />}
          {t.due_date && <span className="tdue">{dueLabel(t.due_date, today)}</span>}
        </div>
      </article>
    );
  }

  return (
    <>
      <div className="toolbar">
        <button className={`fpill ${divFilter === "all" ? "on" : ""}`} onClick={() => setDivFilter("all")}>All divisions</button>
        {divisions.map((d) => (
          <button key={d.slug} className={`fpill ${divFilter === d.slug ? "on" : ""}`} onClick={() => setDivFilter(d.slug)}>
            {d.name.replace(/^Sthyra\s+/, "")}
          </button>
        ))}
        <div className="spacer" />
        <span className="tool-label">Group</span>
        <div className="segctl" role="group" aria-label="Group by">
          <button className={groupBy === "none" ? "on" : ""} onClick={() => setGroupBy("none")}>None</button>
          <button className={groupBy === "project" ? "on" : ""} onClick={() => setGroupBy("project")}>Project</button>
          <button className={groupBy === "division" ? "on" : ""} onClick={() => setGroupBy("division")}>Division</button>
        </div>
        <select className="select tool-select" aria-label="Filter by assignee" value={asgFilter} onChange={(e) => setAsgFilter(e.target.value)}>
          <option value="all">All assignees</option>
          <option value="unassigned">Unassigned</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button className={`fpill ${mineOnly ? "on" : ""}`} onClick={() => setMineOnly((v) => !v)}>My tasks</button>
        <button className="btn" onClick={() => setDrawer({ mode: "create", presetStatus: "todo" })}><IconPlus size={15} />New task</button>
      </div>

      <div className="board">
        {STATUS_COLUMNS.map((col) => {
          const items = filtered.filter((t) => t.status === col.key);
          const groups = groupItems(items);
          return (
            <section
              className={`col ${dragOverCol === col.key ? "dragover" : ""}`}
              key={col.key}
              aria-label={col.label}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOverCol(null); }}
              onDrop={(e) => drop(col.key, e)}
            >
              <div className="col-head">
                <span className="ct"><span className="cdot" style={{ background: col.dot }} />{col.label}</span>
                <span className="cnt">{items.length}</span>
              </div>
              <div className="col-body">
                {items.length === 0 ? (
                  <div className="col-empty">Nothing here</div>
                ) : (
                  groups.map((g) => (
                    <div key={g.name || "all"}>
                      {groupBy !== "none" && (
                        <div className="tgroup-head">
                          <span className="tgroup-name">{g.name}</span>
                          <span className="tgroup-line" />
                          <span className="tgroup-cnt">{g.items.length}</span>
                        </div>
                      )}
                      {g.items.map((t) => <Card key={t.id} t={t} />)}
                    </div>
                  ))
                )}
              </div>
              <button className="addbtn" onClick={() => setDrawer({ mode: "create", presetStatus: col.key })}>
                <IconPlus size={13} />Add
              </button>
            </section>
          );
        })}
      </div>

      {drawer && (
        <TaskDrawer
          initialMode={drawer.mode}
          task={drawer.mode === "view" ? drawer.task : undefined}
          presetStatus={drawer.mode === "create" ? drawer.presetStatus : undefined}
          divisions={divisions}
          projects={projects}
          members={members}
          onClose={() => setDrawer(null)}
        />
      )}
    </>
  );
}
