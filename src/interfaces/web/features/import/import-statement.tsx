import type { JSX } from "preact";
import { Amount } from "../../presentation/privacy/privacy";
import type { ReviewAdjustment, ReviewIssue, ReviewStatement } from "../../../../applications/import/import-model";

const MAX_CELLS_LISTED = 8;

const ISSUE_TITLE: Readonly<Record<string, string>> = {
  "layout-not-found": "Not a supported holdings sheet",
  "unsupported-layout": "Unsupported layout",
  "unsupported-structure": "Unexpected row",
  "formula-cell": "Formula not allowed",
  "unreadable-value": "Value cannot be read",
  "missing-value": "Value missing",
  "invalid-identifier": "Invalid ISIN",
  "duplicate-identifier": "Duplicate ISIN",
  "ambiguous-reading": "More than one possible reading",
  "currency-mismatch": "Currency does not match",
  "does-not-reconcile": "Numbers do not add up",
};

function groupAdjustments(adjustments: readonly ReviewAdjustment[]): { message: string; cells: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const adjustment of adjustments) {
    const cells = groups.get(adjustment.message) ?? [];
    if (adjustment.cell !== null) cells.push(adjustment.cell);
    groups.set(adjustment.message, cells);
  }
  return [...groups].map(([message, cells]) => ({ message, cells }));
}

export function Issues(props: { readonly issues: readonly ReviewIssue[] }): JSX.Element {
  return (
    <div class="review-problem" role="alert">
      <h4>This sheet cannot be imported</h4>
      <ul>
        {props.issues.map((issue) => (
          <li key={`${issue.code}-${issue.cell ?? ""}-${issue.message}`}>
            <strong>{ISSUE_TITLE[issue.code] ?? "Problem"}</strong>
            {issue.cell === null ? "" : ` (cell ${issue.cell})`}: {issue.message}
          </li>
        ))}
      </ul>
      <p>If you changed this file by hand, export it again from the bank and choose the new file.</p>
    </div>
  );
}

export function Statement(props: { readonly statement: ReviewStatement }): JSX.Element {
  const { statement } = props;
  const adjustments = groupAdjustments(statement.adjustments);
  return (
    <>
      <dl class="facts stacked">
        <div>
          <dt>Funds found</dt>
          <dd>{statement.funds.length}</dd>
        </div>
        <div>
          <dt>Funds subtotal</dt>
          <dd>
            <Amount cents={statement.fundsSubtotal} />
          </dd>
        </div>
        <div>
          <dt>Grand total</dt>
          <dd>{statement.total === null ? "Not in the file" : <Amount cents={statement.total} />}</dd>
        </div>
      </dl>

      {adjustments.length > 0 && (
        <section aria-labelledby="adjustments-heading" class="review-adjustments">
          <h4 id="adjustments-heading">Read in a different form</h4>
          <p>
            The file was not in the bank's exact form. Each reading below was checked against the other numbers in the
            file, and nothing was guessed.
          </p>
          <ul>
            {adjustments.map((group) => (
              <li key={group.message}>
                {group.message}
                {group.cells.length > 0 &&
                  ` (${group.cells.slice(0, MAX_CELLS_LISTED).join(", ")}${
                    group.cells.length > MAX_CELLS_LISTED
                      ? `, and ${String(group.cells.length - MAX_CELLS_LISTED)} more`
                      : ""
                  })`}
              </li>
            ))}
          </ul>
        </section>
      )}

      <h4 id="review-funds-heading">Funds</h4>
      {statement.funds.length === 0 ? (
        <p>This statement lists no funds.</p>
      ) : (
        <table class="funds" aria-labelledby="review-funds-heading">
          <thead>
            <tr>
              <th scope="col">Fund</th>
              <th scope="col">Market value</th>
            </tr>
          </thead>
          <tbody>
            {statement.funds.map((fund) => (
              <tr key={fund.isin}>
                <th scope="row">
                  {fund.name}
                  <span class="fund-isin">{fund.isin}</span>
                </th>
                <td>
                  <Amount cents={fund.marketValue} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div class="more">
        <details>
          <summary>
            Categories in the file
            <span class="disclosure-description">Why the grand total can differ from the funds subtotal.</span>
          </summary>
          <table class="funds" aria-label="Categories in the file">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Subtotal</th>
                <th scope="col">Used by FolioDash</th>
              </tr>
            </thead>
            <tbody>
              {statement.categories.map((category) => (
                <tr key={category.label}>
                  <th scope="row">{category.label}</th>
                  <td>
                    <Amount cents={category.subtotal} />
                  </td>
                  <td>{category.tracked ? "Yes" : "Not yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </>
  );
}
