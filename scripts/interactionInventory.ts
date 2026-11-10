import ts from "typescript";

export interface InteractionSource { readonly file: string; readonly text: string }
export interface InteractionEntry {
  readonly id: string;
  readonly file: string;
  readonly line: number;
  readonly element: string;
  readonly family: string;
  readonly label: string;
}

/** Source discovery includes conditional controls, repeated templates, custom click targets and SVG marks.
 * This is inventory coverage, never evidence that a control's motion was visually reviewed. */
export function discoverInteractions(sources: readonly InteractionSource[]): InteractionEntry[] {
  const entries: InteractionEntry[] = [];
  for (const { file, text } of sources) {
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const occurrences = new Map<string, number>();
    const walk = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(ast);
        const attributes = new Map(node.attributes.properties.flatMap(attribute => ts.isJsxAttribute(attribute) ? [[attribute.name.getText(ast), attribute.initializer?.getText(ast) ?? "true"] as const] : []));
        const attr = (name: string): string => (attributes.get(name) ?? "").replace(/^["']|["']$/g, "");
        const role = attr("role");
        const native = ["button", "input", "select", "textarea", "summary"].includes(tag) || tag === "a" && attributes.has("href");
        const custom = /^(button|tab|switch|checkbox|radio|menuitem|option|slider|link)$/.test(role) || attributes.has("onClick");
        const scroll = attributes.has("tabIndex") && !/^(?:\{-1\}|"-1")$/.test(attr("tabIndex"));
        const inspection = attributes.has("onPointerMove") || attributes.has("onPointerDown");
        if (/^[a-z]/.test(tag) && (native || custom || scroll || inspection) && !(tag === "input" && attr("type") === "hidden")) {
          let svg = tag === "svg";
          let parent: ts.Node | null = node.parent;
          while (parent !== null) {
            if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText(ast) === "svg") svg = true;
            parent = ts.isSourceFile(parent) ? null : parent.parent;
          }
          let family = "action";
          if (inspection && tag === "svg") family = "chart-inspection";
          else if (svg) family = "chart-mark";
          else if (tag === "input") family = ["checkbox", "radio"].includes(attr("type")) ? "choice" : attr("type") === "range" ? "slider" : "field";
          else if (["select", "textarea"].includes(tag)) family = "field";
          else if (!native && !custom && scroll) family = "scroll-region";
          else if (file.endsWith("RangeSelector.tsx") && tag === "button") family = "period-option";
          else if (!native && !/^(button|tab|switch|checkbox|radio|menuitem|option|slider|link)$/.test(role)) family = "unclassified";
          const signature = (ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent) ? node.parent : node).getText(ast).replace(/\s+/g, " ");
          const hash = ts.sys.createHash?.(`${file}:${signature}`).slice(0, 12);
          if (hash === undefined) throw new Error("The TypeScript host must support stable source fingerprints.");
          const occurrence = (occurrences.get(hash) ?? 0) + 1;
          occurrences.set(hash, occurrence);
          const element = ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent) ? node.parent : null;
          const label = attr("aria-label") || (element?.children.filter(ts.isJsxText).map(child => child.text.trim()).filter(Boolean).join(" ") ?? "") || attr("id") || attr("class") || "Dynamic label; inspect owning component";
          entries.push({ id: `${hash}-${String(occurrence)}`, file, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, element: tag, family, label: attr("href").startsWith("mailto:") ? "Contact email" : label.replace(/\s+/g, " ").slice(0, 85) });
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(ast);
  }
  return entries.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

export function inventoryTable(entries: readonly InteractionEntry[], reviews: ReadonlyMap<string, string> = new Map()): string {
  const escape = (value: string): string => value.replaceAll("|", "&#124;").replaceAll("`", "'");
  return [
    "| ID | Source | Element / family | Control or context | State review |",
    "|---|---|---|---|---|",
    ...entries.map(entry => `| ${entry.id} | [${entry.file.split("/").at(-1) ?? entry.file}:${String(entry.line)}](../../${entry.file}#L${String(entry.line)}) | ${entry.element} / ${entry.family} | ${escape(entry.label)} | ${escape(reviews.get(entry.id) ?? "SOURCE CLASSIFIED; STATES OPEN")} |`),
  ].join("\n");
}
