export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const source = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\r") {
      continue;
    } else if (char === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows.filter((current) => current.some((value) => value.length > 0));
}

export function csvObjects(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text);
  const [headerRow, ...valueRows] = rows;
  if (!headerRow) return [];

  const headers = headerRow.map((header) => header.trim());
  return valueRows.map((values) => {
    const out: Record<string, string> = {};
    headers.forEach((header, index) => {
      out[header] = values[index] ?? "";
    });
    return out;
  });
}
