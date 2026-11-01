// Smoke test of the built Apps Script file. It runs the bundle in a bare context
// that offers only what Apps Script offers (no Node, no browser) plus a fake
// spreadsheet, and checks the four operations work end to end on synthetic data.

import vm from "node:vm";
import { OPERATIONS, buildAppsScript } from "./build-apps-script.ts";

const { code, manifest } = await buildAppsScript();
const failures: string[] = [];
const check = (condition: boolean, message: string): void => {
  if (!condition) failures.push(message);
};

type Cell = string | number | undefined;

interface FakeSheet {
  grid: Cell[][];
  text: Set<string>;
  maxRows: number;
  hidden: boolean;
  getLastRow(): number;
  getMaxRows(): number;
  insertRowsAfter(after: number, howMany: number): void;
  hideSheet(): void;
  getRange(row: number, column: number, rows: number, columns: number): unknown;
}

interface FakeSpreadsheet {
  getSheetByName(name: string): FakeSheet | null;
  insertSheet(name: string): FakeSheet;
}

/** What the bundle's operations answer, as plain data. */
interface Answer {
  readonly ok?: boolean;
  readonly error?: string;
  readonly value?: { readonly status?: string; readonly state?: { readonly snapshots?: readonly unknown[] } };
}

// A fake spreadsheet that retypes any cell not formatted as text, like Sheets does.
function fakeSpreadsheet(): FakeSpreadsheet {
  const sheets = new Map<string, FakeSheet>();
  const makeSheet = (): FakeSheet => {
    const sheet = { grid: [], text: new Set<string>(), maxRows: 1000, hidden: false } as unknown as FakeSheet;
    sheet.getLastRow = () => {
      let last = 0;
      sheet.grid.forEach((row, index) => {
        if (row.some((cell) => cell !== "" && cell !== undefined)) last = index + 1;
      });
      return last;
    };
    sheet.getMaxRows = () => sheet.maxRows;
    sheet.insertRowsAfter = (_after, howMany) => {
      sheet.maxRows += howMany;
    };
    sheet.hideSheet = () => {
      sheet.hidden = true;
    };
    sheet.getRange = (row, column, rows, columns) => ({
      getValues: () =>
        Array.from({ length: rows }, (_, r) =>
          Array.from({ length: columns }, (_, c) => (sheet.grid[row - 1 + r] ?? [])[column - 1 + c] ?? ""),
        ),
      setNumberFormat: (format: string) => {
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < columns; c++) {
            const key = `${String(row + r)}:${String(column + c)}`;
            if (format === "@") sheet.text.add(key);
            else sheet.text.delete(key);
          }
      },
      setValues: (values: string[][]) => {
        values.forEach((line, r) => {
          line.forEach((value, c) => {
            const key = `${String(row + r)}:${String(column + c)}`;
            const target = (sheet.grid[row - 1 + r] ??= []);
            target[column - 1 + c] = sheet.text.has(key) ? value : /^\d+(\.\d+)?$/u.test(value) ? Number(value) : value;
          });
        });
      },
    });
    return sheet;
  };
  return {
    getSheetByName: (name: string) => sheets.get(name) ?? null,
    insertSheet: (name: string) => {
      const sheet = makeSheet();
      sheets.set(name, sheet);
      return sheet;
    },
  };
}

const workbooks = new Map<string, FakeSpreadsheet>();
let uuid = 0;
const context: Record<string, unknown> = vm.createContext({
  SpreadsheetApp: {
    openById: (id: string) => {
      if (id === "no-access-workbook") throw new Error("no access to this workbook");
      let workbook = workbooks.get(id);
      if (workbook === undefined) {
        workbook = fakeSpreadsheet();
        workbooks.set(id, workbook);
      }
      return workbook;
    },
    flush: () => undefined,
  },
  LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
  Utilities: { getUuid: () => `revision-${String(++uuid)}` },
});
vm.runInContext(code, context, { filename: "Code.js" });

for (const name of OPERATIONS) check(typeof context[name] === "function", `${name} is not a top-level function`);

/** Calls one of the bundle's top-level operations the way Apps Script would. */
const call = (name: string, ...args: unknown[]): Answer => plain((context[name] as (...rest: unknown[]) => unknown)(...args));
for (const forbidden of ["process", "require", "window", "document", "fetch", "XMLHttpRequest"]) {
  check(!new RegExp(`\\b${forbidden}\\b`, "u").test(code), `the bundle refers to ${forbidden}`);
}
// Apps Script's file parser rejects BigInt literals (a digit string ending in n), even though its runtime has BigInt.
check(!/(^|[^\w$.])\d[\d_]*n(?![\w$])/mu.test(code), "the bundle contains a BigInt literal, which Apps Script cannot parse");
check(JSON.stringify(manifest.oauthScopes) === JSON.stringify(["https://www.googleapis.com/auth/spreadsheets"]), "unexpected OAuth scopes");

function plain(value: unknown): Answer {
  return JSON.parse(JSON.stringify(value)) as Answer;
}
const WORKBOOK = "synthetic-workbook-0001";
const request = {
  commandId: "command-0001",
  expectedRevision: "",
  date: "2026-01-15",
  statement: { funds: [{ isin: "US0378331005", name: "Example Fund", marketValue: 100000 }], fundsSubtotal: 100000 },
  commands: [{ isin: "US0378331005", action: "Start", moneyIn: 0, moneyOut: 0, comment: "", openingNetInvested: 90000 }],
};

check(call("foliodashRead", WORKBOOK).value?.state?.snapshots?.length === 0, "an empty workbook should read as an empty ledger");
const committed = call("foliodashCommit", WORKBOOK, request);
check(committed.ok === true && committed.value?.status === "committed", `commit failed: ${JSON.stringify(committed)}`);
const again = call("foliodashCommit", WORKBOOK, request);
check(again.ok === true && again.value?.status === "already-committed", "repeating a command should be recognised");
const read = call("foliodashRead", WORKBOOK);
check(read.value?.state?.snapshots?.length === 1, "the committed statement should read back");
check(call("foliodashOutcome", WORKBOOK, "command-0001").value?.status === "committed", "the outcome should be found");
check(call("foliodashCheck", WORKBOOK).ok === true, "check should succeed on an intact ledger");
check(call("foliodashRead", "no-access-workbook").error === "unavailable", "no access should be reported as unavailable");
check(call("foliodashCommit", WORKBOOK, { nonsense: true }).error === "invalid-request", "a malformed request should be refused");

if (failures.length > 0) {
  process.stderr.write(`Apps Script bundle check failed:\n${failures.map((entry) => `- ${entry}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Apps Script bundle check passed (${String(code.length)} bytes, ${String(OPERATIONS.length)} operations).\n`);
}
