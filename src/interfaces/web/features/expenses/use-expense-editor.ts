import { useEffect, useRef, useState } from "preact/hooks";
import type { ExpenseConflict } from "../../../../applications/session/expense-model";
import { formatDateLong, type IsoDate } from "../../../../core/values/iso-date";
import {
  EMPTY_EXPENSE_AMOUNTS,
  EXPENSE_REQUIRED_INDICES,
  adjacentWorkday,
  expenseDayKind,
  expenseReport,
  expenseEntryStatus,
  isWorkday,
  shiftDate,
  sumExpenseAmounts,
  sumExpenseDays,
  weekDates,
  type ExpenseAmounts,
  type ExpenseCommand,
  type ExpenseDay,
} from "../../../../core/expenses/work-expenses";
import { usePrivacy } from "../../presentation/privacy/privacy";
import {
  EMPTY_EXPENSE_DRAFT,
  expenseDraftChanged,
  expenseDraftFor,
  expenseCorrectionIndices,
  parseExpenseDraft,
  type ExpenseDraft,
} from "./expense-draft";
import { weekdayLabel } from "./expense-format";
import type { Editor, ExpensesViewProps, SaveRequest } from "./expense-types";

function editorFor(date: IsoDate, days: readonly ExpenseDay[]): Editor {
  const day = days.find((entry) => entry.date === date);
  return {
    date,
    original: day?.amounts ?? EMPTY_EXPENSE_AMOUNTS,
    revision: day?.revision ?? null,
    draft: day === undefined ? EMPTY_EXPENSE_DRAFT : expenseDraftFor(day.amounts),
    resolving: false,
  };
}

