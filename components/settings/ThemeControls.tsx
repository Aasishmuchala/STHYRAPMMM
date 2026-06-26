"use client";

import { useState, useTransition, useEffect } from "react";
import { saveAppearance } from "@/app/settings/actions";

const THEMES = [
  { key: "slate", name: "Slate", bg: "#eef3f9", accent: "#2563eb", text: "#172033" },
  { key: "daybreak", name: "Ivory", bg: "#f7f3ea", accent: "#a24b2a", text: "#2b221c" },
  { key: "mist", name: "Mist", bg: "#edf6f3", accent: "#0f766e", text: "#16302c" },
  { key: "harbor", name: "Harbor", bg: "#f3f6fd", accent: "#4f46e5", text: "#1f2340" },
];

const WALLPAPERS = [
  { key: "none", name: "None", value: "none" },
  { key: "cloud", name: "Cloud", value: "linear-gradient(145deg,#f7fbff,#edf4fb 54%,#e7eff9)" },
  { key: "linen", name: "Linen", value: "linear-gradient(145deg,#faf6ef,#f4ecdf 56%,#efe6d7)" },
  { key: "mint", name: "Mint", value: "linear-gradient(145deg,#f3fbf9,#e5f5ef 58%,#dbefe8)" },
  { key: "harbor", name: "Harbor", value: "radial-gradient(at 15% 22%,rgba(99,102,241,0.10) 0,transparent 42%),radial-gradient(at 85% 12%,rgba(14,165,233,0.11) 0,transparent 42%),linear-gradient(145deg,#f6f8ff,#edf3ff 58%,#e8eefc)" },
];

function Check() {
  return <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 6" /></svg>;
}

export function ThemeControls({ initialTheme, initialWallpaper }: { initialTheme: string; initialWallpaper: string | null }) {
  const [theme, setTheme] = useState(initialTheme || "slate");
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
    const dbTheme = initialTheme || "slate";
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
      <div className="dsection" style={{ marginBottom: 12 }}>Workspace palette</div>
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

      <div className="dsection" style={{ marginBottom: 12 }}>Surface wash</div>
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
