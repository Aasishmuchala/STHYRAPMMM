import type { CSSProperties } from "react";

/**
 * Overlapping initials avatars (ref images — the little face clusters on cards).
 * Deterministic gradient per name so the same person keeps the same color.
 */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

const GRADS: [string, string][] = [
  ["#7c6cf5", "#a78bfa"],
  ["#fb7185", "#f9a8d4"],
  ["#38bdf8", "#7dd3fc"],
  ["#34d399", "#6ee7b7"],
  ["#fbbf24", "#fcd34d"],
  ["#60a5fa", "#93c5fd"],
];

function gradFor(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return GRADS[h % GRADS.length] ?? ["#7c6cf5", "#a78bfa"];
}

export function AvatarStack({
  names,
  max = 4,
  size = 30,
  style,
}: {
  names: string[];
  max?: number;
  size?: number;
  style?: CSSProperties;
}) {
  const shown = names.slice(0, max);
  const overflow = names.length - shown.length;
  const overlap = Math.round(size * 0.32);

  return (
    <div style={{ display: "flex", alignItems: "center", ...style }}>
      {shown.map((name, i) => {
        const [a, b] = gradFor(name);
        return (
          <div
            key={i}
            title={name}
            style={{
              width: size,
              height: size,
              borderRadius: "50%",
              marginLeft: i === 0 ? 0 : -overlap,
              background: `linear-gradient(135deg, ${a}, ${b})`,
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontSize: size * 0.36,
              fontWeight: 700,
              border: "2px solid var(--bg-elev)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
              zIndex: shown.length - i,
            }}
          >
            {initialsOf(name)}
          </div>
        );
      })}
      {overflow > 0 && (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            marginLeft: -overlap,
            background: "var(--hover)",
            color: "var(--text)",
            display: "grid",
            placeItems: "center",
            fontSize: size * 0.34,
            fontWeight: 700,
            border: "2px solid var(--bg-elev)",
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}
