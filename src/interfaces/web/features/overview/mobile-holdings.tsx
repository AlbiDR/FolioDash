import type { JSX } from "preact";
import type { OverviewFund } from "./model/overview-model";
import { Icon } from "../../shared/ui/icons";
import { Amount } from "../../presentation/privacy/privacy";
import { Percent, Pill, Signed } from "./parts";

/** The phone's holdings preserve the same figures and keyed fund identity as the desktop table. */
export function MobileHoldings(props: {
  readonly funds: readonly OverviewFund[];
  /** Funds that were not listed before this render: only they fade in, so a search never re-fades the rows that stay. */
  readonly fresh: ReadonlySet<string>;
  /** Funds that have just left the list: they stay while they fade out. */
  readonly leaving: ReadonlySet<string>;
}): JSX.Element {
  return (
    <ul class="mobile-holdings">
      {props.funds.map((fund) => (
        <li
          key={fund.isin}
          class={props.leaving.has(fund.isin) ? "row-leaving" : props.fresh.has(fund.isin) ? "holding-new" : undefined}
          inert={props.leaving.has(fund.isin)}
          aria-hidden={props.leaving.has(fund.isin) ? true : undefined}
        >
          <a href={`#fund/${fund.isin}`} class="holding">
            <span class="holding-id">
              <span class="holding-name">{fund.name}</span>
              <span class="holding-meta">{fund.status === "closed" ? `Closed · ${fund.isin}` : fund.isin}</span>
            </span>
            <span class="holding-headline">
              <span class="holding-value">
                <span class="visually-hidden">Value </span>
                <Amount cents={fund.latest?.value ?? null} />
              </span>
              <span>
                <span class="visually-hidden">Gain percent </span>
                <Pill ratio={fund.latest?.gainPercent ?? null} signed />
              </span>
            </span>
            <Icon name="chevron" size={18} />
            <span class="holding-detail">
              <span class="holding-fact">
                <span class="holding-label">Gain</span>
                <Signed cents={fund.latest?.gain ?? null} />
              </span>
              <span class="holding-fact">
                <span class="holding-label">Net invested</span>
                <Amount cents={fund.latest?.netInvested ?? null} />
              </span>
              <span class="holding-fact">
                <span class="holding-label">Share of portfolio</span>
                {fund.status === "closed" ? "-" : <Percent ratio={fund.latest?.share ?? null} />}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