/** The state, derived figures and actions of the expenses screen. The sections only draw what this returns. */
export function useExpenseEditor(props: ExpensesViewProps) {
  const hidden = usePrivacy();
  const [editor, setEditor] = useState(() => editorFor(props.today, props.days));
  const [week, setWeek] = useState(props.today);
  const [year, setYear] = useState(Number(props.today.slice(0, 4)));
  const [policy, setPolicy] = useState<"completed-periods" | "typical-periods">("completed-periods");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState<SaveRequest | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [destination, setDestination] = useState<IsoDate | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [month, setMonth] = useState("");
  const editorElement = useRef<HTMLElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const parsed = parseExpenseDraft(editor.draft);
  const correctionIndices = expenseCorrectionIndices(parsed.amounts, editor.original);
  const needsCorrection = editor.resolving || correctionIndices.length > 0;
  const entryStatus = expenseEntryStatus(parsed.amounts);
  const filled = entryStatus.filled;
  const missingRequired = entryStatus.missingRequired.length;
  const requiredEntered = EXPENSE_REQUIRED_INDICES.filter((index) => parsed.amounts[index] !== null).length;
  const dirty = editor.resolving || expenseDraftChanged(editor.draft, editor.original);
  const waiting = pending !== null || props.pending === true;
  const locked = dirty || busy || waiting;
  const demo = props.mode === "signed-out";
  const writable = demo || props.mode === "online";
  const conflicts = props.conflicts ?? [];
  const report = expenseReport(props.days, year, props.today, policy);
  const yearConflicts = conflicts.filter((conflict) => Number(conflict.date.slice(0, 4)) === year);
  const reportReady = props.ready && yearConflicts.length === 0;
  const editorDay = props.days.find((day) => day.date === editor.date);
  const selectedConflict = conflicts.find((conflict) => conflict.date === editor.date);
  const earlierVersions = (props.history ?? [])
    .filter((command) => command.date === editor.date && command.id !== editorDay?.revision)
    .slice()
    .reverse();
  const selectedKind = expenseDayKind(editorDay, editor.date, props.today, report.startDate);
  const dates = weekDates(week);
  const weekDays = props.days.filter((day) => dates.includes(day.date) && day.date <= props.today);
  const weekHasConflict = conflicts.some((conflict) => dates.includes(conflict.date));
  const weekTotal = sumExpenseDays(weekDays);
  const weekPartial = weekDays.filter((day) => expenseEntryStatus(day.amounts).partial).length;
  const years = [
    ...new Set([
      Number(props.today.slice(0, 4)),
      year,
      ...props.days.map((day) => Number(day.date.slice(0, 4))),
      ...conflicts.map((conflict) => Number(conflict.date.slice(0, 4))),
    ]),
  ].sort((a, b) => b - a);
  const matchingDays = props.days
    .filter(
      (day) =>
        Number(day.date.slice(0, 4)) === year &&
        (month === "" || day.date.slice(5, 7) === month) &&
        (!reviewOnly || expenseEntryStatus(day.amounts).partial),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const displayedDays = showAll ? matchingDays : matchingDays.slice(0, 6);
  const total = parsed.invalid.length === 0 ? sumExpenseAmounts(parsed.amounts) : null;
  const cannotSave =
    hidden ||
    !props.ready ||
    !writable ||
    !dirty ||
    busy ||
    waiting ||
    !isWorkday(editor.date) ||
    editor.date > props.today ||
    parsed.invalid.length > 0 ||
    total === null;

  useEffect(() => {
    props.onDirtyChange?.(locked);
    return () => props.onDirtyChange?.(false);
  }, [locked, props.onDirtyChange]);

  useEffect(() => {
    // Effects run after paint: never let a refresh overwrite a resolution or draft started since this render.
    if (!locked)
      setEditor((current) =>
        current.resolving || expenseDraftChanged(current.draft, current.original)
          ? current
          : editorFor(current.date, props.days),
      );
  }, [props.days, locked]);

  useEffect(() => {
    if (!locked) return;
    const guard = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => {
      window.removeEventListener("beforeunload", guard);
    };
  }, [locked]);

  useEffect(() => {
    if (reviewing) reviewHeading.current?.focus();
  }, [reviewing]);

  function openDay(date: IsoDate): void {
    if (busy || waiting) return;
    if (date === editor.date) return;
    if (dirty && date !== editor.date) {
      setDestination(date);
      return;
    }
    setEditor(editorFor(date, props.days));
    setWeek(date);
    setReviewing(false);
    setFeedback("");
    setDestination(null);
  }

  function updateField(index: number, value: string): void {
    if (hidden || busy || waiting) return;
    setEditor((current) => ({
      ...current,
      draft: current.draft.map((text, field) => (field === index ? value : text)) as unknown as ExpenseDraft,
    }));
    setReviewing(false);
    setFeedback("");
  }

  function discard(): void {
    if (waiting || busy) return;
    const next = destination ?? editor.date;
    setEditor(editorFor(next, props.days));
    setWeek(next);
    setDestination(null);
    setReviewing(false);
    setFeedback("Draft discarded. Saved entries have not changed.");
  }

  async function save(confirmed = false): Promise<void> {
    if (pending === null && cannotSave) return;
    if (pending === null && needsCorrection && !confirmed) {
      setReviewing(true);
      return;
    }
    const request = pending ?? { date: editor.date, amounts: parsed.amounts, expectedRevision: editor.revision };
    setBusy(true);
    setFeedback(pending === null ? "Saving your entry…" : "Checking the original save…");
    try {
      const result = await props.onSave(request);
      if (result.status === "saved") {
        setPending(null);
        setReviewing(false);
        setEditor(editorFor(destination ?? request.date, result.days));
        if (destination !== null) setWeek(destination);
        setDestination(null);
        setFeedback(
          demo
            ? "Saved to this demo preview only. Your Google Sheet was not changed."
            : result.viewUpdated
              ? "Saved to your Google Sheet."
              : "Your entry is saved. The readable sheet view needs a refresh; saving again is not needed.",
        );
      } else if (result.status === "unknown") {
        setPending(request);
        setFeedback(result.message);
      } else {
        setPending(null);
        setFeedback(result.message);
        setReviewing(false);
      }
    } catch {
      setPending(request);
      setFeedback(
        "The save outcome could not be confirmed. Keep this entry here and check the original save before continuing.",
      );
    } finally {
      setBusy(false);
    }
  }

  function chooseVersion(conflict: ExpenseConflict, amounts: ExpenseAmounts): void {
    if (hidden || locked) {
      setFeedback(
        hidden
          ? "Show amounts before reviewing a version."
          : "Save or discard your current draft before reviewing another version.",
      );
      return;
    }
    setEditor({
      date: conflict.date,
      original: amounts,
      revision: conflict.revision,
      draft: expenseDraftFor(amounts),
      resolving: true,
    });
    setWeek(conflict.date);
    setReviewing(false);
    setFeedback(
      "Review these amounts, then save the correction to resolve the conflicting versions. Both earlier versions remain in history.",
    );
    editorElement.current?.scrollIntoView({ behavior: "auto", block: "start" });
  }

  function recoverVersion(command: ExpenseCommand): void {
    if (hidden || locked || !props.ready || !writable || selectedConflict !== undefined) return;
    const current = editorFor(editor.date, props.days);
    setEditor({ ...current, draft: expenseDraftFor(command.amounts) });
    setReviewing(false);
    setFeedback(
      "Earlier amounts copied into this draft. Review and confirm the correction to save them as a new version; your current saved entry has not changed.",
    );
  }

  async function checkStoredSave(): Promise<void> {
    if (props.onCheckPending === undefined || busy) return;
    setBusy(true);
    try {
      const result = await props.onCheckPending();
      setFeedback(
        result.status === "saved" ? "The original entry is confirmed saved. You can continue." : result.message,
      );
      if (result.status === "saved") setEditor(editorFor(editor.date, result.days));
    } catch {
      setFeedback("The original save still could not be checked. Nothing new was submitted.");
    } finally {
      setBusy(false);
    }
  }

  // Previous and Next step one calendar day, weekends included, so any date can be viewed. Only a workday can be recorded.
  const previousDay = shiftDate(editor.date, -1);
  const nextDay = shiftDate(editor.date, 1);
  const previousWorkday = adjacentWorkday(editor.date, -1);
  const nextWorkday = adjacentWorkday(editor.date, 1);
  const stepName = (direction: "Previous" | "Next", target: IsoDate | null): string =>
    `${direction} day${target === null ? "" : `, ${weekdayLabel(target)} ${formatDateLong(target)}`}`;
  const entryDisabled =
    busy ||
    waiting ||
    !isWorkday(editor.date) ||
    editor.date > props.today ||
    !props.ready ||
    (selectedConflict !== undefined && !editor.resolving);
  const yearConflictNote = yearConflicts.length > 0;
  const recordsNotice =
    !demo && (!props.ready || Boolean(props.message)) ? props.message || "Checking your work-expense records…" : "";
  // A weekend or a future day cannot be recorded, so an empty one shows only why, not a form that cannot be used.
  const recordable = isWorkday(editor.date) && editor.date <= props.today;
  const showForm = recordable || filled > 0;
  return {
    hidden,
    editor,
    setEditor,
    week,
    setWeek,
    year,
    setYear,
    policy,
    setPolicy,
    busy,
    feedback,
    pending,
    reviewing,
    setReviewing,
    destination,
    setDestination,
    showAll,
    setShowAll,
    reviewOnly,
    setReviewOnly,
    month,
    setMonth,
    editorElement,
    reviewHeading,
    parsed,
    needsCorrection,
    entryStatus,
    filled,
    missingRequired,
    requiredEntered,
    dirty,
    waiting,
    locked,
    demo,
    writable,
    conflicts,
    report,
    yearConflicts,
    reportReady,
    editorDay,
    selectedConflict,
    earlierVersions,
    selectedKind,
    dates,
    weekDays,
    weekHasConflict,
    weekTotal,
    weekPartial,
    years,
    matchingDays,
    displayedDays,
    total,
    cannotSave,
    openDay,
    updateField,
    discard,
    save,
    chooseVersion,
    recoverVersion,
    checkStoredSave,
    stepName,
    previousDay,
    nextDay,
    previousWorkday,
    nextWorkday,
    entryDisabled,
    yearConflictNote,
    recordsNotice,
    recordable,
    showForm,
  };
}

/** What each section of the screen receives: the screen props and the editor's state and actions. */
export interface ExpenseShared {
  readonly props: ExpensesViewProps;
  readonly x: ReturnType<typeof useExpenseEditor>;
}
