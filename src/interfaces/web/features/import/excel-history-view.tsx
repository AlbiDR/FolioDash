import { Presence } from "../../shared/ui/presence";
import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  planExcelHistory,
  type ExcelHistoryEntry,
  type ExcelHistoryReview,
} from "../../../../applications/import/excel-history";
import { runHistory, type HistoryStatement } from "../../../../applications/import/history-import";
import type { RemoteSave } from "../../../../applications/import/import-model";
import type { LedgerState } from "../../../../core/portfolio/ledger";
import { applyImport } from "../../../../core/statements/import-plan";
import { CashQuestions } from "./cash-questions";
import type { CashReviewDraft } from "./cash-answers";
import { ExcelConfirmStage } from "./excel-confirm-stage";
import { ExcelDatesStep } from "./excel-dates-step";
import type { DatedEntry, Failure, Stage } from "./excel-history-types";

export function ExcelHistoryView(props: {
  readonly review: ExcelHistoryReview;
  readonly ledger: LedgerState;
  readonly save?: RemoteSave;
  readonly onRecord: (ledger: LedgerState) => void;
  readonly onLock: (locked: boolean) => void;
}): JSX.Element {
  const [entries, setEntries] = useState(props.review.entries);
  const [stage, setStage] = useState<Stage>("dates");
  const [ordered, setOrdered] = useState<readonly DatedEntry[]>([]);
  const [base, setBase] = useState(props.ledger);
  const [preview, setPreview] = useState(props.ledger);
  const [statements, setStatements] = useState<readonly HistoryStatement[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const drafts = useRef<Record<string, CashReviewDraft>>({});
  const [saved, setSaved] = useState(0);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const plan = planExcelHistory(entries, props.ledger);
  const locked = stage !== "dates" && stage !== "done";

  useEffect(() => {
    props.onLock(locked);
  }, [locked, props.onLock]);
  useEffect(
    () => () => {
      props.onLock(false);
    },
    [props.onLock],
  );
  useEffect(() => {
    heading.current?.focus();
  }, [stage, reviewIndex]);
  useEffect(() => {
    if (!locked) return;
    const leave = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    const navigate = (event: MouseEvent): void => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (anchor === null || anchor.getAttribute("href")?.startsWith("#") !== true) return;
      if (anchor.getAttribute("href") === "#main-content" || anchor.getAttribute("href") === window.location.hash)
        return;
      // Keep the reviewed selection and command receipts mounted during a financial save/recovery.
      event.preventDefault();
      event.stopPropagation();
      setMessage("Finish this import or use the return button below before leaving this screen.");
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("click", navigate, true);
    };
  }, [locked]);

  function change(id: string, patch: Partial<ExcelHistoryEntry>): void {
    setEntries((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }

  function begin(): void {
    if (!plan.ok || props.review.problems.length > 0) return;
    setOrdered(plan.entries);
    setBase(props.ledger);
    setPreview(props.ledger);
    setStatements([]);
    drafts.current = {};
    setReviewIndex(0);
    setSaved(0);
    setMessage("");
    setStage("questions");
  }

  function previous(): void {
    const index = stage === "confirm" ? ordered.length - 1 : reviewIndex - 1;
    let state = base;
    for (const statement of statements.slice(0, index)) {
      const applied = applyImport(state, statement.statement, statement.date, statement.commands, statement.commandId);
      if (!applied.ok) return;
      state = applied.state;
    }
    setPreview(state);
    setReviewIndex(index);
    setStage("questions");
  }

  async function saveRemaining(save: RemoteSave): Promise<void> {
    if (busy.current) return;
    if (props.ledger.revision !== base.revision) {
      setMessage(
        "Your saved history changed after this review. Return to statement selection and review against the latest history before saving.",
      );
      return;
    }
    busy.current = true;
    setStage("saving");
    setMessage("");
    const offset = saved;
    try {
      const result = await runHistory<Failure>(
        async (statement, revision) => {
          try {
            const outcome = await save.record(statement, statement.commandId, revision);
            return outcome.status === "recorded"
              ? { ok: true, ledger: outcome.ledger }
              : { ok: false, failure: outcome };
          } catch {
            return {
              ok: false,
              failure: {
                status: "unknown",
                message: "The save response was lost. Check what happened before continuing.",
              },
            };
          }
        },
        base,
        statements.slice(offset),
        (count) => {
          setSaved(offset + count);
        },
      );
      setBase(result.ledger);
      props.onRecord(result.ledger);
      setFailure(result.stopped?.failure ?? null);
      setStage(result.stopped === null ? "done" : "stopped");
    } finally {
      busy.current = false;
    }
  }

  async function check(save: RemoteSave): Promise<void> {
    const statement = statements[saved];
    if (statement === undefined || busy.current) return;
    busy.current = true;
    setChecking(true);
    setMessage("Checking your spreadsheet without writing…");
    try {
      const outcome = await save.check(statement.commandId);
      if (outcome.status === "recorded") {
        setBase(outcome.ledger);
        props.onRecord(outcome.ledger);
        setSaved(saved + 1);
        setFailure(null);
        setStage(saved + 1 === statements.length ? "done" : "stopped");
        setMessage("The statement was saved and read back. You can continue with the remaining statements.");
      } else if (outcome.status === "not-recorded") {
        setFailure({
          status: "not-saved",
          message: "The spreadsheet confirms that this statement was not recorded. You can resume safely.",
        });
        setMessage("");
      } else if (outcome.status === "saved-not-reloaded") {
        setFailure({ status: "saved-not-reloaded" });
        setMessage("");
      } else setMessage(outcome.message);
    } catch {
      setMessage("The spreadsheet could not be checked. Nothing more was sent. Try checking again when connected.");
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }

  const current = ordered[reviewIndex];
  const uncertain = failure?.status === "unknown" || failure?.status === "saved-not-reloaded";
  return (
    <section class="review" aria-labelledby="excel-history-heading">
      <h3 id="excel-history-heading" ref={heading} tabIndex={-1}>
        {stage === "dates"
          ? "Check your statements"
          : stage === "questions"
            ? `Review statement ${String(reviewIndex + 1)} of ${String(ordered.length)}`
            : stage === "done"
              ? "Your history is ready"
              : "Review and save your history"}
      </h3>
      <Presence show={message !== ""}>
        {message !== "" && (
          <p class="notice" role="status">
            {message}
          </p>
        )}
      </Presence>
      <div class="status" data-busy={checking} aria-live="polite">
        {checking && <p>Checking the interrupted save. Nothing more is being written.</p>}
      </div>
      {stage === "dates" && (
        <ExcelDatesStep
          review={props.review}
          ledger={props.ledger}
          entries={entries}
          setEntries={setEntries}
          change={change}
          plan={plan}
          begin={begin}
        />
      )}
      {stage === "questions" && current?.sheet.outcome.ok && (
        <>
          <p>
            {current.fileName} / {current.sheet.name}. Statement date: {current.date}. {reviewIndex} reviewed; nothing
            saved yet.
          </p>
          {current.sheet.outcome.statement.adjustments.length > 0 && (
            <details>
              <summary>Checked readings from this sheet</summary>
              <ul>
                {current.sheet.outcome.statement.adjustments.map((item, index) => (
                  <li key={index}>
                    {item.cell}: {item.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <CashQuestions
            key={current.id}
            statement={current.sheet.outcome.statement}
            date={current.date}
            ledger={preview}
            createRevision={() => crypto.randomUUID()}
            source={{ sheetName: current.sheet.name, sheet: current.sheet.raw }}
            onRecord={() => undefined}
            {...(drafts.current[current.id] === undefined ? {} : { initialDraft: drafts.current[current.id] })}
            onDraft={(draft) => {
              drafts.current[current.id] = draft;
            }}
            onReview={(request, next) => {
              setStatements((previous) => [
                ...previous.slice(0, reviewIndex),
                { ...request, commandId: crypto.randomUUID() },
              ]);
              setPreview(next);
              setReviewIndex(reviewIndex + 1);
              if (reviewIndex + 1 === ordered.length) setStage("confirm");
            }}
          />
        </>
      )}
      {(stage === "confirm" || stage === "saving" || stage === "stopped" || stage === "done") && (
        <ExcelConfirmStage
          stage={stage}
          statements={statements}
          saved={saved}
          save={props.save}
          saveRemaining={saveRemaining}
          failure={failure}
          uncertain={uncertain}
          checking={checking}
          check={check}
        />
      )}
      {((stage === "questions" && reviewIndex > 0) || stage === "confirm") && (
        <button type="button" onClick={previous}>
          Previous statement (keep answers)
        </button>
      )}
      {stage !== "dates" && stage !== "saving" && !uncertain && (
        <button
          type="button"
          onClick={() => {
            setStage("dates");
            setMessage(
              "Returned to statement selection. Reviewed answers will need to be entered again. Confirmed saves remain in your spreadsheet; exclude those dates before continuing.",
            );
          }}
        >
          {stage === "done" ? "Import more statements" : "Return to statement selection (reset answers)"}
        </button>
      )}
    </section>
  );
}
