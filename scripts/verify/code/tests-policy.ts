// A test asserts something (docs/architecture/cleanstack.md STD-15). A test file with no assertion can never fail,
// so it proves nothing and only looks like coverage. This is a file-level check: it finds a file that asserts
// nothing at all, not a single test inside a file that asserts elsewhere.

export interface TestFile {
  readonly path: string;
  readonly text: string;
}

const TEST_FILE = /\.test\.tsx?$/;
// Vitest and Chai style `expect(`, Node's `assert(` and `assert.equal(`, and fast-check's `fc.assert(`.
const ASSERTION = /\b(?:expect|assert)\s*[.(]/;
// Text that mentions an assertion without making one is removed first.
const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\/|(?<![:\w])\/\/[^\n]*/g, "");

/** Test files that contain no assertion, one finding per file. */
export function testsWithoutAssertions(files: readonly TestFile[]): string[] {
  return files
    .filter(({ path, text }) => TEST_FILE.test(path) && !ASSERTION.test(withoutComments(text)))
    .map(({ path }) => `${path}: contains no assertion, so it can never fail`)
    .sort();
}
