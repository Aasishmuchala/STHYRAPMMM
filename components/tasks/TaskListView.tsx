"use client";

import type { BoardTask, TaskStage } from "@/lib/tasks-types";
import { getTaskDisplayKey, getTaskStageIcon, ITEM_TYPE_META, PRIORITY_ICON_META } from "./taskMeta";

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
                      <span className="tasks-list-priority-pill" title={priority.label} aria-label={priority.label} style={{ ["--priority-color" as string]: priority.color }}>
                        <PriorityIcon size={15} />
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
