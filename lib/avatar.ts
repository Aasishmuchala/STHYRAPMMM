// Deterministic pastel gradient per person, so avatars are distinguishable but on-brand.
export function avatarBg(seed: string | null | undefined): string {
  let h = 0;
  const s = seed ?? "";
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `linear-gradient(150deg, hsl(${h} 68% 78%), hsl(${(h + 42) % 360} 60% 62%))`;
}
