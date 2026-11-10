import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { discoverInteractions, inventoryTable } from "./interactionInventory.ts";

const document = "docs/design/interaction-coverage.md";
const start = "<!-- interaction-inventory:start -->";
const end = "<!-- interaction-inventory:end -->";
const paths = [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0"))]
  .filter(file => file.startsWith("src/interfaces/web/") && /\.(tsx|html)$/.test(file) && existsSync(file));
const entries = discoverInteractions(paths.map(file => ({ file, text: readFileSync(file, "utf8") })));
const unclassified = entries.filter(entry => entry.family === "unclassified");
if (unclassified.length) throw new Error(`Interactive targets require semantic controls and a contract: ${unclassified.map(entry => `${entry.file}:${String(entry.line)}`).join(", ")}`);
const markdown = readFileSync(document, "utf8");
const first = markdown.indexOf(start);
const last = markdown.indexOf(end);
if (first < 0 || last < first) throw new Error("Interaction inventory markers are missing.");
const reviews = new Map([...markdown.matchAll(/^\| ([a-f0-9]{12}-\d+) \|.* \| ([^|]+) \|$/gm)].map(match => [match[1] ?? "", match[2] ?? ""]));
const expected = `${markdown.slice(0, first + start.length)}\n\n${inventoryTable(entries, reviews)}\n\n${markdown.slice(last)}`;
if (process.argv.includes("--write")) writeFileSync(document, expected);
else if (markdown !== expected) throw new Error("Interaction inventory is stale. Run npm run inventory:interactions, review the changed controls and update the coverage evidence.");
console.log(`Interaction inventory passed: ${String(entries.length)} source control templates across ${String(new Set(entries.map(entry => entry.file)).size)} files. Source discovery is not browser-state verification.`);
