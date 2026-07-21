"use client";

import type { BoardTask, TaskStage } from "@/lib/tasks-types";
import { getTaskDisplayKey, getTaskStageIcon, ITEM_TYPE_META, PRIORITY_ICON_META } from "./taskMeta";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "U";
}

function ListAssignees({ task }: { task: BoardTask }) {
  if (task.assignees.length === 0 && !task.assignee_name) {
    return <span className="tasks-list-assignee-empty">Unassigned</span>;
  }

  const assignees = task.assignees.length ? task.assignees : task.assignee_id ? [{ id: task.assignee_id, name: task.assignee_name ?? "Assigned" }] : [];
  const visible = assignees.slice(0, 3);
  const hidden = assignees.length - visible.length;

  return (
    <span className="tasks-list-assignees" title={assignees.map((assignee) => assignee.name).join(", ")}>
      <span className="task-avatar-stack">
        {visible.map((assignee, index) => (
          <span key={assignee.id} className="task-avatar" style={{ background: `hsl(${(index * 67 + assignee.name.length * 19) % 360} 68% 46%)` }}>
            {initials(assignee.name)}
          </span>
        ))}
        {hidden > 0 && <span className="task-avatar task-avatar-more">+{hidden}</span>}
      </span>
      <span className="tasks-list-assignee-names">{assignees.map((assignee) => assignee.name).join(", ")}</span>
    </span>
  );
}

export function TaskListView({
  tasks,
  stages,
  onOpen,
}: {
  tasks: BoardTask[];
  stages: TaskStage[];
  onOpen: (task: BoardTask) => void;
}) {
  const stageGroups = stages
    .map((stage) => ({
      stage,
      items: tasks.filter((task) => (task.stage_group_id ?? task.status) === stage.id),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="tasks-list-shell">
      {tasks.length === 0 ? (
        <div className="tasks-list-empty">No work items match the current filters.</div>
      ) : (
        stageGroups.map(({ stage, items }) => {
          const StageIcon = getTaskStageIcon(stage);
          return (
            <section key={stage.id} className="tasks-list-stage-group" aria-label={stage.label}>
              <div className="tasks-list-stage-head">
                <span className="tasks-list-stage-name">
                  <StageIcon className="tasks-list-stage-icon" size={15} style={{ color: stage.color }} />
                  {stage.label}
                </span>
                <span className="tasks-list-stage-count">{items.length}</span>
              </div>
              <div className="tasks-list-stage-body">
                {items.map((task) => {
                  const type = ITEM_TYPE_META[task.item_type];
                  const TypeIcon = type.Icon;
                  const priority = PRIORITY_ICON_META[task.priority];
                  const PriorityIcon = priority.Icon;
                  return (
                    <button key={task.id} className="tasks-list-item" onClick={() => onOpen(task)} aria-label={`Open ${task.title}`}>
                      <span className="tasks-list-item-main">
                        <span className="tasks-list-item-typebox" style={{ background: `${type.color}14`, color: type.color }}>
                          <TypeIcon size={14} />
                        </span>
                        <span className="tasks-list-item-key">{getTaskDisplayKey(task)}</span>
                        <span className="tasks-list-item-title">{task.title}</span>
                      </span>
                      <ListAssignees task={task} />
                      <span className="tasks-list-due">{task.due_date ? new Date(task.due_date).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" }) : "No due"}</span>
                      <span className="tasks-list-priority-pill" title={priority.label} aria-label={priority.label} style={{ ["--priority-color" as string]: priority.color }}>
                        <PriorityIcon size={15} />
                        <span>{priority.label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
