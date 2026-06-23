// Deterministic pastel gradient per person, so avatars are distinguishable but on-brand.
export function avatarBg(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(150deg, hsl(${h} 68% 78%), hsl(${(h + 42) % 360} 60% 62%))`;
}
