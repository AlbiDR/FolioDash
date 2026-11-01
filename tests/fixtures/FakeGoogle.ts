import type { RestClient, RestRequest, RestResponse } from "../../src/adapters/google/Rest";

/** A minimal URL reader, so this fixture needs no DOM or Node typings. */
interface ParsedUrl {
  readonly pathname: string;
  query(name: string): string | null;
}

function parseUrl(text: string): ParsedUrl {
  const withoutOrigin = text.replace(/^https?:\/\/[^/]+/u, "");
  const [pathname = "", search = ""] = withoutOrigin.split("?");
  const pairs = new Map(
    search
      .split("&")
      .filter((pair) => pair.length > 0)
      .map((pair) => {
        const [key = "", value = ""] = pair.split("=");
        return [decodeURIComponent(key), decodeURIComponent(value)] as const;
      }),
  );
  return { pathname, query: (name) => pairs.get(name) ?? null };
}

/** The tab named by a range such as 'Bank 2026-01-31'!A1 or _FolioDash ledger!A1:D, with its quotes removed. */
function tabNameOf(range: string): string {
  const name = range.split("!")[0] ?? "";
  return name.startsWith("'") && name.endsWith("'") ? name.slice(1, -1).replace(/''/gu, "'") : name;
}

interface FakeFile {
  readonly id: string;
  readonly name: string;
  appProperties: Record<string, string>;
  trashed: boolean;
  readonly createdTime: number;
}

interface FakeTab {
  readonly id: number;
  hidden: boolean;
  rows: unknown[][];
}

interface Fault {
  readonly match: RegExp;
  readonly status?: number;
  readonly network?: boolean;
  /** Apply the change before failing, like an answer lost on the way back. */
  readonly applyFirst?: boolean;
}

/**
 * A small, faithful stand-in for the parts of Google Drive and Google Sheets the
 * app uses: creating and tagging a file, finding it by tag or name, and reading,
 * appending to, writing and clearing tabs. It can refuse, lose answers and let
 * "someone else" write in between. It is a test double, not proof that real
 * Google behaves this way.
 */
export class FakeGoogle {
  token = "good-token";
  /** Google does not always honour "hidden" when a tab is created; this reproduces that. */
  ignoreHiddenOnCreate = false;
  private nextTabId = 100;
  files = new Map<string, FakeFile>();
  workbooks = new Map<string, Map<string, FakeTab>>();
  faults: Fault[] = [];
  calls: string[] = [];
  /** Runs once after the nth values read, so a test can write "from another tab" at that moment. */
  afterRead: { readonly count: number; readonly run: () => void } | null = null;
  private readCount = 0;
  private nextId = 1;
  private clock = 1;

  readonly client: RestClient = (request) => this.handle(request);

  callsMatching(pattern: RegExp): string[] {
    return this.calls.filter((call) => pattern.test(call));
  }

  tab(workbookId: string, name: string): FakeTab | undefined {
    return this.workbooks.get(workbookId)?.get(name);
  }

  private respond(status: number, body: unknown): RestResponse {
    return { status, json: () => Promise.resolve(body) };
  }

  private handle(request: RestRequest): Promise<RestResponse> {
    const url = parseUrl(request.url);
    this.calls.push(`${request.method} ${url.pathname}`);
    if (request.headers["Authorization"] !== `Bearer ${this.token}`) return Promise.resolve(this.respond(401, { error: "unauthenticated" }));

    const label = `${request.method} ${decodeURIComponent(url.pathname)}`;
    const faultIndex = this.faults.findIndex((fault) => fault.match.test(label));
    const fault = faultIndex >= 0 ? this.faults.splice(faultIndex, 1)[0] : undefined;
    try {
      if (fault !== undefined && fault.applyFirst !== true) return Promise.resolve(this.fail(fault));
      const answer = this.route(request, url);
      if (fault !== undefined) return Promise.resolve(this.fail(fault));
      return Promise.resolve(answer);
    } catch (error) {
      // A lost connection rejects, as fetch does.
      return Promise.reject(error instanceof Error ? error : new Error("connection lost"));
    }
  }

  private fail(fault: Fault): RestResponse {
    if (fault.network === true) throw new Error("connection lost");
    return this.respond(fault.status ?? 500, { error: "fault" });
  }

  private route(request: RestRequest, url: ParsedUrl): RestResponse {
    const path = decodeURIComponent(url.pathname);
    const body = request.body === undefined ? null : (JSON.parse(request.body) as Record<string, unknown>);

    if (request.method === "GET" && path === "/drive/v3/files") return this.listFiles(url.query("q") ?? "");
    const patch = /^\/drive\/v3\/files\/([^/]+)$/u.exec(path);
    if (request.method === "PATCH" && patch !== null) {
      const file = this.files.get(patch[1] ?? "");
      if (file === undefined) return this.respond(404, {});
      Object.assign(file.appProperties, (body?.["appProperties"] as Record<string, string> | undefined) ?? {});
      return this.respond(200, { id: file.id });
    }
    if (request.method === "POST" && path === "/v4/spreadsheets") return this.createSpreadsheet(body);
    const info = /^\/v4\/spreadsheets\/([^/:]+)$/u.exec(path);
    if (request.method === "GET" && info !== null) {
      const tabs = this.workbooks.get(info[1] ?? "");
      if (tabs === undefined) return this.respond(404, {});
      return this.respond(200, { sheets: [...tabs.entries()].map(([title, tab]) => ({ properties: { sheetId: tab.id, title, hidden: tab.hidden } })) });
    }
    const bulk = /^\/v4\/spreadsheets\/([^/]+)\/values:(batchClear|batchUpdate)$/u.exec(path);
    if (request.method === "POST" && bulk !== null) return this.bulkValues(bulk[1] ?? "", bulk[2] ?? "", body);
    const batch = /^\/v4\/spreadsheets\/([^/]+):batchUpdate$/u.exec(path);
    if (request.method === "POST" && batch !== null) return this.batchUpdate(batch[1] ?? "", body);

    const values = /^\/v4\/spreadsheets\/([^/]+)\/values\/(.+?)(:append|:clear)?$/u.exec(path);
    if (values !== null) return this.values(request, body, values[1] ?? "", values[2] ?? "", values[3] ?? "");
    return this.respond(400, { error: "unknown route" });
  }

