// The punctuation rule, kept separate from the file walking so it can be tested.
// The characters are built from code points so this file never contains the characters it forbids.

export interface Dash {
  readonly line: number;
  readonly column: number;
  readonly name: string;
}

export const FORBIDDEN: readonly { readonly character: string; readonly name: string }[] = [
  { character: String.fromCharCode(0x2014), name: "em dash" },
  { character: String.fromCharCode(0x2013), name: "en dash" },
];

/** Every forbidden dash in a text, with its 1-based line and column. */
export function findDashes(text: string): Dash[] {
  const found: Dash[] = [];
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    for (const { character, name } of FORBIDDEN) {
      let from = 0;
      for (;;) {
        const at = line.indexOf(character, from);
        if (at < 0) break;
        found.push({ line: index + 1, column: at + 1, name });
        from = at + 1;
      }
    }
  }
  return found.sort((left, right) => left.line - right.line || left.column - right.column);
}
