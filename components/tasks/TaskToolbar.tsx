"use client";

import { useMemo, useState } from "react";
import type { CycleOpt, DivisionOpt, MemberOpt, ModuleOpt, WorkItemType } from "@/lib/tasks-types";
import { FiCheck, FiGrid, FiLayers, FiList, FiPlus, FiSliders, FiUser, FiX } from "react-icons/fi";
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
  canAdd = true,
  workflowOpen,
  onToggleWorkflow,
  onAdd,
  filteredCount,
  stageCount,
  overdueCount,
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
  canAdd?: boolean;
  workflowOpen: boolean;
  onToggleWorkflow: () => void;
  onAdd: () => void;
  filteredCount: number;
  stageCount: number;
  overdueCount: number;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (divFilter !== "all") count += 1;
    if (asgFilter !== "all") count += 1;
    if (cycleFilter !== "all") count += 1;
    if (moduleFilter !== "all") count += 1;
    if (groupBy !== "none") count += 1;
    if (typeFilter !== "all") count += 1;
    if (mineOnly) count += 1;
    return count;
  }, [asgFilter, cycleFilter, divFilter, groupBy, mineOnly, moduleFilter, typeFilter]);

  function clearFilters() {
    onDivFilterChange("all");
    onAsgFilterChange("all");
    onCycleFilterChange("all");
    onModuleFilterChange("all");
    onGroupByChange("none");
    onTypeFilterChange("all");
    if (mineOnly) onToggleMineOnly();
  }

  return (
    <section className="tasks-toolbar-shell" aria-label="Work items toolbar">
      <div className="tasks-toolbar-main">
        <div className="tasks-toolbar-copy">
          <div className="tasks-toolbar-summary">
            <div className="workspace-tag">Work items</div>
            <div className="tasks-toolbar-stats" aria-label="Board summary">
              <span><strong>{filteredCount}</strong> visible</span>
              <span><strong>{stageCount}</strong> stages</span>
              <span><strong>{overdueCount}</strong> overdue</span>
            </div>
          </div>
        </div>

        <div className="tasks-toolbar-actions">
          <div className="tasks-filter-menu">
            <button
              type="button"
              className={`tasks-pill tasks-filter-trigger ${filtersOpen ? "on" : ""}`}
              onClick={() => setFiltersOpen((value) => !value)}
              aria-expanded={filtersOpen}
            >
              <FiSliders size={14} />
              Filter
              {activeFilterCount > 0 && <span className="tasks-filter-count">{activeFilterCount}</span>}
            </button>

          </div>

          <div className="tasks-view-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={view === "board" ? "on" : ""}
              onClick={() => onViewChange("board")}
              aria-label="Board view"
              title="Board view"
            >
              <FiGrid size={14} />
            </button>
            <button
              type="button"
              className={view === "list" ? "on" : ""}
              onClick={() => onViewChange("list")}
              aria-label="List view"
              title="List view"
            >
              <FiList size={14} />
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

          <button type="button" className="btn" onClick={onAdd} disabled={!canAdd}>
            <FiPlus size={14} />
            {canAdd ? "Add work item" : "No add access"}
          </button>
        </div>
      </div>
      {filtersOpen && (
        <div className="tasks-filter-layer" role="presentation">
          <button type="button" className="tasks-filter-scrim" aria-label="Close filters" onClick={() => setFiltersOpen(false)} />
          <div className="tasks-filter-popover" role="dialog" aria-label="Filter work items">
            <div className="tasks-filter-popover-head">
              <div>
                <span>Refine view</span>
                <strong>{activeFilterCount ? `${activeFilterCount} active` : "No filters"}</strong>
              </div>
              <button type="button" className="iconbtn" onClick={() => setFiltersOpen(false)} aria-label="Close filters">
                <FiX size={16} />
              </button>
            </div>

            <div className="tasks-filter-grid">
              <label className="tasks-filter-field">
                <span>Division</span>
                <select aria-label="Division scope" className="select" value={divFilter} onChange={(event) => onDivFilterChange(event.target.value)}>
                  <option value="all">All divisions</option>
                  {divisions.map((division) => (
                    <option key={division.slug} value={division.slug}>{division.name.replace(/^Sthyra\s+/, "")}</option>
                  ))}
                </select>
              </label>

              <label className="tasks-filter-field">
                <span>Assignee</span>
                <select aria-label="Assignee" className="select" value={asgFilter} onChange={(event) => onAsgFilterChange(event.target.value)}>
                  <option value="all">All assignees</option>
                  <option value="unassigned">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>{member.name}</option>
                  ))}
                </select>
              </label>

              <label className="tasks-filter-field">
                <span>Cycle</span>
                <select aria-label="Cycle" className="select" value={cycleFilter} onChange={(event) => onCycleFilterChange(event.target.value)}>
                  <option value="all">All cycles</option>
                  {cycles.map((cycle) => (
                    <option key={cycle.id} value={cycle.id}>{cycle.name}</option>
                  ))}
                </select>
              </label>

              <label className="tasks-filter-field">
                <span>Module</span>
                <select aria-label="Module" className="select" value={moduleFilter} onChange={(event) => onModuleFilterChange(event.target.value)}>
                  <option value="all">All modules</option>
                  {modules.map((module) => (
                    <option key={module.id} value={module.id}>{module.name}</option>
                  ))}
                </select>
              </label>

              <label className="tasks-filter-field tasks-filter-field-wide">
                <span>Grouping</span>
                <select aria-label="Group by" className="select" value={groupBy} onChange={(event) => onGroupByChange(event.target.value as GroupBy)}>
                  {GROUP_OPTIONS.map((group) => (
                    <option key={group.value} value={group.value}>{group.label}</option>
                  ))}
                </select>
              </label>
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

            <div className="tasks-filter-popover-actions">
              <button type="button" className="btn-ghost" onClick={clearFilters}>
                <FiX size={14} />
                Clear
              </button>
              <button type="button" className="btn" onClick={() => setFiltersOpen(false)}>
                <FiCheck size={14} />
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
