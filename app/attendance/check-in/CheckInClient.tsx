"use client";

import { useState } from "react";
import { checkIn } from "../actions";

type Phase = "idle" | "locating" | "submitting" | "done" | "error";

export function CheckInClient({ userName }: { userName: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  function mark() {
    setMessage(null);
    setDetail(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPhase("error");
      setMessage("This device can't share its location.");
      return;
    }
    setPhase("locating");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setPhase("submitting");
        const { latitude, longitude, accuracy } = pos.coords;
        const result = await checkIn(latitude, longitude, Number.isFinite(accuracy) ? accuracy : null);
        if ("error" in result) {
          setPhase("error");
          setMessage(result.error);
          return;
        }
        setPhase("done");
        setMessage(`Attendance marked at ${result.locationName}.`);
        setDetail(`You were ${result.distanceMeters}m from the location.`);
      },
      (err) => {
        setPhase("error");
        setMessage(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. Enable it for this site and try again."
            : "Couldn't get an accurate location. Move to open sky and retry.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  const busy = phase === "locating" || phase === "submitting";
  const done = phase === "done";

  return (
    <div className="att-checkin">
      <p className="sub">Signed in as <strong>{userName}</strong></p>

      {!done && (
        <button className="btn btn-primary att-checkin-btn" onClick={mark} disabled={busy}>
          {phase === "locating" ? "Getting your location…" : phase === "submitting" ? "Marking…" : "Mark my attendance"}
        </button>
      )}

      {message && (
        <div
          className="att-checkin-msg"
          style={{
            marginTop: 16,
            padding: "12px 14px",
            borderRadius: 12,
            background: done ? "var(--positive-weak, rgba(34,197,94,.12))" : "var(--danger-weak, rgba(239,68,68,.10))",
            color: done ? "var(--positive)" : "var(--danger)",
          }}
        >
          <div style={{ fontWeight: 600 }}>{message}</div>
          {detail && <div className="sub" style={{ marginTop: 4 }}>{detail}</div>}
        </div>
      )}

      {phase === "error" && (
        <button className="btn" style={{ marginTop: 12 }} onClick={mark}>Try again</button>
      )}
    </div>
  );
}
