// Smoke test of the built Apps Script file. It runs the bundle in a bare context
// that offers only what Apps Script offers (no Node, no browser) plus a fake
// spreadsheet, and checks the four operations work end to end on synthetic data.

import vm from "node:vm";
import { OPERATIONS, buildAppsScript } from "./build-apps-script.mjs";

const { code, manifest } = await buildAppsScript();
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

// A fake spreadsheet that retypes any cell not formatted as text, like Sheets does.
function fakeSpreadsheet() {
  const sheets = new Map();
  const makeSheet = () => {
    const sheet = { grid: [], text: new Set(), maxRows: 1000, hidden: false };
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
      setNumberFormat: (format) => {
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < columns; c++) {
            const key = `${row + r}:${column + c}`;
            if (format === "@") sheet.text.add(key);
            else sheet.text.delete(key);
          }
      },
      setValues: (values) => {
        values.forEach((line, r) =>
          line.forEach((value, c) => {
            const key = `${row + r}:${column + c}`;
            sheet.grid[row - 1 + r] ??= [];
            sheet.grid[row - 1 + r][column - 1 + c] =
              sheet.text.has(key) ? value : /^\d+(\.\d+)?$/u.test(value) ? Number(value) : value;
          }),
        );
      },
    });
    return sheet;
  };
  return {
    getSheetByName: (name) => sheets.get(name) ?? null,
    insertSheet: (name) => {
      const sheet = makeSheet();
      sheets.set(name, sheet);
      return sheet;
    },
  };
}

const workbooks = new Map();
let uuid = 0;
const context = vm.createContext({
  SpreadsheetApp: {
    openById: (id) => {
      if (id === "no-access-workbook") throw new Error("no access to this workbook");
      if (!workbooks.has(id)) workbooks.set(id, fakeSpreadsheet());
      return workbooks.get(id);
    },
    flush: () => undefined,
  },
  LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
  Utilities: { getUuid: () => `revision-${++uuid}` },
});
vm.runInContext(code, context, { filename: "Code.js" });

for (const name of OPERATIONS) check(typeof context[name] === "function", `${name} is not a top-level function`);
for (const forbidden of ["process", "require", "window", "document", "fetch", "XMLHttpRequest"]) {
  check(!new RegExp(`\\b${forbidden}\\b`, "u").test(code), `the bundle refers to ${forbidden}`);
}
check(JSON.stringify(manifest.oauthScopes) === JSON.stringify(["https://www.googleapis.com/auth/spreadsheets"]), "unexpected OAuth scopes");

const plain = (value) => JSON.parse(JSON.stringify(value));
const WORKBOOK = "synthetic-workbook-0001";
const request = {
  commandId: "command-0001",
  expectedRevision: "",
  date: "2026-01-15",
  statement: { funds: [{ isin: "US0378331005", name: "Example Fund", marketValue: 100000 }], fundsSubtotal: 100000 },
  commands: [{ isin: "US0378331005", action: "Start", moneyIn: 0, moneyOut: 0, comment: "", openingNetInvested: 90000 }],
};

check(plain(context.foliodashRead(WORKBOOK)).value?.state?.snapshots?.length === 0, "an empty workbook should read as an empty ledger");
const committed = plain(context.foliodashCommit(WORKBOOK, request));
check(committed.ok && committed.value.status === "committed", `commit failed: ${JSON.stringify(committed)}`);
const again = plain(context.foliodashCommit(WORKBOOK, request));
check(again.ok && again.value.status === "already-committed", "repeating a command should be recognised");
const read = plain(context.foliodashRead(WORKBOOK));
check(read.value?.state?.snapshots?.length === 1, "the committed statement should read back");
check(plain(context.foliodashOutcome(WORKBOOK, "command-0001")).value?.status === "committed", "the outcome should be found");
check(plain(context.foliodashCheck(WORKBOOK)).ok === true, "check should succeed on an intact ledger");
check(plain(context.foliodashRead("no-access-workbook")).error === "unavailable", "no access should be reported as unavailable");
check(plain(context.foliodashCommit(WORKBOOK, { nonsense: true })).error === "invalid-request", "a malformed request should be refused");

if (failures.length > 0) {
  process.stderr.write(`Apps Script bundle check failed:\n${failures.map((entry) => `- ${entry}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Apps Script bundle check passed (${String(code.length)} bytes, ${String(OPERATIONS.length)} operations).\n`);
}
