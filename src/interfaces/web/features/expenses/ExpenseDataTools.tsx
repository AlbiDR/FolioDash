import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ExpenseSaveOutcome } from "../../../../applications/ExpenseModel";

export function ExpenseDataTools(props: {
  readonly days: number;
  readonly commands: number;
  readonly conflicts: number;
  readonly initialized: boolean;
  readonly ready: boolean;
  readonly connected: boolean;
  readonly message?: string;
  readonly pending: boolean;
  readonly onExport: () => string;
  readonly onPreview: (text: string) => { readonly days: number; readonly commands: number; readonly conflicts: number } | null;
  readonly onRestore: (text: string) => Promise<ExpenseSaveOutcome>;
  readonly onCheck: () => Promise<ExpenseSaveOutcome>;
  readonly onSync: () => Promise<void>;
  readonly onLock: (locked: boolean) => void;
}): JSX.Element {
  const [preview, setPreview] = useState<{ text: string; days: number; commands: number; conflicts: number } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [operation, setOperation] = useState<"connect" | "restore" | "check" | null>(null);
  const busy = operation !== null;
  const [message, setMessage] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const mounted = useRef(true);
  const hasHistory = props.initialized && props.commands > 0;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; props.onLock(false); };
  }, [props.onLock]);
  function download(): void {
    const url = URL.createObjectURL(new Blob([props.onExport()], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "foliodash-work-expenses.json"; link.click();
    setTimeout(() => { URL.revokeObjectURL(url); }, 1000);
    setMessage("Expense backup downloaded. It includes the complete saved correction history.");
  }
  async function recover(check = false): Promise<void> {
    if (busy || (!check && (!confirmed || preview === null))) return;
    setOperation(check ? "check" : "restore"); props.onLock(true);
    try {
      const result = check ? await props.onCheck() : await props.onRestore(preview?.text ?? "");
      if (!mounted.current) return;
      const unknown = result.status === "unknown";
      setUncertain(unknown);
      if (result.status === "saved") { setMessage(check ? "The original operation is confirmed and your expense records are checked." : "Expense history restored and checked. Your portfolio records were preserved."); setPreview(null); setConfirmed(false); }
      else setMessage(result.message);
      props.onLock(unknown);
    } catch { if (mounted.current) { setUncertain(true); setMessage("Recovery could not be confirmed. Keep the backup and check the original outcome."); } }
    finally { if (mounted.current) setOperation(null); }
  }
  async function sync(): Promise<void> {
    if (busy) return;
    setOperation("connect"); props.onLock(true);
    try {
      await props.onSync();
      if (mounted.current) setMessage("Google and your expense records are checked. Your chosen backup and confirmation are still here.");
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : "Google could not be checked. Your backup is still selected; connect and check again.");
    } finally {
      if (mounted.current) { setOperation(null); props.onLock(uncertain); }
    }
  }
  async function chooseBackup(file: File | undefined): Promise<void> {
    setPreview(null); setConfirmed(false);
    if (!file) return;
    if (file.size > 2_000_000) { setMessage("Choose an expense backup smaller than 2 MB."); return; }
    try {
      const text = await file.text(); const checked = props.onPreview(text);
      if (checked === null) { setMessage("This backup failed its format, history or checksum checks. Nothing was changed."); return; }
      setPreview({ text, ...checked }); setMessage("Backup checked. Review its coverage before confirming.");
    } catch { setMessage("The backup could not be read. Nothing was changed."); }
  }
  return <section class="account screen" aria-labelledby="expense-data-heading">
    <div class="card">
      <h2 id="expense-data-heading" class="card-title">Your work expense history</h2>
      <p class="card-subtitle">A separate checked record in the same Google workbook. Portfolio figures and expense history keep their own recovery coverage.</p>
      <dl class="facts stacked"><div><dt>Recorded days</dt><dd>{props.days}</dd></div><div><dt>Saved entries and corrections</dt><dd>{props.commands}</dd></div><div><dt>Conflicting days to review</dt><dd>{props.conflicts}</dd></div></dl>
      <p class="hint">The JSON backup contains private amounts and every saved correction. It can restore expense history into an empty expense store; it does not replace or merge an existing history.</p>
      {!props.ready && <div class="review-problem" role="status">
        <p>{props.message || (props.connected ? "Check your expense records against Google before restoring. Your selected backup stays here." : "Connect to Google and check your expense records before restoring. Your selected backup stays here.")}</p>
        <button type="button" disabled={busy} onClick={() => { void sync(); }}>{props.connected ? "Check expense records" : "Connect and check expense records"}</button>
      </div>}
      <button type="button" disabled={props.commands === 0 || busy} onClick={download}>Download expense backup</button>
      <details class="definitions"><summary>Restore an expense backup</summary>
        <p>Choose a FolioDash expense backup to check it first. Selecting a file does not write to Google. Restore requires your confirmation and preserves portfolio data.</p>
        <label class="field">Expense backup (JSON)<input type="file" accept=".json,application/json" disabled={busy || uncertain || props.pending} onChange={event => { void chooseBackup(event.currentTarget.files?.[0]); }} /></label>
        {preview !== null && <div class="review-adjustments"><p>{preview.days} recorded days, {preview.commands} saved entries and corrections, {preview.conflicts} conflicting days requiring review.</p>
          {hasHistory ? <p>Your expense store already contains saved history. Restore will refuse to overwrite it. Existing entries can be corrected in Expenses.</p> : <label class="check"><input type="checkbox" checked={confirmed} disabled={busy || uncertain} onChange={event => { setConfirmed(event.currentTarget.checked); }} />Restore this history into my empty expense store</label>}
          {!hasHistory && !confirmed && <p class="hint">Tick the confirmation above to enable restore once Google is checked.</p>}
          {(props.pending || uncertain) && <p class="hint">Check the original operation below before starting another restore.</p>}
          <button type="button" class="primary" disabled={busy || !confirmed || !props.ready || hasHistory || props.pending || uncertain} onClick={() => void recover()}>Restore expense history</button>
        </div>}
        {(uncertain || props.pending) && <button type="button" disabled={busy} onClick={() => void recover(true)}>Check original recovery or save</button>}
      </details>
      <div role="status" aria-live="polite">{busy ? <p>{operation === "connect" ? "Connecting to Google and checking your expense records…" : operation === "check" ? "Checking the original operation…" : "Restoring your expense records and checking the result…"}</p> : message !== "" ? <p class="notice">{message}</p> : null}</div>
    </div>
  </section>;
}
