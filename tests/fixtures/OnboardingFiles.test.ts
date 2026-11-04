import { expect, it } from "vitest";
import { createOnboardingFixtures, ONBOARDING_EXPECTED } from "./OnboardingFiles";
import { createImportPreparer, browserLocalDate } from "../../src/interfaces/web/app/importPreparer";
import { prepareExcelHistory, planExcelHistory } from "../../src/applications/ExcelHistory";
import { EMPTY_LEDGER } from "../../src/core/Ledger";
import { applyImport } from "../../src/core/ImportPlan";
import { ZERO_CENTS, toEuroCents } from "../../src/core/Money";
import { FakeGoogle } from "./FakeGoogle";
import { commitDirect, ensureWorkbook, readAllDirect } from "../../src/adapters/google/DirectLedger";

it("generates equivalent individual and combined histories with independent expected financial results", async () => {
  const files = await createOnboardingFixtures();
  const prepare = createImportPreparer(browserLocalDate);
  for (const group of ["individual/", "combined/"]) {
    const selected = [...files].filter(([name]) => name.startsWith(group)).map(([name, bytes]) => ({ name, size: bytes.length, lastModified: null, read: () => Promise.resolve(bytes) }));
    const review = await prepareExcelHistory(selected, prepare);
    expect(review.problems).toEqual([]);
    const plan = planExcelHistory(review.entries, EMPTY_LEDGER);
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error("Generated acceptance files did not pass preflight");
    expect(plan.entries.map((entry) => entry.date)).toEqual(ONBOARDING_EXPECTED.dates);
    let ledger = EMPTY_LEDGER;
    for (const [index, entry] of plan.entries.entries()) {
      if (!entry.sheet.outcome.ok) throw new Error("Generated statement failed interpretation");
      const statement = entry.sheet.outcome.statement;
      expect(statement.fundsSubtotal).toBe(ONBOARDING_EXPECTED.fundsSubtotalCents[index]);
      const applied = applyImport(ledger, statement, entry.date, statement.funds.map((fund) => ({
        isin: fund.isin, action: index === 0 ? "Start" : "Keep", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS,
        ...(index === 0 ? { openingNetInvested: toEuroCents(100000) ?? ZERO_CENTS } : {}), comment: "",
      })), `fixture-${String(index)}`);
      expect(applied.ok).toBe(true);
      if (!applied.ok) throw new Error("Generated history could not be applied");
      ledger = applied.state;
      const invested = Object.values(ledger.snapshots.at(-1)?.holdings ?? {}).reduce((sum, holding) => sum + holding.netInvested, 0);
      expect(invested).toBe(ONBOARDING_EXPECTED.netInvestedCents[index]);
      expect(statement.fundsSubtotal - invested).toBe(ONBOARDING_EXPECTED.gainCents[index]);
    }
  }
});

it("generates validation files that actually exercise missing dates, duplicate months and formulas", async () => {
  const files = await createOnboardingFixtures();
  const prepare = createImportPreparer(browserLocalDate);
  for (const [name, bytes] of files) {
    if (!name.startsWith("validation/")) continue;
    const review = await prepareExcelHistory([{ name, size: bytes.length, lastModified: null, read: () => Promise.resolve(bytes) }], prepare);
    expect(planExcelHistory(review.entries, EMPTY_LEDGER).ok).toBe(false);
    if (name.includes("missing-date")) expect(review.entries.map((entry) => entry.date)).toEqual(["2026-01-31", ""]);
    if (name.includes("invalid-formula")) {
      expect(review.entries).toHaveLength(1);
      const outcome = review.entries[0]?.sheet.outcome;
      expect(outcome?.ok).toBe(false);
      if (outcome && !outcome.ok) expect(outcome.issues.some((issue) => issue.code === "formula-cell")).toBe(true);
    }
  }
});

it("commits parsed Excel review objects through the real JSON/checksum path and reads back every source", async () => {
  const google = new FakeGoogle();
  const ready = await ensureWorkbook(google.client, google.token);
  if (ready.status !== "ready") throw new Error("Synthetic setup failed");
  const files = await createOnboardingFixtures();
  const selected = [...files].filter(([name]) => name.startsWith("individual/")).map(([name, bytes]) => ({ name, size: bytes.length, lastModified: null, read: () => Promise.resolve(bytes) }));
  const review = await prepareExcelHistory(selected, createImportPreparer(browserLocalDate));
  const plan = planExcelHistory(review.entries, EMPTY_LEDGER);
  if (!plan.ok) throw new Error("Generated history failed preflight");
  let revision = "";
  for (const [index, entry] of plan.entries.entries()) {
    if (!entry.sheet.outcome.ok) throw new Error("Invalid generated statement");
    const statement = entry.sheet.outcome.statement;
    const next = `parsed-revision-${String(index)}`;
    const outcome = await commitDirect({ rest: google.client, newRevision: () => next }, google.token, ready.workbook.id, {
      commandId: `parsed-command-${String(index)}`, expectedRevision: revision, date: entry.date, statement,
      commands: statement.funds.map((fund) => ({ isin: fund.isin, action: index === 0 ? "Start" : "Keep", moneyIn: ZERO_CENTS, moneyOut: ZERO_CENTS, ...(index === 0 ? { openingNetInvested: toEuroCents(100000) ?? ZERO_CENTS } : {}), comment: "" })),
      source: { sheetName: entry.sheet.name, sheet: entry.sheet.raw },
    });
    expect(outcome).toMatchObject({ status: "committed", revision: next });
    revision = next;
  }
  const read = await readAllDirect(google.client, google.token, ready.workbook.id);
  expect(read.status).toBe("ok");
  if (read.status === "ok") {
    expect(read.state.snapshots.map((snapshot) => snapshot.fundsSubtotal)).toEqual(ONBOARDING_EXPECTED.fundsSubtotalCents);
    expect(read.sources).toHaveLength(3);
  }
});
