import { describe, expect, it } from "vitest";
import { type DirectDeps, ensureWorkbook, readDirect } from "../direct-ledger";
import { LEDGER_TAB, VIEW_TAB } from "../sheets-layout";
import { setup, readyWorkbook } from "../../../../tests/fixtures/google-adapters/direct-ledger-support";

describe("ensureWorkbook: starting from scratch", () => {
  it("creates and rediscovers an isolated synthetic workbook without selecting or changing the normal workbook", async () => {
    const { google } = setup();
    const normal = await readyWorkbook(google);
    const before = JSON.stringify([...(google.workbooks.get(normal.id) ?? [])]);
    const identity = {
      title: "FolioDash SYNTHETIC ACCEPTANCE",
      propertyKey: "foliodash-synthetic-acceptance",
      propertyValue: "ledger-v1",
    };
    const synthetic = await ensureWorkbook(google.client, google.token, identity);
    expect(synthetic).toMatchObject({ status: "ready", created: true });
    if (synthetic.status !== "ready") throw new Error("Synthetic setup failed");
    expect(synthetic.workbook.id).not.toBe(normal.id);
    expect(google.files.get(synthetic.workbook.id)?.name).toBe(identity.title);
    expect(google.files.get(synthetic.workbook.id)?.appProperties).toEqual({
      [identity.propertyKey]: identity.propertyValue,
    });
    const again = await ensureWorkbook(google.client, google.token, identity);
    expect(again).toMatchObject({ status: "ready", created: false, workbook: synthetic.workbook });
    expect(await ensureWorkbook(google.client, google.token)).toMatchObject({
      status: "ready",
      created: false,
      workbook: normal,
    });
    expect(JSON.stringify([...(google.workbooks.get(normal.id) ?? [])])).toBe(before);
  });

  it("uses the synthetic name fallback if tagging fails, never the normal workbook name", async () => {
    const { google } = setup();
    const normal = await readyWorkbook(google);
    const identity = {
      title: "FolioDash SYNTHETIC ACCEPTANCE",
      propertyKey: "foliodash-synthetic-acceptance",
      propertyValue: "ledger-v1",
    };
    google.faults.push({ match: /^PATCH \/drive/u, status: 500 });
    const synthetic = await ensureWorkbook(google.client, google.token, identity);
    expect(synthetic).toMatchObject({ status: "ready", created: true, tagged: false });
    if (synthetic.status !== "ready") throw new Error("Synthetic setup failed");
    const again = await ensureWorkbook(google.client, google.token, identity);
    expect(again).toMatchObject({ status: "ready", created: false, workbook: synthetic.workbook });
    expect(synthetic.workbook.id).not.toBe(normal.id);
  });
  it("creates a tagged spreadsheet with a readable tab and a hidden ledger tab, in one sign-in", async () => {
    const { google } = setup();
    const result = await ensureWorkbook(google.client, google.token);
    expect(result).toMatchObject({ status: "ready", created: true, tagged: true });
    if (result.status !== "ready") return;
    expect(google.tab(result.workbook.id, VIEW_TAB)?.hidden).toBe(false);
    expect(google.tab(result.workbook.id, LEDGER_TAB)?.hidden).toBe(true);
    expect(google.tab(result.workbook.id, LEDGER_TAB)?.rows).toEqual([["revision", "type", "payload", "checksum"]]);
    expect(result.workbook.url).toContain(result.workbook.id);
  });

  it("names the new spreadsheet simply FolioDash", async () => {
    const { google } = setup();
    await readyWorkbook(google);
    expect([...google.files.values()].map((file) => file.name)).toEqual(["FolioDash"]);
  });

  it("finds the same spreadsheet again instead of creating another, on any device", async () => {
    const { google } = setup();
    const created = await readyWorkbook(google);
    const again = await ensureWorkbook(google.client, google.token);
    expect(again).toMatchObject({ status: "ready", created: false });
    if (again.status === "ready") expect(again.workbook.id).toBe(created.id);
    expect(google.files.size).toBe(1);
  });

  it("still finds a spreadsheet whose tag did not complete, by its name", async () => {
    const { google } = setup();
    google.faults.push({ match: /^PATCH \/drive/u, status: 500 });
    const created = await ensureWorkbook(google.client, google.token);
    expect(created).toMatchObject({ status: "ready", created: true, tagged: false });
    const again = await ensureWorkbook(google.client, google.token);
    expect(again).toMatchObject({ status: "ready", created: false });
    expect(google.files.size).toBe(1);
  });

  it("reports a refused sign-in without creating anything", async () => {
    const { google } = setup();
    google.token = "someone-else";
    const result = await ensureWorkbook(google.client, "stale-token");
    expect(result).toEqual({ status: "call-failed", failure: "unauthorised" });
    expect(google.files.size).toBe(0);
  });

  it("creates the header with the workbook, even when the creation response is lost", async () => {
    const { google } = setup();
    google.faults.push({ match: /^POST \/v4\/spreadsheets$/u, network: true, applyFirst: true });
    expect(await ensureWorkbook(google.client, google.token)).toEqual({ status: "call-failed", failure: "network" });
    expect(google.files.size).toBe(1);
    const again = await ensureWorkbook(google.client, google.token);
    expect(again).toMatchObject({ status: "ready", created: false });
    if (again.status !== "ready") throw new Error("setup failed");
    expect((await readDirect(google.client, google.token, again.workbook.id)).status).toBe("ok");
    expect(google.files.size).toBe(1);
    expect(google.callsMatching(/^PUT /u)).toHaveLength(0);
  });

  it("recovers discovery after the header verification is interrupted without creating another workbook", async () => {
    const { google } = setup();
    google.faults.push({ match: /^GET .*\/values\//u, network: true });
    expect((await ensureWorkbook(google.client, google.token)).status).toBe("call-failed");
    const again = await ensureWorkbook(google.client, google.token);
    expect(again).toMatchObject({ status: "ready", created: false });
    if (again.status !== "ready") throw new Error("setup failed");
    expect((await readDirect(google.client, google.token, again.workbook.id)).status).toBe("ok");
    expect(google.files.size).toBe(1);
  });

  it("preserves an older incomplete workbook instead of guessing its missing header", async () => {
    const { google } = setup();
    const workbook = await readyWorkbook(google);
    const tab = google.tab(workbook.id, LEDGER_TAB);
    if (tab === undefined) throw new Error("setup failed");
    tab.rows = [["unrecognised existing records"]];
    await ensureWorkbook(google.client, google.token);
    expect((await readDirect(google.client, google.token, workbook.id)).status).toBe("refused");
    expect(tab.rows).toEqual([["unrecognised existing records"]]);
    expect(google.files.size).toBe(1);
  });

  it("does not report successful creation when the returned workbook has an invalid header", async () => {
    const { google } = setup();
    const rest: DirectDeps["rest"] = async (request) => {
      const response = await google.client(request);
      if (request.method === "POST" && request.url.endsWith("/v4/spreadsheets")) {
        for (const tabs of google.workbooks.values()) {
          const ledger = tabs.get(LEDGER_TAB);
          if (ledger !== undefined) ledger.rows = [["unexpected header"]];
        }
      }
      return response;
    };
    expect(await ensureWorkbook(rest, google.token)).toEqual({ status: "call-failed", failure: "unexpected" });
    expect(google.callsMatching(/^PUT /u)).toHaveLength(0);
  });
});
