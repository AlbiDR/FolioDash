import type { JSX } from "preact";
import type { StatementSource } from "../../../../applications/ledger/ledger-service";
import type { ReviewStatement } from "../../../../applications/import/import-model";
import type { DraftRow } from "./backfill-types";
import type { ManualRow } from "./manual-statement";

/** The first step: how the earlier month is supplied, its date and, when typed in, its funds. */
export function BackfillValuesForm(props: {
  readonly nextValues: (event: Event) => void;
  readonly mode: "manual" | "file";
  readonly setMode: (mode: "manual" | "file") => void;
  readonly reading: boolean;
  readonly chooseFile: (file: File) => Promise<void>;
  readonly fileStatement: { statement: ReviewStatement; source: StatementSource } | null;
  readonly date: string;
  readonly setDate: (date: string) => void;
  readonly rows: readonly DraftRow[];
  readonly setRows: (update: (current: readonly DraftRow[]) => readonly DraftRow[]) => void;
  readonly update: (id: number, field: keyof ManualRow, value: string) => void;
  readonly pendingFocus: { current: string | null };
}): JSX.Element {
  const {
    nextValues,
    mode,
    setMode,
    reading,
    chooseFile,
    fileStatement,
    date,
    setDate,
    rows,
    setRows,
    update,
    pendingFocus,
  } = props;
  return (
    <form onSubmit={nextValues}>
      <fieldset class="choice">
        <legend>How would you like to add this month?</legend>
        <label>
          <input
            type="radio"
            name="backfill-method"
            checked={mode === "manual"}
            onChange={() => {
              setMode("manual");
            }}
          />{" "}
          Enter manually
        </label>
        <label>
          <input
            type="radio"
            name="backfill-method"
            checked={mode === "file"}
            onChange={() => {
              setMode("file");
            }}
          />{" "}
          Import a bank statement
        </label>
      </fieldset>
      {mode === "file" && (
        <div class="field">
          <label for="backfill-file">Bank statement (.xlsx)</label>
          <input
            id="backfill-file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={reading}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file !== undefined) void chooseFile(file);
            }}
          />
          {fileStatement !== null && <p role="status">Statement ready: {fileStatement.source.sheetName}</p>}
        </div>
      )}
      <div class="field">
        <label for="backfill-date">Valuation date</label>
        <input
          id="backfill-date"
          type="date"
          required
          value={date}
          onInput={(event) => {
            setDate(event.currentTarget.value);
          }}
        />
      </div>
      {mode === "manual" &&
        rows.map((row, index) => (
          <fieldset key={row.id} class="manual-fund">
            <legend>Fund {index + 1}</legend>
            <div class="field">
              <label for={`backfill-name-${String(row.id)}`}>Fund name</label>
              <input
                id={`backfill-name-${String(row.id)}`}
                required
                value={row.name}
                onInput={(event) => {
                  update(row.id, "name", event.currentTarget.value);
                }}
              />
            </div>
            <div class="field">
              <label for={`backfill-isin-${String(row.id)}`}>ISIN</label>
              <input
                id={`backfill-isin-${String(row.id)}`}
                required
                value={row.isin}
                onInput={(event) => {
                  update(row.id, "isin", event.currentTarget.value.toUpperCase());
                }}
              />
            </div>
            <div class="field">
              <label for={`backfill-value-${String(row.id)}`}>Value (EUR)</label>
              <input
                id={`backfill-value-${String(row.id)}`}
                required
                inputMode="decimal"
                value={row.amount}
                onInput={(event) => {
                  update(row.id, "amount", event.currentTarget.value);
                }}
              />
            </div>
            <button
              type="button"
              aria-label={`Remove ${row.name.trim() || `fund ${String(index + 1)}`} from this draft`}
              onClick={() => {
                const next = rows[index + 1] ?? rows[index - 1];
                pendingFocus.current = next === undefined ? "backfill-add-fund" : `backfill-name-${String(next.id)}`;
                setRows((current) => current.filter((item) => item.id !== row.id));
              }}
            >
              Remove fund
            </button>
          </fieldset>
        ))}
      {mode === "manual" && (
        <button
          id="backfill-add-fund"
          type="button"
          onClick={() => {
            const id = Math.max(0, ...rows.map((row) => row.id)) + 1;
            pendingFocus.current = `backfill-name-${String(id)}`;
            setRows((current) => [...current, { id, name: "", isin: "", amount: "" }]);
          }}
        >
          Add another fund
        </button>
      )}
      <button type="submit" class="primary" disabled={reading}>
        Review this month
      </button>
    </form>
  );
}
