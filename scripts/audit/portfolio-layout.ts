import assert from "node:assert/strict";

type Evaluate = (source: string) => Promise<unknown>;
type LayoutEvidence = { readonly name: string; readonly result: unknown };

/** Checks Portfolio geometry in the production renderer at each viewport state. */
export async function assertPortfolioLayout(
  evaluate: Evaluate,
  screen: { readonly name: string; readonly variant: string; readonly text: number },
): Promise<LayoutEvidence | undefined> {
  if (screen.variant !== "many" || screen.text !== 100) return undefined;
  const gridAligned = await evaluate(`(() => {
    const dashboard = document.querySelector('.portfolio-dashboard');
    const holdings = dashboard.querySelector('.portfolio-holdings').getBoundingClientRect();
    const rail = dashboard.querySelector('.portfolio-rail').getBoundingClientRect();
    const cards = [...dashboard.querySelector('.portfolio-rail').children].map(e => e.getBoundingClientRect());
    const analysis = dashboard.querySelector('.analysis-grid');
    const analysisCards = [...analysis.children].map(e => e.getBoundingClientRect());
    const gap = parseFloat(getComputedStyle(dashboard).gap);
    const near = (a, b) => Math.abs(a - b) < 1;
    const horizontalRail = near(cards[0].top, cards[1].top);
    const stackedRail = near(cards[0].left, cards[1].left) && near(cards[0].right, cards[1].right);
    const besideHoldings = near(rail.left - holdings.right, gap);
    if (cards.length !== 2) return "wrong-card-count";
    if (horizontalRail) return near(holdings.left, rail.left) && near(holdings.right, rail.right)
      && near(cards[0].left, rail.left) && near(cards[1].right, rail.right)
      && near(cards[1].left - cards[0].right, gap) && near(cards[0].top, cards[1].top)
      && near(analysisCards.at(-1).left, analysisCards.at(-2).left)
      && near(analysisCards.at(-1).right, analysisCards.at(-2).right) ? "ok" : "horizontal-geometry";
    if (stackedRail && !besideHoldings) return near(holdings.left, rail.left) && near(holdings.right, rail.right)
      && near(cards[0].left, cards[1].left) && near(cards[0].right, cards[1].right)
      && near(cards[1].top - cards[0].bottom, gap) ? "ok" : "stacked-geometry";
    return besideHoldings && near(holdings.top, rail.top) && near(rail.bottom, cards.at(-1).bottom)
      && near(rail.left - holdings.right, gap)
      && near(cards[1].top - cards[0].bottom, gap)
      && near(analysisCards[0].top, analysisCards[1].top)
      && near(analysisCards.at(-1).top, analysisCards.at(-2).top)
      && near(analysisCards[0].width, analysisCards.at(-1).width)
      && near(analysisCards[1].width, analysisCards.at(-2).width) ? "ok" : "wide-geometry";
  })()`);
  assert.equal(gridAligned, "ok", `${screen.name}: holdings and supporting cards align to the dashboard grid`);
  if (screen.name === "changes-expanded") {
    const trends = (await evaluate(`(() => {
      const card = document.querySelector('.period-results');
      const stats = [...card.querySelectorAll('.stat')];
      const width = card.getBoundingClientRect().width;
      return {
        width,
        trends: stats.map(stat => {
          const chart = stat.querySelector('.sparkline').getBoundingClientRect();
          const pill = stat.querySelector('.pill');
          return {
            chartWidth: chart.width,
            pillPresent: pill !== null,
            pillBeforeChart: pill === null || pill.getBoundingClientRect().right < chart.left,
          };
        }),
      };
    })()`)) as { width: number; trends: { chartWidth: number; pillPresent: boolean; pillBeforeChart: boolean }[] };
    assert.ok(
      trends.width >= 28 * 16 && trends.width < 38 * 16,
      "changes-expanded: card is in the expanded-trend range",
    );
    assert.ok(
      trends.trends.length === 3 && trends.trends.every((trend) => trend.chartWidth >= 9 * 16 && trend.pillBeforeChart),
      "changes-expanded: every trend claims its inline panel without displacing its percentage",
    );
    return { name: "changes-expanded trends", result: trends };
  }
  if (screen.name !== "sidebar-constrained") return undefined;
  const hierarchy = (await evaluate(`(() => {
    const dashboard = document.querySelector('.portfolio-dashboard');
    const hero = dashboard.querySelector('.hero').getBoundingClientRect();
    const chart = dashboard.querySelector('.portfolio-trend').getBoundingClientRect();
    const changes = dashboard.querySelector('.period-results').getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(dashboard).gap);
    const near = (a, b) => Math.abs(a - b) < 1;
    return {
      dashboardWidth: dashboard.getBoundingClientRect().width,
      heroWidth: hero.width,
      stacked: near(hero.left, chart.left) && near(hero.right, chart.right)
        && near(chart.top - hero.bottom, gap) && near(changes.top - chart.bottom, gap),
    };
  })()`)) as { dashboardWidth: number; heroWidth: number; stacked: boolean };
  assert.ok(hierarchy.dashboardWidth < 70 * 16, "sidebar-constrained: dashboard is below its wide-layout threshold");
  assert.equal(
    hierarchy.stacked,
    true,
    `sidebar-constrained: summary, chart and changes retain full-width hierarchy (${JSON.stringify(hierarchy)})`,
  );
  assert.ok(hierarchy.heroWidth >= 40 * 16, "sidebar-constrained: summary has a readable minimum inline size");
  return { name: "sidebar-constrained hierarchy", result: hierarchy };
}
