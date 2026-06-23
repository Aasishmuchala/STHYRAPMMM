"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateProfile, addInvite, removeInvite, addMembership, removeMembership } from "@/app/settings/actions";
import { ThemeControls } from "./ThemeControls";
import { OmegaKeyCard } from "./OmegaKeyCard";
import type { DivisionOpt } from "@/lib/tasks-types";

type Profile = { full_name: string | null; email: string | null; global_role: string };
type Invite = { email: string; full_name: string | null; global_role: string; invite_division_id: string | null; invite_division_role: string | null };
type Member = { id: string; full_name: string | null; email: string | null; global_role: string };
type Membership = { id: string; user_id: string; division_id: string; role: string };

function X() {
  return <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>;
}
function Copy() {
  return <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>;
}
function Tick() {
  return <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--positive)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6" /></svg>;
}

export function SettingsView({
  profile, isOwner, canManageTeam, leadableDivisions, invites, members, memberships, divisions, initialTheme, initialWallpaper, omegaStatus,
}: {
  profile: Profile; isOwner: boolean; canManageTeam: boolean; leadableDivisions: DivisionOpt[];
  invites: Invite[]; members: Member[]; memberships: Membership[]; divisions: DivisionOpt[];
  initialTheme: string; initialWallpaper: string | null;
  omegaStatus: { configured: boolean; last4?: string; updated_at?: string } | null;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const divName = (id: string) => divisions.find((d) => d.id === id)?.name.replace(/^Sthyra\s+/, "") ?? "—";

  function run(fn: () => Promise<{ ok: true } | { error: string }>, onErr: (m: string) => void) {
    start(async () => { const r = await fn(); if ("error" in r) onErr(r.error); else router.refresh(); });
  }

  // profile
  const [name, setName] = useState(profile.full_name ?? "");
  const [pErr, setPErr] = useState<string | null>(null);
  const [pSaved, setPSaved] = useState(false);

  // password
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false); const [pwMsg, setPwMsg] = useState<string | null>(null); const [pwOk, setPwOk] = useState(false);
  async function changePassword(e: React.FormEvent) {
    e.preventDefault(); setPwMsg(null); setPwOk(false);
    if (pw.length < 8) { setPwMsg("Use at least 8 characters"); return; }
    if (pw !== pw2) { setPwMsg("Passwords don't match"); return; }
    setPwBusy(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setPwBusy(false);
    if (error) { setPwMsg(error.message); return; }
    setPwOk(true); setPwMsg("Password updated."); setPw(""); setPw2("");
  }

  // composed access options
  const accessOptions: { value: string; label: string }[] = [];
  if (isOwner) accessOptions.push({ value: "owner", label: "Owner — full admin" });
  for (const d of leadableDivisions) {
    const dn = d.name.replace(/^Sthyra\s+/, "");
    if (isOwner) accessOptions.push({ value: `${d.id}:lead`, label: `${dn} — Lead` });
    accessOptions.push({ value: `${d.id}:member`, label: `${dn} — Member` });
  }

  // invite
  const [iEmail, setIEmail] = useState(""); const [iName, setIName] = useState("");
  const [iAccess, setIAccess] = useState(accessOptions[0]?.value ?? ""); const [iErr, setIErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function submitInvite() {
    setIErr(null);
    if (!iAccess) { setIErr("Pick an access level"); return; }
    const payload = iAccess === "owner"
      ? { g: "owner", d: null as string | null, r: "member" }
      : { g: "member", d: iAccess.split(":")[0], r: iAccess.split(":")[1] };
    run(() => addInvite(iEmail, iName, payload.g, payload.d, payload.r), setIErr);
    setIEmail(""); setIName("");
  }
  function copyLink(email: string) {
    const url = `${window.location.origin}/signup?email=${encodeURIComponent(email)}`;
    navigator.clipboard?.writeText(url);
    setCopied(email);
    setTimeout(() => setCopied(null), 1600);
  }
  const joinedEmails = new Set(members.map((m) => (m.email ?? "").toLowerCase()));
  function inviteLabel(inv: Invite) {
    if (inv.global_role === "owner") return "Owner";
    if (inv.invite_division_id) return `${divName(inv.invite_division_id)} · ${inv.invite_division_role ?? "member"}`;
    return "Member";
  }

  // membership
  const [mUser, setMUser] = useState(members[0]?.id ?? "");
  const [mDiv, setMDiv] = useState(leadableDivisions[0]?.id ?? "");
  const [mRole, setMRole] = useState("member"); const [mErr, setMErr] = useState<string | null>(null);

  return (
    <div className="settings">
      <section className="set-card">
        <h3>Appearance</h3>
        <p className="sub">Choose a theme and an optional wallpaper. Applies instantly and syncs to your account.</p>
        <ThemeControls initialTheme={initialTheme} initialWallpaper={initialWallpaper} />
      </section>

      <section className="set-card">
        <h3>Profile</h3>
        <p className="sub">Your name as it appears across the workspace.</p>
        <div className="field"><label className="label" htmlFor="s-name">Full name</label><input id="s-name" className="input" value={name} onChange={(e) => { setName(e.target.value); setPSaved(false); }} /></div>
        <div className="field"><label className="label">Email</label><input className="input" value={profile.email ?? ""} disabled style={{ opacity: 0.6 }} /></div>
        {pErr && <div className="form-err">{pErr}</div>}
        <div className="modal-actions">
          {pSaved && <span style={{ color: "var(--positive)", fontSize: 12, marginRight: "auto" }}>Saved</span>}
          <button className="btn" onClick={() => { setPErr(null); setPSaved(false); start(async () => { const r = await updateProfile(name); if ("error" in r) { setPErr(r.error); return; } setPSaved(true); router.refresh(); }); }}>Save</button>
        </div>
      </section>

      <section className="set-card">
        <h3>Password</h3>
        <p className="sub">Set a new password — replace the provisioned temporary one.</p>
        <form onSubmit={changePassword}>
          <div className="field-row">
            <div className="field"><label className="label" htmlFor="s-pw">New password</label><input id="s-pw" type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></div>
            <div className="field"><label className="label" htmlFor="s-pw2">Confirm</label><input id="s-pw2" type="password" className="input" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></div>
          </div>
          {pwMsg && <div className="form-err" style={{ color: pwOk ? "var(--positive)" : "var(--danger)" }}>{pwMsg}</div>}
          <div className="modal-actions"><button type="submit" className="btn" disabled={pwBusy}>{pwBusy ? "Updating…" : "Update password"}</button></div>
        </form>
      </section>

      {isOwner && <OmegaKeyCard status={omegaStatus} />}

      {canManageTeam && (
        <>
          <section className="set-card">
            <h3>Invite a teammate</h3>
            <p className="sub">{isOwner ? "Add anyone and choose their access. " : "Add members to your division. "}They set their own password from the invite link — copy it and send it to them.</p>
            {invites.length === 0 ? <p className="sub" style={{ margin: 0 }}>No invites yet.</p> : invites.map((inv) => {
              const joined = joinedEmails.has(inv.email.toLowerCase());
              return (
                <div className="set-row" key={inv.email}>
                  <div className="grow"><div className="rn">{inv.full_name ?? inv.email}</div>{inv.full_name && <div className="re">{inv.email}</div>}</div>
                  <span className="role-pill">{inviteLabel(inv)}</span>
                  {joined ? <span className="re" style={{ color: "var(--positive)" }}>joined</span> : (
                    <button className="iconbtn" title="Copy invite link" aria-label="Copy invite link" onClick={() => copyLink(inv.email)}>{copied === inv.email ? <Tick /> : <Copy />}</button>
                  )}
                  <button className="iconbtn danger" aria-label="Remove" onClick={() => run(() => removeInvite(inv.email), setIErr)}><X /></button>
                </div>
              );
            })}
            {iErr && <div className="form-err" style={{ marginTop: 12 }}>{iErr}</div>}
            <div className="set-add">
              <div className="field" style={{ margin: 0 }}><label className="label" htmlFor="i-name">Name</label><input id="i-name" className="input" value={iName} onChange={(e) => setIName(e.target.value)} placeholder="Their name" /></div>
              <div className="field" style={{ margin: 0 }}><label className="label" htmlFor="i-email">Email</label><input id="i-email" className="input" value={iEmail} onChange={(e) => setIEmail(e.target.value)} placeholder="teammate@sthyra.in" /></div>
              <div className="field" style={{ margin: 0 }}>
                <label className="label" htmlFor="i-access">Access</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <select id="i-access" className="select" value={iAccess} onChange={(e) => setIAccess(e.target.value)} style={{ minWidth: 150 }}>
                    {accessOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <button className="btn" onClick={submitInvite}>Add</button>
                </div>
              </div>
            </div>
          </section>

          <section className="set-card">
            <h3>Member access</h3>
            <p className="sub">Which divisions each member can see, and whether they lead it.</p>
            {members.length === 0 ? <p className="sub" style={{ margin: 0 }}>No members have joined yet.</p> : members.map((m) => {
              const mine = memberships.filter((x) => x.user_id === m.id);
              return (
                <div className="set-row" key={m.id} style={{ alignItems: "flex-start" }}>
                  <div className="grow">
                    <div className="rn">{m.full_name ?? m.email} {m.global_role === "owner" && <span className="role-pill">owner</span>}</div>
                    <div className="re">{m.email}</div>
                    <div className="member-divs">
                      {mine.length === 0 ? <span className="re">No divisions</span> : mine.map((x) => (
                        <span className="mdiv" key={x.id}>{divName(x.division_id)} · {x.role}<button aria-label="Remove" onClick={() => run(() => removeMembership(x.id), setMErr)}><X /></button></span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            {mErr && <div className="form-err" style={{ marginTop: 12 }}>{mErr}</div>}
            {members.length > 0 && leadableDivisions.length > 0 && (
              <div className="set-add">
                <div className="field" style={{ margin: 0 }}><label className="label" htmlFor="m-user">Member</label><select id="m-user" className="select" value={mUser} onChange={(e) => setMUser(e.target.value)}>{members.map((m) => <option key={m.id} value={m.id}>{m.full_name ?? m.email}</option>)}</select></div>
                <div className="field" style={{ margin: 0 }}><label className="label" htmlFor="m-div">Division</label><select id="m-div" className="select" value={mDiv} onChange={(e) => setMDiv(e.target.value)}>{leadableDivisions.map((d) => <option key={d.id} value={d.id}>{d.name.replace(/^Sthyra\s+/, "")}</option>)}</select></div>
                <div className="field" style={{ margin: 0 }}>
                  <label className="label" htmlFor="m-role">Role</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <select id="m-role" className="select" value={mRole} onChange={(e) => setMRole(e.target.value)} style={{ width: 100 }}><option value="member">Member</option>{isOwner && <option value="lead">Lead</option>}</select>
                    <button className="btn" onClick={() => { setMErr(null); run(() => addMembership(mUser, mDiv, mRole), setMErr); }}>Add</button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
