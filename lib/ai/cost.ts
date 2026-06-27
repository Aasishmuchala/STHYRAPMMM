// ₹ per 1,000,000 tokens. Editable — adjust to Omega's actual published pricing.
// (Estimates aligned to Anthropic list prices at ~₹83/$; confirm against your Omega plan.)
export const MODEL_RATES: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8": { in: 1250, out: 6250 },
  "claude-opus-4-7": { in: 1250, out: 6250 },
  "claude-opus-4-6": { in: 1250, out: 6250 },
  "claude-sonnet-4-6": { in: 250, out: 1250 },
  "claude-haiku-4-5-20251001": { in: 70, out: 350 },
  "claude-haiku-4-5": { in: 70, out: 350 },
};

export function costInr(model: string, usage: { input_tokens: number; output_tokens: number }): number {
  const r = MODEL_RATES[model];
  if (!r) return 0;
  const inTok = usage?.input_tokens ?? 0;
  const outTok = usage?.output_tokens ?? 0;
  if (!Number.isFinite(inTok) || !Number.isFinite(outTok) || inTok < 0 || outTok < 0) return 0;
  const c = (inTok / 1_000_000) * r.in + (outTok / 1_000_000) * r.out;
  return Math.round(c * 10000) / 10000;
}

// Legacy positional signature retained for backward-compat callers.
export function costInrLegacy(model: string, inTok: number, outTok: number): number {
  return costInr(model, { input_tokens: inTok, output_tokens: outTok });
}

export function fmtInr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "₹0";
  if (n < 1) return `₹${n.toFixed(3)}`;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}