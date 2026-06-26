"use client";

import type { CycleOpt, DivisionOpt, MemberOpt, ModuleOpt, WorkItemType } from "@/lib/tasks-types";
import { FiFilter, FiGrid, FiLayers, FiList, FiPlus, FiUser } from "react-icons/fi";
import { ITEM_TYPE_META } from "./taskMeta";

type GroupBy = "none" | "project" | "division";
type ViewMode = "board" | "list";

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "No grouping" },
  { value: "project", label: "Group by project" },
  { value: "division", label: "Group by division" },
];

const TYPE_OPTIONS: WorkItemType[] = ["epic", "story", "task", "bug", "improvement", "subtask"];

export function TaskToolbar({
  view,
  onViewChange,
  divFilter,
  onDivFilterChange,
  asgFilter,
  onAsgFilterChange,
  typeFilter,
  onTypeFilterChange,
  cycleFilter,
  onCycleFilterChange,
  moduleFilter,
  onModuleFilterChange,
  groupBy,
  onGroupByChange,
  mineOnly,
  onToggleMineOnly,
  divisions,
  members,
  cycles,
  modules,
  canManageWorkflow,
  workflowOpen,
  onToggleWorkflow,
  onAdd,
}: {
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  divFilter: string;
  onDivFilterChange: (v: string) => void;
  asgFilter: string;
  onAsgFilterChange: (v: string) => void;
  typeFilter: "all" | WorkItemType;
  onTypeFilterChange: (v: "all" | WorkItemType) => void;
  cycleFilter: string;
  onCycleFilterChange: (v: string) => void;
  moduleFilter: string;
  onModuleFilterChange: (v: string) => void;
  groupBy: GroupBy;
  onGroupByChange: (v: GroupBy) => void;
  mineOnly: boolean;
  onToggleMineOnly: () => void;
  divisions: DivisionOpt[];
  members: MemberOpt[];
  cycles: CycleOpt[];
  modules: ModuleOpt[];
  canManageWorkflow: boolean;
  workflowOpen: boolean;
  onToggleWorkflow: () => void;
  onAdd: () => void;
}) {
  return (
    <section className="tasks-toolbar-shell" aria-label="Work items toolbar">
      <div className="tasks-toolbar-main">
        <div className="tasks-toolbar-copy">
          <div className="workspace-tag">Work items</div>
        </div>

        <div className="tasks-toolbar-actions">
          <div className="tasks-view-toggle" role="group" aria-label="View mode">
            <button type="button" className={view === "board" ? "on" : ""} onClick={() => onViewChange("board")}>
              <FiGrid size={14} />
              Board
            </button>
            <button type="button" className={view === "list" ? "on" : ""} onClick={() => onViewChange("list")}>
              <FiList size={14} />
              List
            </button>
          </div>

          <button type="button" className={`tasks-pill ${mineOnly ? "on" : ""}`} onClick={onToggleMineOnly} aria-pressed={mineOnly}>
            <FiUser size={14} />
            My items
          </button>

          {canManageWorkflow && (
            <button type="button" className={`tasks-pill ${workflowOpen ? "on" : ""}`} onClick={onToggleWorkflow}>
              <FiLayers size={14} />
              {workflowOpen ? "Hide workflow" : "Edit workflow"}
            </button>
          )}

          <button type="button" className="btn" onClick={onAdd}>
            <FiPlus size={14} />
            Add work item
          </button>
        </div>
      </div>

      <div className="tasks-filters-row">
        <div className="tasks-filter-label">
          <FiFilter size={14} />
          Filters
        </div>

        <select aria-label="Division scope" className="select" value={divFilter} onChange={(event) => onDivFilterChange(event.target.value)}>
          <option value="all">All divisions</option>
          {divisions.map((division) => (
            <option key={division.slug} value={division.slug}>{division.name.replace(/^Sthyra\s+/, "")}</option>
          ))}
        </select>

        <select aria-label="Assignee" className="select" value={asgFilter} onChange={(event) => onAsgFilterChange(event.target.value)}>
          <option value="all">All assignees</option>
          <option value="unassigned">Unassigned</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>{member.name}</option>
          ))}
        </select>

        <select aria-label="Cycle" className="select" value={cycleFilter} onChange={(event) => onCycleFilterChange(event.target.value)}>
          <option value="all">All cycles</option>
          {cycles.map((cycle) => (
            <option key={cycle.id} value={cycle.id}>{cycle.name}</option>
          ))}
        </select>

        <select aria-label="Module" className="select" value={moduleFilter} onChange={(event) => onModuleFilterChange(event.target.value)}>
          <option value="all">All modules</option>
          {modules.map((module) => (
            <option key={module.id} value={module.id}>{module.name}</option>
          ))}
        </select>

        <select aria-label="Group by" className="select" value={groupBy} onChange={(event) => onGroupByChange(event.target.value as GroupBy)}>
          {GROUP_OPTIONS.map((group) => (
            <option key={group.value} value={group.value}>{group.label}</option>
          ))}
        </select>
      </div>

      <div className="tasks-type-strip" aria-label="Work item types">
        {TYPE_OPTIONS.map((value) => {
          const type = ITEM_TYPE_META[value];
          const Icon = type.Icon;
          const active = typeFilter === value;
          return (
            <button
              key={value}
              type="button"
              className={`tasks-type-pill ${active ? "on" : ""}`}
              onClick={() => onTypeFilterChange(active ? "all" : value)}
              style={{ ["--pill-color" as string]: type.color }}
            >
              <Icon size={14} />
              {type.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
