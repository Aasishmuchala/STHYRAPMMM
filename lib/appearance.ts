export const ALLOWED_THEMES = ["slate", "daybreak", "mist", "harbor"] as const;

export type WorkspaceTheme = (typeof ALLOWED_THEMES)[number];

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const ACCENT_VAR_KEYS = [
  "--user-accent",
  "--accent",
  "--accent-strong",
  "--accent-ink",
  "--accent-soft",
  "--accent-soft-2",
] as const;

export function isAllowedTheme(value: string | null | undefined): value is WorkspaceTheme {
  return Boolean(value && ALLOWED_THEMES.includes(value as WorkspaceTheme));
}

export function normalizeAccentHex(value: string | null | undefined): string | null {
  const raw = value?.trim() ?? "";
  if (!HEX.test(raw)) return null;

  const hex = raw.toLowerCase();
  if (hex.length === 4) {
    return `#${hex
      .slice(1)
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`;
  }

  return hex;
}

function mix(a: string, b: string, pct: number) {
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
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0b1220" : "#ffffff";
}

export function buildAccentStyleVars(value: string | null | undefined): Record<string, string> {
  const accent = normalizeAccentHex(value);
  if (!accent) return {};

  return {
    "--user-accent": accent,
    "--accent": accent,
    "--accent-strong": mix(accent, "#000000", 22),
    "--accent-ink": readableInk(accent),
    "--accent-soft": `${accent}24`,
    "--accent-soft-2": `${accent}38`,
  };
}

export function clearAccentStyleVars(style: { removeProperty: (key: string) => void }) {
  for (const key of ACCENT_VAR_KEYS) {
    style.removeProperty(key);
  }
}

export function applyAccentStyleVars(style: { setProperty: (key: string, value: string) => void }, value: string | null | undefined) {
  const vars = buildAccentStyleVars(value);
  for (const [key, val] of Object.entries(vars)) {
    style.setProperty(key, val);
  }
}

export function buildAppearanceStyleVars(wallpaper: string | null | undefined, accent: string | null | undefined) {
  return {
    ...(wallpaper ? { "--wallpaper-image": wallpaper } : {}),
    ...buildAccentStyleVars(accent),
  };
}
