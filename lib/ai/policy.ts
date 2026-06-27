import { buildWorkspaceAccess, type MembershipLike } from "@/lib/access";

export type AiAudience = "owner" | "lead" | "member" | "none";

export type AiPolicy = {
  audience: AiAudience;
  canUseAssistant: boolean;
  canSeeFinance: boolean;
  canSeePipeline: boolean;
  canSeePeople: boolean;
  canSeeBriefs: boolean;
  canDraftNotes: boolean;
  canProposeActions: boolean;
  workspaceDivisionIds: Set<string>;
  manageableDivisionIds: Set<string>;
};

export function deriveAiPolicy(
  globalRole: string | null | undefined,
  memberships: MembershipLike[],
): AiPolicy {
  const access = buildWorkspaceAccess(globalRole, memberships);

  if (access.isSuperAdmin) {
    return {
      audience: "owner",
      canUseAssistant: true,
      canSeeFinance: true,
      canSeePipeline: true,
      canSeePeople: true,
      canSeeBriefs: true,
      canDraftNotes: true,
      canProposeActions: true,
      workspaceDivisionIds: access.workspaceDivisionIds,
      manageableDivisionIds: access.manageableDivisionIds,
    };
  }

  if (access.manageableDivisionIds.size > 0) {
    return {
      audience: "lead",
      canUseAssistant: true,
      canSeeFinance: false,
      canSeePipeline: false,
      canSeePeople: true,
      canSeeBriefs: false,
      canDraftNotes: true,
      canProposeActions: false,
      workspaceDivisionIds: access.workspaceDivisionIds,
      manageableDivisionIds: access.manageableDivisionIds,
    };
  }

  if (access.workspaceDivisionIds.size > 0) {
    return {
      audience: "member",
      canUseAssistant: true,
      canSeeFinance: false,
      canSeePipeline: false,
      canSeePeople: false,
      canSeeBriefs: false,
      canDraftNotes: false,
      canProposeActions: false,
      workspaceDivisionIds: access.workspaceDivisionIds,
      manageableDivisionIds: access.manageableDivisionIds,
    };
  }

  return {
    audience: "none",
    canUseAssistant: false,
    canSeeFinance: false,
    canSeePipeline: false,
    canSeePeople: false,
    canSeeBriefs: false,
    canDraftNotes: false,
    canProposeActions: false,
    workspaceDivisionIds: new Set<string>(),
    manageableDivisionIds: new Set<string>(),
  };
}

export function aiScopePrompt(policy: AiPolicy): string {
  switch (policy.audience) {
    case "owner":
      return "You may use the full workspace context that is provided.";
    case "lead":
      return [
        "The user is a lead.",
        "You may discuss only visible delivery work, team workload, team members, and documents for their divisions.",
        "Never mention or infer finance, payroll, expenses, invoices, receivables, margins, budgets, client values, or pipeline numbers.",
        "If asked about hidden business or finance data, say they do not have access to that in the assistant.",
      ].join(" ");
    case "member":
      return [
        "The user is a member.",
        "You may discuss only the tasks, work items, and documents visible in their workspace scope.",
        "Never mention or infer finance, payroll, expenses, invoices, receivables, margins, budgets, clients, pipeline, or private team/member data.",
        "If asked about hidden business or team data, say they do not have access to that in the assistant.",
      ].join(" ");
    default:
      return "The user does not have assistant access. Refuse and ask them to contact an owner.";
  }
}
