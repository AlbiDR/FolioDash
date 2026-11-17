import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/core/sha256";
import { canonicalJson } from "../../src/core/canonical-json";
import { parseStoredSheet, toStoredSheet, cellRef } from "../../src/core/raw-sheet";
import { readXlsx } from "../../src/adapters/xlsx/xlsx-reader";
import { parseXml } from "../../src/adapters/xlsx/xml";
import { XLSX_LIMITS } from "../../src/adapters/xlsx/xlsx-error";
import { interpretFideuramSheet } from "../../src/adapters/fideuram/fideuram-layout";
import { buildXlsx } from "../fixtures/synthetic-xlsx";
import { COL, ROW, syntheticSheet, text, number, withCell, withRowsBefore } from "../fixtures/synthetic-fideuram-sheet";
import { createDurableStore, createMemoryStore } from "../../src/adapters/browser/durable-store";
import { dateInSheetName } from "../../src/applications/excel-history";
import { statementDateCandidate } from "../../src/core/statement-date";
import { RowLedgerStore, type LedgerRow, type RowSheet } from "../../src/adapters/ledger/row-ledger-store";
import { commitStatement, readLedger, type ServiceEnvironment } from "../../src/applications/ledger-service";
import { EMPTY_LEDGER } from "../../src/core/ledger";
import { parseIsoDate } from "../../src/core/iso-date";

