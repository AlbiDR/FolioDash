// The commit-subject convention (docs/architecture/cleanstack.md STD-4) as a pure function: `<type>: <summary>`.

export const COMMIT_TYPES = ["feat", "fix", "docs", "design", "test", "ci", "chore", "refactor", "style"] as const;

export const MAX_SUBJECT_LENGTH = 100;

// Subjects that Git writes itself are not the author's to word.
const GENERATED = /^(?:Merge |Revert "|fixup! |squash! )/;

/** The reason a commit subject breaks the convention, or null when it follows it. Only the first line counts. */
export function subjectProblem(message: string): string | null {
  const subject = message.split("\n")[0]?.trim() ?? "";
  if (subject === "") return "the subject is empty";
  if (GENERATED.test(subject)) return null;
  const match = /^([a-z]+)(?:\(([a-z0-9-]+)\))?: (\S.*)$/.exec(subject);
  if (match === null) return `use "<type>: <summary>", with a type from ${COMMIT_TYPES.join(", ")}`;
  if (!(COMMIT_TYPES as readonly string[]).includes(match[1] ?? "")) {
    return `"${match[1] ?? ""}" is not a commit type; use one of ${COMMIT_TYPES.join(", ")}`;
  }
  if (subject.length > MAX_SUBJECT_LENGTH)
    return `the subject is ${String(subject.length)} characters; keep it to ${String(MAX_SUBJECT_LENGTH)}`;
  if (subject.endsWith(".")) return "the subject should not end with a full stop";
  return null;
}
