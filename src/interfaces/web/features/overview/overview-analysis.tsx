import type { JSX } from "preact";
import { formatDateLong } from "../../../../core/values/iso-date";
import type { ChartRange } from "./model/chart-range";
import { LineChart } from "../../presentation/charts/line-chart";
import { MonthlyBars } from "../../presentation/charts/monthly-bars";
import { PerformanceBars } from "../../presentation/charts/performance-bars";
import { Icon } from "../../shared/ui/icons";
import { euroLabel, euroAxisLabel, monthLabel, observationLabel } from "./model/chart-data";
import type { dashboardFor } from "./model/dashboard-data";
import type { OverviewModel } from "./model/overview-model";
import type { ReturnsGrid } from "./model/returns-grid";
import { ReturnsCard } from "./overview-cards";

export function AnalysisSection(props: {
  readonly model: OverviewModel;
  readonly range: ChartRange;
  readonly bars: ReturnType<typeof dashboardFor>["bars"];
  readonly fundSeries: ReturnType<typeof dashboardFor>["fundSeries"];
  readonly ranking: ReturnType<typeof dashboardFor>["ranking"];
  readonly grid: ReturnsGrid;
}): JSX.Element {
  const { dates, funds } = props.model;
  const { bars, ranking, grid } = props;
  return (
    <section class="cell-12 dashboard-analysis" aria-labelledby="portfolio-analysis">
      <h2 id="portfolio-analysis" class="card-title" tabIndex={-1}>
        Trends and comparisons
      </h2>
      <p class="card-subtitle">Monthly movement, fund performance and the data behind your portfolio.</p>
      <div class="dash analysis-grid">
        <div class="card cell-6">
          <h3 class="card-title">Monthly change in gain</h3>
          <p class="card-subtitle">How much your gain changed each month. Hover or tap a bar to read it.</p>
          <MonthlyBars
            id="monthly-bars"
            title="Change in gain"
            description="Bars for the change in gain each month: above the line is a gain, below is a loss."
            bars={bars}
            updateKey={props.range}
            formatValue={euroLabel}
          />
          <p class="footnote">A month has no bar when there is no statement from the month before it.</p>
        </div>

        <div class="cell-6">
          <LineChart
            id="funds-chart"
            updateKey={props.range}
            title="Value of each fund"
            subtitle="Solid line: a fund's value. Dotted line, same colour: what you have put into it. A gap means it was not held that month."
            description="One solid line per fund showing its value over time, and a faint dotted line in the same colour for the money invested in it. A fund that was not held leaves a gap."
            series={props.fundSeries}
            formatTime={monthLabel}
            formatObservation={observationLabel(props.model.dates, props.model.labels)}
            formatValue={euroLabel}
            formatAxisValue={euroAxisLabel}
            axisUnit="EUR"
            showInspectionDetails={false}
            emptyMessage="No fund has a value to plot yet."
          />
        </div>

        {grid.rows.length >= 2 && <ReturnsCard grid={grid} estimated={props.model.estimated} />}

        <div class="card cell-8">
          <h3 class="card-title">Gain by fund</h3>
          <p class="card-subtitle">Gain as a percentage of what you put in. Not a yearly rate.</p>
          {ranking.length === 0 ? (
            <p class="empty-note">No fund has a percentage to rank yet.</p>
          ) : (
            <PerformanceBars
              rows={ranking.map((fund) => ({
                key: fund.isin,
                href: `#fund/${fund.isin}`,
                label: fund.name,
                ratio: fund.percent,
                dim: fund.closed,
              }))}
            />
          )}
          <p class="footnote">Funds you have sold are dimmed.</p>
        </div>

        <div class="card cell-4">
          <h3 class="card-title">About this data</h3>
          <p class="card-subtitle">Where these figures come from.</p>
          <dl class="facts stacked">
            <div>
              <dt>Statements recorded</dt>
              <dd>{dates.length}</dd>
            </div>
            <div>
              <dt>First statement</dt>
              <dd>{dates[0] === undefined ? "-" : formatDateLong(dates[0])}</dd>
            </div>
            <div>
              <dt>Funds ever held</dt>
              <dd>{funds.length}</dd>
            </div>
          </dl>
          <a class="row-link plain" href="#months">
            <span>Month by month</span>
            <Icon name="chevron" size={18} />
          </a>
        </div>
      </div>
    </section>
  );
}
