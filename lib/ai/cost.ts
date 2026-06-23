// ₹ per 1,000,000 tokens. Editable — adjust to Omega's actual published pricing.
// (Estimates aligned to Anthropic list prices at ~₹83/$; confirm against your Omega plan.)
export const MODEL_RATES: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8": { in: 1250, out: 6250 },
  "claude-opus-4-7": { in: 1250, out: 6250 },
  "claude-opus-4-6": { in: 1250, out: 6250 },
  "claude-sonnet-4-6": { in: 250, out: 1250 },
  "claude-haiku-4-5": { in: 70, out: 350 },
};

export function costInr(model: string, inTok: number, outTok: number): number {
  const r = MODEL_RATES[model] ?? MODEL_RATES["claude-opus-4-8"];
  const c = (inTok / 1_000_000) * r.in + (outTok / 1_000_000) * r.out;
  return Math.round(c * 10000) / 10000;
}

export function fmtInr(n: number): string {
  if (n < 1) return `₹${n.toFixed(3)}`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
