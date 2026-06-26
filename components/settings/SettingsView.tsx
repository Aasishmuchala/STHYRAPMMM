"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateProfile, addMembership, removeMembership } from "@/app/settings/actions";
import { ThemeControls } from "./ThemeControls";
import { OmegaKeyCard } from "./OmegaKeyCard";
import type { DivisionOpt } from "@/lib/tasks-types";

type Profile = { full_name: string | null; email: string | null; global_role: string };
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
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const divName = (id: string) =>
    divisions.find((d) => d.id === id)?.name.replace(/^Sthyra\s+/, "") ?? "-";

  function run(fn: () => Promise<{ ok: true } | { error: string }>, onErr: (m: string) => void) {
    start(async () => {
      const result = await fn();
      if ("error" in result) onErr(result.error);
      else router.refresh();
    });
  }

  const [name, setName] = useState(profile.full_name ?? "");
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
    const { error } = await createClient().auth.updateUser({ password: pw });
    setPwBusy(false);

    if (error) {
      setPwMsg(error.message);
      return;
    }

    setPwOk(true);
    setPwMsg("Password updated.");
    setPw("");
    setPw2("");
  }

  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const [memberDivisionId, setMemberDivisionId] = useState(leadableDivisions[0]?.id ?? "");
  const [memberRole, setMemberRole] = useState("member");
  const [memberError, setMemberError] = useState<string | null>(null);

  return (
    <div className="settings">
      <section className="set-card">
        <h3>Appearance</h3>
        <p className="sub">Choose a theme and an optional wallpaper. Applies instantly and syncs to your account.</p>
        <ThemeControls initialTheme={initialTheme} initialWallpaper={initialWallpaper} initialAccent={initialAccent} />
      </section>

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
        {profileError && <div className="form-err">{profileError}</div>}
        <div className="modal-actions">
          {profileSaved && <span style={{ color: "var(--positive)", fontSize: 12, marginRight: "auto" }}>Saved</span>}
          <button
            className="btn"
            onClick={() => {
              setProfileError(null);
              setProfileSaved(false);
              start(async () => {
                const result = await updateProfile(name);
                if ("error" in result) {
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

      {isOwner && <OmegaKeyCard status={omegaStatus} />}

      {canManageTeam && (
        <section className="set-card">
          <h3>Member access</h3>
          <p className="sub">Verified `@sthyra.com` users appear here. Assign divisions and lead access after they join.</p>
          {members.length === 0 ? (
            <p className="sub" style={{ margin: 0 }}>No members have joined yet.</p>
          ) : (
            members.map((member) => {
              const mine = memberships.filter((item) => item.user_id === member.id);
              return (
                <div className="set-row" key={member.id} style={{ alignItems: "flex-start" }}>
                  <div className="grow">
                    <div className="rn">
                      {member.full_name ?? member.email} {member.global_role === "owner" && <span className="role-pill">owner</span>}
                    </div>
                    <div className="re">{member.email}</div>
                    <div className="member-divs">
                      {mine.length === 0 ? (
                        <span className="re">No divisions</span>
                      ) : (
                        mine.map((item) => (
                          <span className="mdiv" key={item.id}>
                            {divName(item.division_id)} - {item.role}
                            <button aria-label="Remove" onClick={() => run(() => removeMembership(item.id), setMemberError)}>
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
          {members.length > 0 && leadableDivisions.length > 0 && (
            <div className="set-add">
              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="m-user">Member</label>
                <select id="m-user" className="select" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name ?? member.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="m-div">Division</label>
                <select id="m-div" className="select" value={memberDivisionId} onChange={(e) => setMemberDivisionId(e.target.value)}>
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
                  <select id="m-role" className="select" value={memberRole} onChange={(e) => setMemberRole(e.target.value)} style={{ width: 100 }}>
                    <option value="member">Member</option>
                    {isOwner && <option value="lead">Lead</option>}
                  </select>
                  <button
                    className="btn"
                    onClick={() => {
                      setMemberError(null);
                      run(() => addMembership(memberId, memberDivisionId, memberRole), setMemberError);
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
