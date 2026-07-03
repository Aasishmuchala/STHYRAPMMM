"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { beginToast, finishToast } from "@/lib/client-toast";
import { addAttendanceLocation, deleteAttendanceLocation } from "@/app/attendance/actions";
import type { DivisionOpt } from "@/lib/tasks-types";

export type AttendanceLocation = {
  id: string;
  division_id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
};

export function AttendanceLocationsCard({
  locations,
  divisions,
}: {
  locations: AttendanceLocation[];
  divisions: DivisionOpt[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? "");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("50");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  const divName = (id: string) => divisions.find((d) => d.id === id)?.name.replace(/^Sthyra\s+/, "") ?? "-";

  function useMyLocation() {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("This device can't share its location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError("Couldn't read your location. Allow location permission or type the coordinates.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function add() {
    setError(null);
    const latitude = Number(lat);
    const longitude = Number(lng);
    const radiusM = Number(radius);
    if (!name.trim()) return setError("Name the location.");
    if (!divisionId) return setError("Pick a company.");
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return setError("Enter valid coordinates (use ‘Use my current location’).");
    setBusy(true);
    const toastId = beginToast("Adding location…");
    const result = await addAttendanceLocation(divisionId, name.trim(), latitude, longitude, radiusM);
    setBusy(false);
    if (!finishToast(result, { id: toastId, success: "Location added." })) {
      setError("error" in result ? result.error : "Couldn't add the location.");
      return;
    }
    setName("");
    setLat("");
    setLng("");
    setRadius("50");
    router.refresh();
  }

  async function remove(id: string, label: string) {
    const toastId = beginToast("Removing…");
    const result = await deleteAttendanceLocation(id);
    if (!finishToast(result, { id: toastId, success: `Removed ${label}.` })) return;
    router.refresh();
  }

  return (
    <section className="set-card">
      <h3>Attendance locations</h3>
      <p className="sub">
        Add the places where attendance can be marked. A check-in only counts when the person&apos;s phone GPS is within the
        radius. Names must be unique per company.
      </p>

      {locations.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {locations.map((loc) => (
            <div className="set-row" key={loc.id} style={{ alignItems: "center" }}>
              <div className="grow">
                <div className="rn">{loc.name} <span className="role-pill">{divName(loc.division_id)}</span></div>
                <div className="re">
                  {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)} · {loc.radius_m}m radius
                </div>
              </div>
              <button className="btn" onClick={() => remove(loc.id, loc.name)}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <div className="set-add" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field" style={{ margin: 0 }}>
          <label className="label" htmlFor="al-name">Location name</label>
          <input id="al-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Head Office" />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label className="label" htmlFor="al-div">Company</label>
          <select id="al-div" className="select" value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>{d.name.replace(/^Sthyra\s+/, "")}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label className="label" htmlFor="al-lat">Latitude</label>
          <input id="al-lat" className="input" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="12.971600" inputMode="decimal" />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label className="label" htmlFor="al-lng">Longitude</label>
          <input id="al-lng" className="input" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="77.594600" inputMode="decimal" />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label className="label" htmlFor="al-rad">Radius (metres)</label>
          <input id="al-rad" className="input" value={radius} onChange={(e) => setRadius(e.target.value)} inputMode="numeric" />
        </div>
        <div className="field" style={{ margin: 0, alignSelf: "end", display: "flex", gap: 8 }}>
          <button type="button" className="btn" onClick={useMyLocation} disabled={locating}>
            {locating ? "Locating…" : "Use my current location"}
          </button>
          <button type="button" className="btn btn-primary" onClick={add} disabled={busy}>
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      </div>

      {error && <div className="form-err" style={{ marginTop: 12 }}>{error}</div>}
    </section>
  );
}
