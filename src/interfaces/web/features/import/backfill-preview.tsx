import type { JSX } from "preact";
import type { RecordRequest } from "../../../../applications/import/import-model";
import { formatDateLong } from "../../../../core/values/iso-date";
import type { HoldingAction, LedgerState } from "../../../../core/portfolio/ledger";
import type { computeMetrics } from "../../../../core/portfolio/metrics";
import { Amount } from "../../presentation/privacy/privacy";
import type { Stage } from "./backfill-types";

const ACTION_LABEL: Readonly<Record<HoldingAction, string>> = {
  Start: "Starting balance",
  Add: "New fund",
  Keep: "Still held",
  Close: "Fully sold",
  Reopen: "Held again",
  Closed: "Remains closed",
};

/** The last step before saving: what the earlier statements change in each saved month. */
export function BackfillPreview(props: {
  readonly priorMetrics: ReturnType<typeof computeMetrics>;
  readonly candidateMetrics: ReturnType<typeof computeMetrics>;
  readonly early: readonly RecordRequest[];
  readonly candidate: LedgerState;
  readonly setStage: (stage: Stage) => void;
  readonly save: () => Promise<void>;
}): JSX.Element {
  const { priorMetrics, candidateMetrics, early, candidate, setStage, save } = props;
  return (
    <section class="summary">
      <button
        type="button"
        onClick={() => {
          setStage("boundary");
        }}
      >
        Back to movements
      </button>
      <h4>Review changes before saving</h4>
      <p>Saved fund values stay the same. Net invested and gains may change when the earlier movements are included.</p>
      <div class="table-scroll" role="region" tabIndex={0} aria-label="Changes by month">
        <table>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Net invested before</th>
              <th scope="col">Net invested after</th>
              <th scope="col">Gain before</th>
              <th scope="col">Gain after</th>
            </tr>
          </thead>
          <tbody>
            {priorMetrics.map((before, index) => {
              const after = candidateMetrics[index + early.length];
              return (
                <tr key={before.date}>
                  <th scope="row">{formatDateLong(before.date)}</th>
                  <td>
                    <Amount cents={before.invested} />
                  </td>
                  <td>{after === undefined ? "-" : <Amount cents={after.invested} />}</td>
                  <td>
                    <Amount cents={before.gain} />
                  </td>
                  <td>{after === undefined ? "-" : <Amount cents={after.gain} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {priorMetrics.map((before, index) => {
        const after = candidateMetrics[index + early.length];
        if (after === undefined) return null;
        return (
          <details key={before.date}>
            <summary>Fund changes for {formatDateLong(before.date)}</summary>
            <div
              class="table-scroll"
              role="region"
              tabIndex={0}
              aria-label={`Fund changes for ${formatDateLong(before.date)}`}
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Fund</th>
                    <th scope="col">History after</th>
                    <th scope="col">Net invested before</th>
                    <th scope="col">Net invested after</th>
                    <th scope="col">Gain before</th>
                    <th scope="col">Gain after</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(after.funds).map((isin) => (
                    <tr key={isin}>
                      <th scope="row">{candidate.funds.find((fund) => fund.isin === isin)?.name ?? isin}</th>
                      <td>
                        {(() => {
                          const action = candidate.snapshots[index + early.length]?.holdings[isin]?.action;
                          return action === undefined ? "-" : ACTION_LABEL[action];
                        })()}
                      </td>
                      <td>
                        {before.funds[isin] === undefined ? "-" : <Amount cents={before.funds[isin].netInvested} />}
                      </td>
                      <td>
                        <Amount cents={after.funds[isin]?.netInvested ?? null} />
                      </td>
                      <td>{before.funds[isin] === undefined ? "-" : <Amount cents={before.funds[isin].gain} />}</td>
                      <td>
                        <Amount cents={after.funds[isin]?.gain ?? null} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}
      <p>
        Your previous history and attached bank statements remain available for recovery. Restoring them later replaces
        the current history, so review any later changes first.
      </p>
      <p>
        This update changes the spreadsheet's record format. Update FolioDash on your other devices before using them
        again; older versions may report a spreadsheet problem and cannot safely work with the new history.
      </p>
      <button
        type="button"
        class="primary"
        onClick={() => {
          void save();
        }}
      >
        Confirm and save earlier statement
      </button>
    </section>
  );
}
