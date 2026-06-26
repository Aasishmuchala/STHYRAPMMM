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

const ACCENT_PRESETS = [
  "#2563eb", // cobalt
  "#4f46e5", // indigo
  "#7c3aed", // violet
  "#db2777", // pink
  "#dc2626", // red
  "#ea580c", // orange
  "#ca8a04", // amber
  "#16a34a", // green
  "#0f766e", // teal
  "#0891b2", // cyan
  "#1e293b", // slate ink
  "#6b1f2a", // oxblood
];

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function isValidHex(v: string) {
  return HEX.test(v.trim());
}

function mix(a: string, b: string, pct: number) {
  // Mix a toward b by pct (0–100). Returns hex. Used to derive accent-strong / accent-ink
  // locally so the user-picked accent still drives primary/secondary surfaces.
  const ah = a.replace("#", "");
  const bh = b.replace("#", "");
  const ar = parseInt(ah.slice(0, 2), 16);
  const ag = parseInt(ah.slice(2, 4), 16);
  const ab = parseInt(ah.slice(4, 6), 16);
  const br = parseInt(bh.slice(0, 2), 16);
  const bg = parseInt(bh.slice(2, 4), 16);
  const bb = parseInt(bh.slice(4, 6), 16);
  const t = pct / 100;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

function readableInk(hex: string) {
  // Pick white or near-black as ink based on perceived luminance.
  const h = hex.replace("#", "");
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
  const [accent, setAccent] = useState(initialAccent || "");
  const [customUrl, setCustomUrl] = useState(
    initialWallpaper && initialWallpaper.startsWith("url(") ? initialWallpaper.slice(4, -1).replace(/['"]/g, "") : ""
  );
  const [, start] = useTransition();

  function applyAccentVars(hex: string) {
    if (!hex) return;
    const root = document.documentElement;
    root.style.setProperty("--user-accent", hex);
    root.style.setProperty("--accent", hex);
    root.style.setProperty("--accent-strong", mix(hex, "#000000", 22));
    root.style.setProperty("--accent-ink", readableInk(hex));
    root.style.setProperty("--accent-soft", hex + "24");
    root.style.setProperty("--accent-soft-2", hex + "38");
  }

  function persist(t: string, w: string, a: string) {
    start(() => {
      void saveAppearance(t, w === "none" ? null : w, a || null);
    });
  }

  function applyTheme(key: string) {
    setTheme(key);
    document.documentElement.setAttribute("data-theme", key);
    // Switching themes wipes the user-accent override so the theme's own accent shows.
    setAccent("");
    document.documentElement.style.removeProperty("--user-accent");
    persist(key, wp, "");
  }

  function applyWallpaper(value: string) {
    setWp(value);
    document.documentElement.style.setProperty("--wallpaper-image", value === "none" ? "none" : value);
    persist(theme, value, accent);
  }

  function applyCustom() {
    const u = customUrl.trim();
    if (!u) return;
    applyWallpaper(`url("${u.startsWith("http") ? u : "https://" + u}")`);
  }

  function applyAccent(hex: string) {
    const clean = hex.trim();
    setAccent(clean);
    if (clean && isValidHex(clean)) {
      applyAccentVars(clean);
      persist(theme, wp, clean);
    } else if (!clean) {
      // Reset to theme accent
      document.documentElement.style.removeProperty("--user-accent");
      persist(theme, wp, "");
    }
  }

  // The account (DB) is the source of truth. If this device's live state has drifted from it
  // — theme, wallpaper, OR accent — re-apply the saved values and re-persist.
  useEffect(() => {
    const dbTheme = initialTheme || "slate";
    const wantWp = initialWallpaper ?? "none";
    const wantAccent = initialAccent ?? "";
    const liveTheme = document.documentElement.getAttribute("data-theme");
    const liveWp = document.documentElement.style.getPropertyValue("--wallpaper-image").trim() || "none";
    const liveAccent = document.documentElement.style.getPropertyValue("--user-accent").trim();
    if (dbTheme !== liveTheme || wantWp !== liveWp || wantAccent !== liveAccent) {
      document.documentElement.setAttribute("data-theme", dbTheme);
      document.documentElement.style.setProperty("--wallpaper-image", wantWp === "none" ? "none" : wantWp);
      if (wantAccent) applyAccentVars(wantAccent);
      else document.documentElement.style.removeProperty("--user-accent");
      persist(dbTheme, wantWp, wantAccent);
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

      <div className="dsection" style={{ marginBottom: 12 }}>Accent color</div>
      <p className="sub" style={{ marginTop: -4, marginBottom: 12 }}>
        Override the theme&apos;s accent. Affects buttons, active states, and the People page charts.
      </p>
      <div className="accent-row">
        {ACCENT_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            className={`accent-chip ${accent.toLowerCase() === c ? "on" : ""}`}
            style={{ background: c, color: readableInk(c) }}
            onClick={() => applyAccent(c)}
            aria-label={`Accent ${c}`}
            aria-pressed={accent.toLowerCase() === c}
          >
            {accent.toLowerCase() === c && <Check />}
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