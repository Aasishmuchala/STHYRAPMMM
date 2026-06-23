// Money is stored as integer paise (Rs 1 = 100 paise). Format to Indian short form.
export function inrShort(paise: number): string {
  const r = paise / 100;
  const abs = Math.abs(r);
  const sign = r < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7, 2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5, 1)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3, 1)}k`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}

function trim(n: number, dp: number): string {
  return n.toFixed(dp).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

export function pct(n: number): string {
  return `${n.toFixed(1).replace(/\.0$/, "")}%`;
}

// Exact Indian-grouped rupees from paise, e.g. 9200000 -> "₹92,000"
export function inr(paise: number): string {
  return "₹" + Math.round(paise / 100).toLocaleString("en-IN");
}

// Short relative due label from an ISO date string, given "today".
export function dueLabel(iso: string | null, today: Date): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff < 0) return "Overdue";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export function initials(name: string | null, email: string | null): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}
