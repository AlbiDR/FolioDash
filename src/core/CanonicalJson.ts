/**
 * JSON with object keys in sorted order, so the same value always produces the
 * same text and therefore the same checksum, whatever order it was built in.
 * Only plain JSON data is accepted; anything else is a programming error.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("A non-finite number cannot be written as JSON.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const parts = Object.keys(record)
      .sort()
      .map((key) => {
        const entry = record[key];
        if (entry === undefined) throw new Error(`The property ${key} is undefined and cannot be written as JSON.`);
        return `${JSON.stringify(key)}:${canonicalJson(entry)}`;
      });
    return `{${parts.join(",")}}`;
  }
  throw new Error("This value cannot be written as JSON.");
}
