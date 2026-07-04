"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { beginToast, finishToast } from "@/lib/client-toast";
import { createDivision, deleteDivision, updateProfile, addMembership, removeMembership } from "@/app/settings/actions";
import { ThemeControls } from "./ThemeControls";
import { OmegaKeyCard } from "./OmegaKeyCard";
import { TeamRolesCard, type CompanyRole, type RolePerson } from "./TeamRolesCard";
import { KnowledgeCard, type KnowledgeEntry } from "./KnowledgeCard";
import { AttendanceLocationsCard, type AttendanceLocation } from "./AttendanceLocationsCard";
import type { DivisionOpt } from "@/lib/tasks-types";

type Profile = { full_name: string | null; email: string | null; global_role: string; phone?: string | null };
type Member = { id: string; full_name: string | null; email: string | null; global_role: string };
type Membership = { id: string; user_id: string; division_id: string; role: string };

function X() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function SettingsView({
  profile,
  isOwner,
  canManageTeam,
  leadableDivisions,
  members,
  memberships,
  divisions,
  initialTheme,
  initialWallpaper,
  initialAccent,
  omegaStatus,
  companyRoles = [],
  roleAssignments = {},
  knowledge = [],
  attendanceLocations = [],
}: {
  profile: Profile;
  isOwner: boolean;
  canManageTeam: boolean;
  leadableDivisions: DivisionOpt[];
  members: Member[];
  memberships: Membership[];
  divisions: DivisionOpt[];
  initialTheme: string;
  initialWallpaper: string | null;
  initialAccent: string | null;
  omegaStatus: { configured: boolean; last4?: string; updated_at?: string } | null;
  companyRoles?: CompanyRole[];
  roleAssignments?: Record<string, string[]>;
  knowledge?: KnowledgeEntry[];
  attendanceLocations?: AttendanceLocation[];
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const divName = (id: string) =>
    divisions.find((d) => d.id === id)?.name.replace(/^Sthyra\s+/, "") ?? "-";
  const memberName = (id: string) =>
    members.find((member) => member.id === id)?.full_name
    ?? members.find((member) => member.id === id)?.email
    ?? "That member";

  const [name, setName] = useState(profile.full_name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    setPwOk(false);

    if (pw.length < 8) {
      setPwMsg("Use at least 8 characters");
      return;
    }
    if (pw !== pw2) {
      setPwMsg("Passwords don't match");
      return;
    }

    setPwBusy(true);
    const toastId = beginToast("Updating password...");
    const { error } = await createClient().auth.updateUser({ password: pw });
    setPwBusy(false);

    if (error) {
      finishToast({ error: error.message }, { id: toastId, success: "" });
      setPwMsg(error.message);
      return;
    }

    finishToast({ ok: true }, { id: toastId, success: "Password updated." });
    setPwOk(true);
    setPwMsg("Password updated.");
    setPw("");
    setPw2("");
  }

  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const [memberDivisionId, setMemberDivisionId] = useState(leadableDivisions[0]?.id ?? "");
  const [memberRole, setMemberRole] = useState("member");
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberMessage, setMemberMessage] = useState<string | null>(null);
  const [memberBusy, setMemberBusy] = useState<"update" | `remove:${string}` | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  function handleCompanyDelete(divisionId: string, displayName: string) {
    setCompanyError(null);
    start(async () => {
      const toastId = beginToast("Deleting company…");
      const result = await deleteDivision(divisionId);
      if (!finishToast(result, { id: toastId, success: `Deleted ${displayName} and all its data.` })) {
        setCompanyError(result.error);
        return;
      }
      setDeletingId(null);
      setDeleteConfirm("");
      router.refresh();
    });
  }

  // Group the (otherwise very long) settings into tabs. A plain member sees only
  // Appearance + Account; managers/owners get Team and AI too.
  const tabs = [
    { key: "appearance", label: "Appearance" },
    { key: "account", label: "Account" },
    ...(canManageTeam || isOwner ? [{ key: "team", label: "Team & companies" }] : []),
    ...(canManageTeam ? [{ key: "attendance", label: "Attendance" }] : []),
    ...(isOwner ? [{ key: "ai", label: "AI assistant" }] : []),
  ];
  const [tab, setTab] = useState("appearance");

  function handleMembershipUpdate() {
    setMemberError(null);
    setMemberMessage(null);
    setMemberBusy("update");
    start(async () => {
      const toastId = beginToast("Updating member access...");
      const result = await addMembership(memberId, memberDivisionId, memberRole);
      setMemberBusy(null);
      if (!finishToast(result, { id: toastId, success: `${memberName(memberId)} updated.` })) {
        setMemberError(result.error);
        return;
      }
      setMemberMessage(`${memberName(memberId)} is now ${memberRole} in ${divName(memberDivisionId)}.`);
      router.refresh();
    });
  }

  function handleMembershipRemove(id: string, divisionId: string) {
    setMemberError(null);
    setMemberMessage(null);
    setMemberBusy(`remove:${id}`);
    start(async () => {
      const toastId = beginToast("Removing member access...");
      const result = await removeMembership(id);
      setMemberBusy(null);
      if (!finishToast(result, { id: toastId, success: "Member access removed." })) {
        setMemberError(result.error);
        return;
      }
      setMemberMessage(`Access removed from ${divName(divisionId)}.`);
      router.refresh();
    });
  }

  return (
    <div className="settings">
      <div role="tablist" aria-label="Settings sections" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className="pill"
            onClick={() => setTab(t.key)}
            style={tab === t.key ? { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "appearance" && (
      <section className="set-card">
        <h3>Appearance</h3>
        <p className="sub">Choose a theme and an optional wallpaper. Applies instantly and syncs to your account.</p>
        <ThemeControls initialTheme={initialTheme} initialWallpaper={initialWallpaper} initialAccent={initialAccent} />
      </section>
      )}

      {tab === "account" && (
      <section className="set-card">
        <h3>Profile</h3>
        <p className="sub">Your name as it appears across the workspace.</p>
        <div className="field">
          <label className="label" htmlFor="s-name">Full name</label>
          <input
            id="s-name"
            className="input"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setProfileSaved(false);
            }}
          />
        </div>
        <div className="field">
          <label className="label">Email</label>
          <input className="input" value={profile.email ?? ""} disabled style={{ opacity: 0.6 }} />
        </div>
        <div className="field">
          <label className="label" htmlFor="s-phone">Phone number</label>
          <input
            id="s-phone"
            className="input"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setProfileSaved(false);
            }}
            placeholder="+91 98765 43210"
          />
          <p className="sub" style={{ marginTop: 6, marginBottom: 0 }}>Used for attendance reminders (WhatsApp/SMS) once messaging is enabled.</p>
        </div>
        {profileError && <div className="form-err">{profileError}</div>}
        <div className="modal-actions">
          {profileSaved && <span style={{ color: "var(--positive)", fontSize: 12, marginRight: "auto" }}>Saved</span>}
          <button
            className="btn"
            onClick={() => {
              setProfileError(null);
              setProfileSaved(false);
              start(async () => {
                const toastId = beginToast("Saving profile...");
                const result = await updateProfile(name, phone);
                if (!finishToast(result, { id: toastId, success: "Profile saved." })) {
                  setProfileError(result.error);
                  return;
                }
                setProfileSaved(true);
                router.refresh();
              });
            }}
          >
            Save
          </button>
        </div>
      </section>
      )}

      {tab === "account" && (
      <section className="set-card">
        <h3>Password</h3>
        <p className="sub">Set a new password after you verify your company email.</p>
        <form onSubmit={changePassword}>
          <div className="field-row">
            <div className="field">
              <label className="label" htmlFor="s-pw">New password</label>
              <input id="s-pw" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="field">
              <label className="label" htmlFor="s-pw2">Confirm</label>
              <input id="s-pw2" type="password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          {pwMsg && (
            <div className="form-err" style={{ color: pwOk ? "var(--positive)" : "var(--danger)" }}>
              {pwMsg}
            </div>
          )}
          <div className="modal-actions">
            <button type="submit" className="btn" disabled={pwBusy}>
              {pwBusy ? "Updating..." : "Update password"}
            </button>
          </div>
        </form>
      </section>
      )}

      {tab === "ai" && isOwner && <OmegaKeyCard status={omegaStatus} />}

      {tab === "team" && isOwner && (
        <section className="set-card">
          <h3>Companies</h3>
          <p className="sub">Super admins can add a new company workspace, then assign that company&apos;s owner from Member access below.</p>
          <div className="set-add">
            <div className="field" style={{ margin: 0 }}>
              <label className="label" htmlFor="company-name">Company name</label>
              <input id="company-name" className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Sthyra Interiors" />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label className="label" htmlFor="company-slug">Slug</label>
              <input id="company-slug" className="input" value={companySlug} onChange={(e) => setCompanySlug(e.target.value)} placeholder="sthyra_interiors" />
            </div>
            <div className="field" style={{ margin: 0, alignSelf: "end" }}>
              <button
                className="btn"
                onClick={() => {
                  setCompanyError(null);
                  start(async () => {
                    const toastId = beginToast("Creating company...");
                    const result = await createDivision(companyName, companySlug);
                    if (!finishToast(result, { id: toastId, success: "Company created." })) {
                      setCompanyError(result.error);
                      return;
                    }
                    setCompanyName("");
                    setCompanySlug("");
                    router.refresh();
                  });
                }}
              >
                Create company
              </button>
            </div>
          </div>
          {companyError && <div className="form-err" style={{ marginTop: 12 }}>{companyError}</div>}

          {divisions.length > 0 && (
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
              <h4 style={{ margin: "0 0 4px", color: "var(--danger)" }}>Danger zone — delete a company</h4>
              <p className="sub" style={{ marginTop: 0 }}>
                Deleting a company permanently removes <strong>all</strong> of its projects, tasks, finances, documents,
                members and attendance. This cannot be undone.
              </p>
              {divisions.map((d) => {
                const label = d.name.replace(/^Sthyra\s+/, "");
                return (
                  <div className="set-row" key={d.id} style={{ alignItems: "center" }}>
                    <div className="grow"><div className="rn">{label}</div></div>
                    {deletingId === d.id ? (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input
                          className="input"
                          style={{ width: 200 }}
                          placeholder={`Type "${label}" to confirm`}
                          value={deleteConfirm}
                          onChange={(e) => setDeleteConfirm(e.target.value)}
                          autoFocus
                        />
                        <button
                          className="btn"
                          style={{ background: "var(--danger)", borderColor: "var(--danger)", color: "#fff" }}
                          disabled={deleteConfirm.trim() !== label}
                          onClick={() => handleCompanyDelete(d.id, label)}
                        >
                          Delete forever
                        </button>
                        <button className="btn" onClick={() => { setDeletingId(null); setDeleteConfirm(""); }}>Cancel</button>
                      </div>
                    ) : (
                      <button
                        className="btn"
                        style={{ color: "var(--danger)" }}
                        onClick={() => { setDeletingId(d.id); setDeleteConfirm(""); setCompanyError(null); }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === "team" && canManageTeam && (
        <section className="set-card">
          <h3>Member access</h3>
          <p className="sub">Verified `@sthyra.com` users appear here. Assign or update each person&apos;s company role as owner, lead, accountant, or member.</p>
          {members.length === 0 ? (
            <p className="sub" style={{ margin: 0 }}>No members have joined yet.</p>
          ) : (
            members.map((member) => {
              const mine = memberships.filter((item) => item.user_id === member.id);
              return (
                <div className="set-row" key={member.id} style={{ alignItems: "flex-start" }}>
                  <div className="grow">
                    <div className="rn">
                      {member.full_name ?? member.email}
                      {member.global_role === "super_admin" && <span className="role-pill">super admin</span>}
                      {member.global_role === "owner" && <span className="role-pill">legacy owner</span>}
                    </div>
                    <div className="re">{member.email}</div>
                    <div className="member-divs">
                      {mine.length === 0 ? (
                        <span className="re">No divisions</span>
                      ) : (
                        mine.map((item) => (
                          <span className="mdiv" key={item.id}>
                            {divName(item.division_id)} - {item.role}
                            <button
                              aria-label="Remove"
                              disabled={memberBusy !== null}
                              onClick={() => handleMembershipRemove(item.id, item.division_id)}
                            >
                              <X />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {memberError && <div className="form-err" style={{ marginTop: 12 }}>{memberError}</div>}
          {memberMessage && <div className="form-err" style={{ marginTop: 12, color: "var(--positive)" }}>{memberMessage}</div>}
          {members.length > 0 && leadableDivisions.length > 0 && (
            <div className="set-add">
              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="m-user">Member</label>
                <select
                  id="m-user"
                  className="select"
                  value={memberId}
                  onChange={(e) => {
                    setMemberId(e.target.value);
                    setMemberError(null);
                    setMemberMessage(null);
                  }}
                >
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name ?? member.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="m-div">Division</label>
                <select
                  id="m-div"
                  className="select"
                  value={memberDivisionId}
                  onChange={(e) => {
                    setMemberDivisionId(e.target.value);
                    setMemberError(null);
                    setMemberMessage(null);
                  }}
                >
                  {leadableDivisions.map((division) => (
                    <option key={division.id} value={division.id}>
                      {division.name.replace(/^Sthyra\s+/, "")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="m-role">Role</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <select
                    id="m-role"
                    className="select"
                    value={memberRole}
                    onChange={(e) => {
                      setMemberRole(e.target.value);
                      setMemberError(null);
                      setMemberMessage(null);
                    }}
                    style={{ width: 140 }}
                  >
                    <option value="member">Member</option>
                    <option value="accountant">Accountant</option>
                    <option value="lead">Lead</option>
                    {isOwner && <option value="owner">Owner</option>}
                  </select>
                  <button
                    type="button"
                    className="btn"
                    disabled={memberBusy !== null}
                    onClick={handleMembershipUpdate}
                  >
                    {memberBusy === "update" ? "Updating..." : "Update"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === "team" && isOwner && (
        <TeamRolesCard
          people={members as RolePerson[]}
          roles={companyRoles}
          assignments={roleAssignments}
        />
      )}

      {tab === "attendance" && canManageTeam && (
        <AttendanceLocationsCard locations={attendanceLocations} divisions={leadableDivisions} />
      )}

      {tab === "ai" && isOwner && <KnowledgeCard entries={knowledge} />}
    </div>
  );
}
