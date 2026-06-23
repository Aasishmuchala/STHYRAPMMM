"use client";

import { useState, useTransition, useEffect } from "react";
import { saveAppearance } from "@/app/settings/actions";

const THEMES = [
  { key: "nyradna", name: "NYRADNA", bg: "#0a0a12", accent: "#c6bfff", text: "#eceaf6" },
  { key: "midnight", name: "Midnight", bg: "#070c16", accent: "#6fb4ff", text: "#e6edf7" },
  { key: "carbon", name: "Carbon", bg: "#0c0c0e", accent: "#5edda2", text: "#ededee" },
  { key: "oxblood", name: "Oxblood", bg: "#100b08", accent: "#df8f6c", text: "#f0e7e2" },
  { key: "daybreak", name: "Daybreak", bg: "#f4f1ea", accent: "#6b1f2a", text: "#241d17" },
  { key: "slate", name: "Slate", bg: "#eef1f5", accent: "#2f6df0", text: "#18202e" },
];

const WALLPAPERS = [
  { key: "none", name: "None", value: "none" },
  { key: "aurora", name: "Aurora", value: "linear-gradient(135deg,#241b4d,#3b2e6e 45%,#16415f)" },
  { key: "dusk", name: "Dusk", value: "linear-gradient(160deg,#2a1530,#4a2240 50%,#7a3a4a)" },
  { key: "ocean", name: "Ocean", value: "linear-gradient(150deg,#0b2447,#19376d 55%,#1f6e8c)" },
  { key: "ember", name: "Ember", value: "linear-gradient(150deg,#1a0f0a,#3a1d12 50%,#6b2f1a)" },
  { key: "sand", name: "Sand", value: "linear-gradient(150deg,#efe6d6,#f3ebdc 50%,#e6d8c2)" },
  { key: "mesh", name: "Mesh", value: "radial-gradient(at 18% 20%,#5b3fa8 0,transparent 45%),radial-gradient(at 82% 8%,#2a6f97 0,transparent 45%),radial-gradient(at 30% 92%,#b5547a 0,transparent 45%),linear-gradient(#12101f,#12101f)" },
];

function Check() {
  return <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 6" /></svg>;
}

export function ThemeControls({ initialTheme, initialWallpaper }: { initialTheme: string; initialWallpaper: string | null }) {
  const [theme, setTheme] = useState(initialTheme || "nyradna");
  const [wp, setWp] = useState(initialWallpaper || "none");
  const [customUrl, setCustomUrl] = useState(
    initialWallpaper && initialWallpaper.startsWith("url(") ? initialWallpaper.slice(4, -1).replace(/['"]/g, "") : ""
  );
  const [, start] = useTransition();

  function persist(t: string, w: string) {
    start(() => { void saveAppearance(t, w === "none" ? null : w); });
  }
  function applyTheme(key: string) {
    setTheme(key);
    document.documentElement.setAttribute("data-theme", key);
    persist(key, wp);
  }
  function applyWallpaper(value: string) {
    setWp(value);
    document.documentElement.style.setProperty("--wallpaper-image", value === "none" ? "none" : value);
    persist(theme, value);
  }
  function applyCustom() {
    const u = customUrl.trim();
    if (!u) return;
    applyWallpaper(`url("${u.startsWith("http") ? u : "https://" + u}")`);
  }

  // The account (DB) is the source of truth. If this device's live state has drifted from it
  // — theme OR wallpaper — re-apply the saved values and re-persist so the cookie + UI agree.
  useEffect(() => {
    const dbTheme = initialTheme || "nyradna";
    const wantWp = initialWallpaper ?? "none";
    const liveTheme = document.documentElement.getAttribute("data-theme");
    const liveWp = document.documentElement.style.getPropertyValue("--wallpaper-image").trim() || "none";
    if (dbTheme !== liveTheme || wantWp !== liveWp) {
      document.documentElement.setAttribute("data-theme", dbTheme);
      document.documentElement.style.setProperty("--wallpaper-image", wantWp === "none" ? "none" : wantWp);
      persist(dbTheme, wantWp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="dsection" style={{ marginBottom: 12 }}>Theme</div>
      <div className="theme-grid" style={{ marginBottom: 24 }}>
        {THEMES.map((t) => (
          <button key={t.key} className={`theme-swatch ${theme === t.key ? "on" : ""}`} onClick={() => applyTheme(t.key)} aria-pressed={theme === t.key}>
            <div className="theme-preview" style={{ background: t.bg }}>
              <span className="theme-dot" style={{ background: t.accent }} />
              <span className="theme-bar" style={{ background: `color-mix(in srgb, ${t.text} 28%, transparent)` }} />
            </div>
            <div className="theme-name">{t.name}{theme === t.key && <span className="tick"><Check /></span>}</div>
          </button>
        ))}
      </div>

      <div className="dsection" style={{ marginBottom: 12 }}>Wallpaper</div>
      <div className="wp-grid">
        {WALLPAPERS.map((w) => (
          <button
            key={w.key}
            className={`wp-swatch ${wp === w.value ? "on" : ""}`}
            onClick={() => applyWallpaper(w.value)}
            aria-label={w.name}
            aria-pressed={wp === w.value}
            style={{ background: w.value === "none" ? "var(--glass)" : w.value }}
          >
            <span className="wp-label">{w.name}</span>
          </button>
        ))}
      </div>
      <div className="field-row" style={{ alignItems: "end" }}>
        <div className="field" style={{ margin: 0 }}>
          <label className="label" htmlFor="wp-url">Custom image URL</label>
          <input id="wp-url" className="input" value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://… jpg or png" />
        </div>
        <button className="btn" onClick={applyCustom} style={{ height: 38 }}>Apply</button>
      </div>
    </>
  );
}