describe("input boundaries", () => {
  it("sha256 vs node", () => {
    const bad: string[] = [];
    for (let n = 0; n < 300; n++) {
      const s = "a".repeat(n);
      if (sha256Hex(s) !== createHash("sha256").update(s).digest("hex")) bad.push(String(n));
    }
    for (const s of ["", "è€😀", "😀".repeat(40), "é".repeat(55), "x".repeat(100000)]) {
      if (sha256Hex(s) !== createHash("sha256").update(s).digest("hex")) bad.push(s.slice(0, 5));
    }
    expect(bad).toEqual([]);
  });

  it("canonical json oddities", () => {
    expect(canonicalJson({ b: 1, a: [1, { z: null, y: "x" }], é: -0 })).toBe(
      '{"a":[1,{"y":"x","z":null}],"b":1,"é":0}',
    );
  });

  it("xml edge cases", () => {
    const tries = [
      `<a b="1" c='2'>x &amp; y &#x41;&#65;<![CDATA[<raw>&amp;]]></a>`,
      `<a>&#0;</a>`,
      `<a>&#xD800;</a>`,
      `<a b = "1"/>`,
      `<a\n b="1"\n/>`,
      `<a><b/></a><!-- c -->\n`,
      `\uFEFF<a/>`,
      `<a b="x>y"/>`,
      `<a b="1"c="2"/>`,
      `<x:a></y:a>`,
      `<a>]]></a>`,
      `<a b="&lt;&#10;"/>`,
      `<a></a >`,
      `<a>&#99999999999999999999999;</a>`,
      `<a>&#x110000;</a>`,
    ];
    for (const t of tries) {
      try {
        console.log("XML", JSON.stringify(t), "=>", JSON.stringify(parseXml(t, XLSX_LIMITS)));
      } catch (e) {
        console.log("XML", JSON.stringify(t), "THROWS", (e as Error).name, (e as Error).message);
      }
    }
  });

  it("stored sheet limits vs reader", async () => {
    const sheet = syntheticSheet();
    const long = withRowsBefore(sheet, sheet.rows.length, [{ [COL.B]: text("N".repeat(6000)) }]);
    const bytes = await buildXlsx([{ name: "Il Mio Patrimonio", sheet: long }]);
    const read = await readXlsx(bytes);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const firstSheet = read.sheets[0];
    if (firstSheet === undefined) throw new Error("Missing synthetic sheet");
    const raw = firstSheet.sheet;
    const interpreted = interpretFideuramSheet(raw);
    console.log(
      "LONG interpreted ok:",
      interpreted.ok,
      "stored readable:",
      parseStoredSheet(JSON.parse(JSON.stringify(toStoredSheet(raw)))) !== null,
    );
    const rows: LedgerRow[] = [];
    const fake: RowSheet = {
      readRows: () => [...rows],
      appendRows: (r) => {
        rows.push(...r);
      },
      flush: () => undefined,
    };
    let c = 0;
    const env: ServiceEnvironment = {
      store: new RowLedgerStore(fake),
      withLock: (a) => a(),
      newRevision: () => `rev-${String(++c)}`,
    };
    if (!interpreted.ok) return;
    const st = interpreted.statement;
    const outcome = commitStatement(env, {
      commandId: "cmd-1",
      expectedRevision: EMPTY_LEDGER.revision,
      statement: {
        funds: st.funds.map(({ isin, name, marketValue }) => ({ isin, name, marketValue })),
        fundsSubtotal: st.fundsSubtotal,
      },
      date:
        parseIsoDate("2026-01-15") ??
        (() => {
          throw new Error("Invalid synthetic date");
        })(),
      commands: st.funds.map((f) => ({
        isin: f.isin,
        action: "Start" as const,
        moneyIn: 0 as never,
        moneyOut: 0 as never,
        comment: "",
        openingNetInvested: f.marketValue,
      })),
      source: { sheetName: "Il Mio Patrimonio", sheet: raw },
    });
    console.log("LONG commit:", JSON.stringify(outcome));
    console.log(
      "LONG ledger after:",
      readLedger(env).status,
      "sources:",
      JSON.stringify(new RowLedgerStore(fake).loadSources()).slice(0, 120),
    );
  });

  it("two funds categories", () => {
    const sheet = syntheticSheet();
    const extra = withRowsBefore(sheet, ROW.accountCategory, [
      { [COL.C]: text("  Fondi"), [COL.M]: number("100") },
      {
        [COL.B]: text("HOUSE C"),
        [COL.D]: text("000000CC000"),
        [COL.E]: text("EXAMPLE HOLDER"),
        [COL.F]: text("01/02/2025"),
        [COL.M]: number("100"),
      },
      {
        [COL.B]: text("Example Fund C"),
        [COL.E]: text("DE0005557508"),
        [COL.G]: number("10"),
        [COL.H]: text("10,000€ "),
        [COL.M]: number("100"),
      },
    ]);
    const fixed = withCell(extra, ROW.total + 3, COL.M, text("3.450,00  € "));
    const r = interpretFideuramSheet(fixed);
    console.log(
      "TWO",
      r.ok,
      r.ok
        ? JSON.stringify({
            sub: r.statement.fundsSubtotal,
            sum: r.statement.funds.reduce((s, f) => s + f.marketValue, 0),
            cats: r.statement.categories,
          })
        : JSON.stringify(r.issues),
    );
  });

  it("durable stale later copy", () => {
    const first = createMemoryStore();
    let accepting = false;
    const flaky = {
      getItem: (k: string) => first.getItem(k),
      setItem: (k: string, v: string) => {
        if (!accepting) throw new Error("quota");
        first.setItem(k, v);
      },
      removeItem: (k: string) => {
        first.removeItem(k);
      },
    };
    const second = createMemoryStore();
    const store = createDurableStore([() => flaky, () => second]);
    store.setItem("key", "old");
    accepting = true;
    store.setItem("key", "new");
    console.log("DUR after new:", store.getItem("key"), "second holds:", second.getItem("key"));
    first.removeItem("key"); // another tab cleared localStorage
    console.log("DUR after external removal:", store.getItem("key"));
  });

  it("dates", () => {
    for (const n of [
      "2025-07-31",
      "31.07.2025",
      "31-07-2025",
      "Lug 2025",
      "2025-07-31 (2)",
      "12025-07-31",
      "2025-07-311",
      "31/07/2025 copy 01-08-2025",
      "2025-7-31",
      "20250731",
    ])
      console.log("DSN", n, dateInSheetName(n));
    console.log(
      "SDC",
      statementDateCandidate({
        created: "Sheet 1",
        fileName: "x.xlsx",
        lastModified: null,
        localDateOf: (ms) => parseIsoDate(new Date(ms).toISOString().slice(0, 10)),
      }),
    );
    console.log("cellRef", cellRef(0, 26), cellRef(0, 63));
  });
});
