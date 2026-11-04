import ts from "typescript";

const ROOT_FILES = new Set(["README.md", "AGENTS.md", ".gitignore", "package.json", "package-lock.json"]);
const ROOT_DIRECTORIES = new Set([".github", "config", "docs", "scripts", "src", "tests"]);
const GENERATED_OR_PRIVATE = /(?:^|\/)(?:node_modules|dist|build|coverage|private|local-data|backups|imports|App Scripts|\.Montly Exports|\.Monthly Exports|\.cache|test-results|playwright-report)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|\.(?:xlsx?|xlsm|csv|pdf|sqlite3?|db|log|zip|pem|key)$|(?:^|\/)(?:\.DS_Store|\.clasp(?:rc)?\.json)$/i;

/** Tracked paths only: this cannot certify the contents of a file or ignored local data. */
export function pathProblems(files: readonly string[]): string[] {
  return files.flatMap((file) => {
    const root = file.split("/")[0] ?? "";
    const problems: string[] = [];
    if (file.includes("/") ? !ROOT_DIRECTORIES.has(root) : !ROOT_FILES.has(file)) problems.push(`${file}: unapproved root entry`);
    if (GENERATED_OR_PRIVATE.test(file)) problems.push(`${file}: generated or private artifact`);
    return problems;
  });
}

function layer(file: string): string | null {
  if (file.startsWith("src/core/")) return "core";
  if (file.startsWith("src/applications/")) return "applications";
  if (file.startsWith("src/adapters/")) return "adapters";
  if (file.startsWith("src/interfaces/server/")) return "server";
  for (const name of ["app", "shared", "presentation", "serviceWorker"]) {
    if (file.startsWith(`src/interfaces/web/${name}/`)) return name;
  }
  if (file.startsWith("src/interfaces/web/features/")) return `feature:${file.split("/")[4] ?? ""}`;
  return null;
}

/** Both value imports and type-only imports obey the same dependency direction. */
export function allowedDependency(from: string, to: string): boolean {
  const source = layer(from);
  const target = layer(to);
  if (source === null || target === null) return false;
  if (source === target) return true;
  if (source === "core" || source === "shared" || source === "serviceWorker") return false;
  if (source === "applications") return target === "core";
  if (source === "adapters") return target === "applications" || target === "core";
  if (source === "server") return ["core", "applications", "adapters"].includes(target);
  if (source === "presentation") return ["core", "applications", "shared"].includes(target);
  if (source.startsWith("feature:")) return ["core", "applications", "shared", "presentation"].includes(target);
  return source === "app" && target !== "server" && !to.startsWith("src/adapters/appsscript/");
}

export interface SourceFile {
  readonly file: string;
  readonly text: string;
}

/** Inspect syntax, including re-exports, dynamic imports and import type expressions. */
export function architectureProblems(sources: readonly SourceFile[]): string[] {
  const problems: string[] = [];
  const known = new Set(sources.map(({ file }) => file));
  const graph = new Map<string, string[]>();
  for (const { file, text } of sources) {
    if (!/\.tsx?$/.test(file) || !file.startsWith("src/") || /\.test\.tsx?$/.test(file) || file.endsWith(".d.ts")) continue;
    const owner = layer(file);
    if (owner === null) { problems.push(`${file}: source has no architecture owner`); continue; }
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const edges: string[] = [];
    graph.set(file, edges);
    const check = (node: ts.Node, specifier: ts.Node | undefined): void => {
      const line = ast.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const fail = (message: string): void => { problems.push(`${file}:${String(line)}: ${message}`); };
      if (specifier === undefined || !ts.isStringLiteralLike(specifier)) { fail("nonliteral module dependency cannot be checked"); return; }
      const spec = specifier.text;
      if (!spec.startsWith(".")) {
        const externalAllowed = ["app", "shared", "presentation"].includes(owner) || owner.startsWith("feature:");
        if (!externalAllowed || !/^(?:preact(?:\/|$)|d3-(?:array|scale|shape)$)/.test(spec)) fail(`forbidden external dependency ${spec}`);
        return;
      }
      const parts = file.split("/").slice(0, -1);
      for (const part of spec.split("/")) {
        if (part === "..") parts.pop();
        else if (part !== "." && part !== "") parts.push(part);
      }
      const base = parts.join("/");
      if (base.endsWith(".css") && file.startsWith("src/interfaces/web/") && known.has(base)) return;
      const target = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find((candidate) => known.has(candidate));
      if (target === undefined) { fail(`unresolved dependency ${spec}`); return; }
      if (!allowedDependency(file, target) || /\.test\.tsx?$/.test(target) || target.endsWith(".d.ts")) fail(`forbidden dependency ${target}`);
      edges.push(target);
    };
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) check(node, node.moduleSpecifier);
      if (ts.isImportEqualsDeclaration(node)) check(node, ts.isExternalModuleReference(node.moduleReference) ? node.moduleReference.expression : undefined);
      if (ts.isImportTypeNode(node)) check(node, ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined);
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")) check(node, node.arguments[0]);
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  const visited = new Set<string>();
  const active = new Set<string>();
  const walk = (file: string, chain: readonly string[]): void => {
    if (active.has(file)) { problems.push(`dependency cycle: ${[...chain, file].join(" -> ")}`); return; }
    if (visited.has(file)) return;
    visited.add(file); active.add(file);
    for (const target of graph.get(file) ?? []) walk(target, [...chain, file]);
    active.delete(file);
  };
  for (const file of graph.keys()) walk(file, []);
  return problems;
}
