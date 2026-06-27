"use client";

import { useEffect, useState, useTransition } from "react";
import { saveAppearance } from "@/app/settings/actions";
import { beginToast, finishToast } from "@/lib/client-toast";
import {
  applyAccentStyleVars,
  clearAccentStyleVars,
  normalizeAccentHex,
} from "@/lib/appearance";

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

const ACCENT_PRESETS = [
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#db2777",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0f766e",
  "#0891b2",
  "#1e293b",
  "#6b1f2a",
];

function isValidHex(value: string) {
  return normalizeAccentHex(value) !== null;
}

function accentChipInk(hex: string) {
  const clean = normalizeAccentHex(hex);
  if (!clean) return "#ffffff";
  const h = clean.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0b1220" : "#ffffff";
}

function Check() {
  return <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 6" /></svg>;
}

export function ThemeControls({
  initialTheme,
  initialWallpaper,
  initialAccent,
}: {
  initialTheme: string;
  initialWallpaper: string | null;
  initialAccent: string | null;
}) {
  const [theme, setTheme] = useState(initialTheme || "slate");
  const [wp, setWp] = useState(initialWallpaper || "none");
  const [accent, setAccent] = useState(normalizeAccentHex(initialAccent) ?? "");
  const [customUrl, setCustomUrl] = useState(
    initialWallpaper && initialWallpaper.startsWith("url(") ? initialWallpaper.slice(4, -1).replace(/['"]/g, "") : ""
  );
  const [, start] = useTransition();

  function applyAccentVars(hex: string) {
    const clean = normalizeAccentHex(hex);
    if (!clean) return;
    applyAccentStyleVars(document.documentElement.style, clean);
  }

  function persist(nextTheme: string, nextWallpaper: string, nextAccent: string, notify = true) {
    start(() => {
      const toastId = notify ? beginToast("Saving appearance...") : null;
      void saveAppearance(nextTheme, nextWallpaper === "none" ? null : nextWallpaper, nextAccent || null)
        .then((result) => {
          if (!toastId) return;
          finishToast(result, { id: toastId, success: "Appearance updated." });
        });
    });
  }

  function resetAccentVars() {
    clearAccentStyleVars(document.documentElement.style);
  }

  function applyTheme(key: string) {
    setTheme(key);
    document.documentElement.setAttribute("data-theme", key);
    setAccent("");
    resetAccentVars();
    persist(key, wp, "");
  }

  function applyWallpaper(value: string) {
    setWp(value);
    document.documentElement.style.setProperty("--wallpaper-image", value === "none" ? "none" : value);
    persist(theme, value, accent);
  }

  function applyCustom() {
    const url = customUrl.trim();
    if (!url) return;
    applyWallpaper(`url("${url.startsWith("http") ? url : `https://${url}`}")`);
  }

  function applyAccent(value: string) {
    const clean = normalizeAccentHex(value) ?? "";
    setAccent(clean);
    if (clean) {
      applyAccentVars(clean);
      persist(theme, wp, clean);
      return;
    }

    resetAccentVars();
    persist(theme, wp, "");
  }

  useEffect(() => {
    const dbTheme = initialTheme || "slate";
    const wantWp = initialWallpaper ?? "none";
    const wantAccent = normalizeAccentHex(initialAccent) ?? "";
    const liveTheme = document.documentElement.getAttribute("data-theme");
    const liveWp = document.documentElement.style.getPropertyValue("--wallpaper-image").trim() || "none";
    const liveAccent = document.documentElement.style.getPropertyValue("--user-accent").trim();

    if (dbTheme !== liveTheme || wantWp !== liveWp || wantAccent !== liveAccent) {
      document.documentElement.setAttribute("data-theme", dbTheme);
      document.documentElement.style.setProperty("--wallpaper-image", wantWp === "none" ? "none" : wantWp);
      if (wantAccent) applyAccentVars(wantAccent);
      else resetAccentVars();
      persist(dbTheme, wantWp, wantAccent, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="dsection" style={{ marginBottom: 12 }}>Workspace palette</div>
      <div className="theme-grid" style={{ marginBottom: 24 }}>
        {THEMES.map((item) => (
          <button key={item.key} className={`theme-swatch ${theme === item.key ? "on" : ""}`} onClick={() => applyTheme(item.key)} aria-pressed={theme === item.key}>
            <div className="theme-preview" style={{ background: item.bg }}>
              <span className="theme-dot" style={{ background: item.accent }} />
              <span className="theme-bar" style={{ background: `color-mix(in srgb, ${item.text} 28%, transparent)` }} />
            </div>
            <div className="theme-name">{item.name}{theme === item.key && <span className="tick"><Check /></span>}</div>
          </button>
        ))}
      </div>

      <div className="dsection" style={{ marginBottom: 12 }}>Accent color</div>
      <p className="sub" style={{ marginTop: -4, marginBottom: 12 }}>
        Override the theme&apos;s accent. Affects buttons, active states, and the People page charts.
      </p>
      <div className="accent-row">
        {ACCENT_PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            className={`accent-chip ${accent.toLowerCase() === color ? "on" : ""}`}
            style={{ background: color, color: accentChipInk(color) }}
            onClick={() => applyAccent(color)}
            aria-label={`Accent ${color}`}
            aria-pressed={accent.toLowerCase() === color}
          >
            {accent.toLowerCase() === color && <Check />}
          </button>
        ))}
        <button
          type="button"
          className={`accent-chip accent-clear ${!accent ? "on" : ""}`}
          onClick={() => applyAccent("")}
          aria-pressed={!accent}
          title="Use theme accent"
        >
          Default
        </button>
      </div>
      <div className="field-row" style={{ alignItems: "end" }}>
        <div className="field" style={{ margin: 0 }}>
          <label className="label" htmlFor="accent-hex">Custom hex</label>
          <input
            id="accent-hex"
            className="input"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
            onBlur={() => accent && isValidHex(accent) && applyAccent(accent)}
            placeholder="#2563eb"
            spellCheck={false}
          />
        </div>
        <button className="btn" onClick={() => applyAccent(accent)} style={{ height: 38 }} disabled={!isValidHex(accent)}>
          Apply
        </button>
      </div>

      <div className="dsection" style={{ marginBottom: 12, marginTop: 24 }}>Surface wash</div>
      <div className="wp-grid">
        {WALLPAPERS.map((item) => (
          <button
            key={item.key}
            className={`wp-swatch ${wp === item.value ? "on" : ""}`}
            onClick={() => applyWallpaper(item.value)}
            aria-label={item.name}
            aria-pressed={wp === item.value}
            style={{ background: item.value === "none" ? "var(--glass)" : item.value }}
          >
            <span className="wp-label">{item.name}</span>
          </button>
        ))}
      </div>
      <div className="field-row" style={{ alignItems: "end" }}>
        <div className="field" style={{ margin: 0 }}>
          <label className="label" htmlFor="wp-url">Custom image URL</label>
          <input id="wp-url" className="input" value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://... jpg or png" />
        </div>
        <button className="btn" onClick={applyCustom} style={{ height: 38 }}>Apply</button>
      </div>
    </>
  );
}