  private bulkValues(id: string, action: string, body: Record<string, unknown> | null): RestResponse {
    const tabs = this.workbooks.get(id);
    if (tabs === undefined) return this.respond(404, {});
    const tabOf = (range: string): FakeTab | undefined => tabs.get(tabNameOf(range));
    if (action === "batchClear") {
      for (const range of (body?.["ranges"] as string[] | undefined) ?? []) {
        const tab = tabOf(range);
        if (tab === undefined) return this.respond(400, { error: "Unable to parse range" });
        tab.rows = [];
      }
      return this.respond(200, {});
    }
    for (const entry of (body?.["data"] as { range: string; values: unknown[][] }[] | undefined) ?? []) {
      const tab = tabOf(entry.range);
      if (tab === undefined) return this.respond(400, { error: "Unable to parse range" });
      entry.values.forEach((row, index) => {
        tab.rows[index] = [...row];
      });
    }
    return this.respond(200, {});
  }

  private batchUpdate(id: string, body: Record<string, unknown> | null): RestResponse {
    const tabs = this.workbooks.get(id);
    if (tabs === undefined) return this.respond(404, {});
    type Step = { addSheet?: { properties: { title: string } }; updateSheetProperties?: { properties: { sheetId: number; hidden?: boolean }; fields: string } };
    for (const request of (body?.["requests"] as Step[] | undefined) ?? []) {
      const title = request.addSheet?.properties.title;
      if (title !== undefined) {
        // Google refuses a second tab with the same name.
        if (tabs.has(title)) return this.respond(400, { error: "A sheet with the name already exists" });
        tabs.set(title, { id: this.nextTabId++, hidden: false, rows: [] });
      }
      const update = request.updateSheetProperties;
      if (update !== undefined) {
        const tab = [...tabs.values()].find((candidate) => candidate.id === update.properties.sheetId);
        if (tab === undefined) return this.respond(400, { error: "No such sheet" });
        if (update.fields.includes("hidden")) tab.hidden = update.properties.hidden === true;
      }
    }
    return this.respond(200, {});
  }

  private listFiles(query: string): RestResponse {
    const tag = /appProperties has \{ key='([^']+)' and value='([^']+)' \}/u.exec(query);
    const name = /name='([^']+)'/u.exec(query);
    const matches = [...this.files.values()]
      .filter((file) => !file.trashed)
      .filter((file) => (tag === null ? true : file.appProperties[tag[1] ?? ""] === tag[2]))
      .filter((file) => (name === null ? true : file.name === name[1]))
      .sort((left, right) => right.createdTime - left.createdTime);
    return this.respond(200, { files: matches.slice(0, 1).map((file) => ({ id: file.id })) });
  }

  private createSpreadsheet(body: Record<string, unknown> | null): RestResponse {
    const id = `workbook-${String(this.nextId++)}`;
    const title = ((body?.["properties"] as Record<string, unknown> | undefined)?.["title"] as string | undefined) ?? "Untitled";
    const tabs = new Map<string, FakeTab>();
    for (const sheet of (body?.["sheets"] as { properties: { title: string; hidden?: boolean } }[] | undefined) ?? []) {
      tabs.set(sheet.properties.title, { id: this.nextTabId++, hidden: this.ignoreHiddenOnCreate ? false : sheet.properties.hidden === true, rows: [] });
    }
    this.workbooks.set(id, tabs);
    this.files.set(id, { id, name: title, appProperties: {}, trashed: false, createdTime: this.clock++ });
    return this.respond(200, { spreadsheetId: id });
  }

  private values(request: RestRequest, body: Record<string, unknown> | null, id: string, range: string, action: string): RestResponse {
    const tabs = this.workbooks.get(id);
    if (tabs === undefined) return this.respond(404, {});
    const tab = tabs.get(tabNameOf(range));
    if (tab === undefined) return this.respond(400, { error: "Unable to parse range" });

    if (request.method === "GET") {
      this.readCount++;
      const snapshot = tab.rows.map((row) => [...row]);
      const answer = this.respond(200, snapshot.length === 0 ? { range } : { range, values: snapshot });
      if (this.afterRead !== null && this.readCount === this.afterRead.count) {
        const { run } = this.afterRead;
        this.afterRead = null;
        run();
      }
      return answer;
    }
    const incoming = ((body?.["values"] as unknown[][] | undefined) ?? []).map((row) => [...row]);
    if (action === ":clear") {
      tab.rows = [];
      return this.respond(200, {});
    }
    if (action === ":append") {
      tab.rows.push(...incoming);
      return this.respond(200, { updates: { updatedRows: incoming.length } });
    }
    // Writes at the top left of the range, replacing what is there.
    incoming.forEach((row, index) => {
      tab.rows[index] = row;
    });
    return this.respond(200, { updatedRows: incoming.length });
  }
}
