// The content contract as pure functions (docs/architecture/cleanstack.md PRV-1, PRV-2): tracked files and built
// output hold synthetic data only, and no credential. GitHub's own secret scanning covers pushed secrets; this
// adds what it does not know about: financial identifiers, and the files that ship to a visitor.

export interface ContentFile {
  readonly path: string;
  readonly text: string;
}

interface Rule {
  readonly id: string;
  readonly pattern: RegExp;
  /** A second test for a match, so a look-alike is not reported. */
  readonly confirm?: (match: string) => boolean;
}

/** ISO 13616 check: move the first four characters to the end, expand letters to numbers, remainder 1 modulo 97. */
export function isValidIban(candidate: string): boolean {
  const moved = `${candidate.slice(4)}${candidate.slice(0, 4)}`;
  let remainder = 0;
  for (const character of moved) {
    const digits = character >= "A" ? String(character.charCodeAt(0) - 55) : character;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

const RULES: readonly Rule[] = [
  { id: "private-key", pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/ },
  { id: "google-client-secret", pattern: /GOCSPX-[A-Za-z0-9_-]{20,}/ },
  { id: "google-api-key", pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { id: "google-access-token", pattern: /\bya29\.[0-9A-Za-z_-]{20,}/ },
  { id: "google-refresh-token", pattern: /\b1\/\/0[0-9A-Za-z_-]{30,}/ },
  { id: "github-token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/ },
  {
    id: "iban",
    pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/,
    confirm: (m) => isValidIban(m.replace(/ /g, "")),
  },
  // Italian fiscal code: six letters, two digits, a month letter, two digits, a letter, three digits, a letter.
  { id: "fiscal-code", pattern: /\b[A-Z]{6}\d{2}[A-EHLMPR-T]\d{2}[A-Z]\d{3}[A-Z]\b/ },
];

/** Files whose bytes are not text, or whose long encoded values would look like secrets. */
const SKIPPED = /(?:^|\/)package-lock\.json$|\.(?:png|ico|webp|jpg|jpeg|woff2?|xlsx|zip)$/;

/** One finding per rule per file, with the line of the first match; the matched text is never repeated. */
export function contentProblems(files: readonly ContentFile[]): string[] {
  const problems: string[] = [];
  for (const { path, text } of files) {
    if (SKIPPED.test(path)) continue;
    for (const rule of RULES) {
      for (const match of text.matchAll(new RegExp(rule.pattern.source, "g"))) {
        if (rule.confirm !== undefined && !rule.confirm(match[0])) continue;
        const line = text.slice(0, match.index).split("\n").length;
        problems.push(`${path}:${String(line)}: looks like ${rule.id}`);
        break;
      }
    }
  }
  return problems;
}
