import { describe, expect, it } from "vitest";
import { contentProblems, isValidIban } from "../../scripts/verify/code/content-policy";

// Every fake value is assembled at run time so this file does not contain a match for its own rules.
const join = (...parts: string[]): string => parts.join("");
const scan = (text: string, path = "docs/x.md"): string[] => contentProblems([{ path, text }]);

describe("credentials", () => {
  it.each([
    ["private-key", join("-----BEGIN ", "RSA PRIVATE KEY", "-----")],
    ["private-key", join("-----BEGIN ", "PRIVATE KEY", "-----")],
    ["google-client-secret", join("GOCSPX", "-", "a".repeat(28))],
    ["google-api-key", join("AIza", "S".repeat(35))],
    ["google-access-token", join("ya29", ".", "a".repeat(40))],
    ["google-refresh-token", join("1/", "/0", "g".repeat(40))],
    ["github-token", join("ghp", "_", "A".repeat(36))],
    ["github-token", join("github_pat", "_", "B".repeat(60))],
  ])("finds a %s", (id, value) => {
    expect(scan(`token = ${value}`)).toEqual([`docs/x.md:1: looks like ${id}`]);
  });

  it("reports where, never what", () => {
    const [problem] = scan(`line one\nline two ${join("ghp", "_", "A".repeat(36))}`);
    expect(problem).toBe("docs/x.md:2: looks like github-token");
    expect(problem).not.toContain("AAAA");
  });

  it("does not mind ordinary text, an OAuth client ID or a short look-alike", () => {
    expect(
      scan("The client ID 123456789-abc.apps.googleusercontent.com is public by design. AIza is a prefix."),
    ).toEqual([]);
  });
});

describe("financial identifiers", () => {
  const iban = ["GB82", "WEST", "1234", "5698", "7654", "32"];

  it("finds an IBAN with a valid check, written with or without spaces", () => {
    expect(scan(`pay to ${iban.join(" ")}`)).toEqual(["docs/x.md:1: looks like iban"]);
    expect(scan(`pay to ${iban.join("")}`)).toEqual(["docs/x.md:1: looks like iban"]);
  });

  it("does not report a look-alike whose check fails, such as an ISIN", () => {
    expect(isValidIban(iban.join(""))).toBe(true);
    expect(isValidIban(join("GB83", iban.slice(1).join("")))).toBe(false);
    expect(scan("The fund LU1234567890 is synthetic.")).toEqual([]);
  });

  it("finds an Italian fiscal code", () => {
    expect(scan(`code ${join("RSSMRA", "85T10", "A562S")}`)).toEqual(["docs/x.md:1: looks like fiscal-code"]);
  });
});

describe("what is skipped", () => {
  it("skips the lockfile and binary assets, and reports each rule once per file", () => {
    const secret = join("ghp", "_", "A".repeat(36));
    expect(contentProblems([{ path: "package-lock.json", text: secret }])).toEqual([]);
    expect(contentProblems([{ path: "src/x/icon.png", text: secret }])).toEqual([]);
    expect(scan(`${secret}\n${secret}`)).toHaveLength(1);
  });
});
