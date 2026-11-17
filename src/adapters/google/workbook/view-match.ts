import { canonicalJson } from "../../../core/integrity/canonical-json";

/** Ignore display whitespace and unused trailing cells, never values or formulas. */
export function viewValues(value: unknown): string {
  if (!Array.isArray(value)) return "invalid";
  const rows = (value as unknown[]).map((row): unknown[] => {
    if (!Array.isArray(row)) return ["invalid"];
    const cells = (row as unknown[]).map((cell) =>
      typeof cell === "string" ? cell.replaceAll("\u00a0", " ").trim() : (cell ?? ""),
    );
    while (cells.at(-1) === "") cells.pop();
    return cells;
  });
  while (rows.length > 0 && rows.at(-1)?.length === 0) rows.pop();
  return canonicalJson(rows);
}

export function numberedView(title: string, role: string): boolean {
  return (
    title.startsWith(`${role} (`) &&
    /^\([1-9]\d*\)$/u.test(title.slice(role.length + 1)) &&
    Number(title.slice(role.length + 2, -1)) >= 2
  );
}
