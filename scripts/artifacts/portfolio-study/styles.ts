// Source for the isolated, generated design study. Not imported by the application.
export const STUDY_CSS = String.raw`/* Uses authoritative FolioDash tokens; isolated composition proposal. */
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 6rem; }
body { margin: 0; background: var(--color-background); color: var(--color-text); font: var(--text-body)/var(--leading-body) var(--font-body); font-variant-numeric: tabular-nums; }
button, a, summary { -webkit-tap-highlight-color: transparent; }
button { font: inherit; cursor: pointer; }
a { color: inherit; text-decoration: none; }
h1, h2, h3, p, dl, dd { margin: 0; }
h2 { font-size: var(--text-lead); font-weight: var(--weight-semibold); letter-spacing: -0.025em; }
h3 { font-size: var(--text-small); font-weight: var(--weight-semibold); }
small { font-size: var(--text-caption); }
:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 4px; }
[hidden] { display: none !important; }
.skip { position: fixed; z-index: 10; top: var(--space-2); left: var(--space-2); padding: var(--space-3); background: var(--color-surface); transform: translateY(-200%); }
.skip:focus { transform: none; }
.sr-only { position: absolute; width: 1px; height: 1px; clip-path: inset(50%); overflow: hidden; white-space: nowrap; }
.sidebar { position: fixed; inset: 0 auto 0 0; width: 224px; display: flex; flex-direction: column; padding: var(--space-4); background: var(--color-surface); border-right: 1px solid var(--color-border); }
.brand { display: flex; align-items: center; gap: var(--space-2); min-height: var(--touch-target); font-size: var(--text-lead); font-weight: var(--weight-bold); letter-spacing: -0.03em; }
.brand img { border-radius: var(--shape-md); }
.brand small { display: block; color: var(--color-muted); font-size: var(--text-caption); font-weight: var(--weight-regular); letter-spacing: 0; }
.nav-label { margin: calc(var(--space-5) * 1.5) 0 var(--space-3); color: var(--color-muted); font-size: var(--text-caption); letter-spacing: 0.08em; }
.sidebar nav { display: grid; gap: var(--space-2); }
.sidebar nav a { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); min-height: var(--touch-target); border-radius: var(--shape-md); font-size: var(--text-small); font-weight: var(--weight-semibold); }
.sidebar nav .selected { background: var(--primary-container); color: var(--on-primary-container); }
.nav-number { color: var(--color-muted); font-size: var(--text-caption); font-weight: var(--weight-regular); }
.sidebar-note { margin-top: auto; padding-top: var(--space-4); border-top: 1px solid var(--color-border); font-size: var(--text-small); }
.sidebar-note small { display: block; margin-top: var(--space-2); color: var(--color-muted); line-height: var(--leading-body); }
.study-dot { display: inline-block; width: var(--space-2); height: var(--space-2); margin-right: var(--space-2); border-radius: var(--shape-full); background: var(--color-accent); }
.workspace { margin-left: 224px; }
.topbar { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); min-height: 80px; padding: var(--space-3) var(--page-inset); border-bottom: 1px solid var(--color-border); background: var(--nav-background); backdrop-filter: var(--glass-blur); }
.breadcrumb { display: flex; gap: var(--space-3); color: var(--color-muted); font-size: var(--text-small); }
.breadcrumb strong { color: var(--color-text); font-weight: var(--weight-semibold); }
.top-actions { display: flex; align-items: center; gap: var(--space-3); }
.demo-label, .tag, .period { font-size: var(--text-caption); color: var(--color-muted); }
.demo-label { padding: var(--space-1) var(--space-2); border: 1px solid var(--color-border); border-radius: var(--shape-full); }
#privacy { min-height: var(--touch-target); padding: var(--space-2) var(--space-3); background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); border-radius: var(--shape-full); font-size: var(--text-small); font-weight: var(--weight-semibold); }
#privacy[aria-pressed="true"] { background: var(--primary-container); color: var(--on-primary-container); }
main { max-width: 1480px; margin: 0 auto; padding: var(--space-5) var(--page-inset); }
.page-heading { display: flex; justify-content: space-between; align-items: end; gap: var(--space-4); margin-bottom: var(--space-4); }
.eyebrow { color: var(--color-muted); font-size: var(--text-caption); font-weight: var(--weight-semibold); letter-spacing: 0.1em; margin-bottom: var(--space-2); }
h1 { font-size: var(--text-figure); font-weight: var(--weight-semibold); line-height: var(--leading-tight); letter-spacing: -0.04em; }
.intro { color: var(--color-muted); font-size: var(--text-small); margin-top: var(--space-2); }
.as-of { flex-shrink: 0; color: var(--color-muted); font-size: var(--text-caption); text-align: right; }
.as-of strong { display: block; font-size: var(--text-small); font-weight: var(--weight-semibold); color: var(--color-text); margin-top: var(--space-1); }
.panel { border: 1px solid var(--color-border); border-radius: var(--shape-xl); background: var(--color-surface); box-shadow: var(--shadow-card); padding: var(--space-4); min-width: 0; }
.overview-grid { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.7fr); gap: var(--gap); align-items: stretch; }
.section-head { display: flex; justify-content: space-between; align-items: start; gap: var(--space-3); }
.caption { color: var(--color-muted); font-size: var(--text-caption); line-height: var(--leading-body); }
.section-head .caption { margin-top: var(--space-1); }
.summary { display: flex; flex-direction: column; background: var(--color-hero); color: var(--color-on-hero); padding: var(--space-4); }
.summary h2 { font-size: var(--text-small); color: var(--color-hero-muted); letter-spacing: 0; }
.summary .tag { color: var(--color-hero-muted); }
.headline { font-size: var(--text-display); line-height: var(--leading-tight); font-weight: var(--weight-semibold); letter-spacing: -0.055em; margin: var(--space-4) 0 var(--space-2); overflow-wrap: anywhere; }
.summary-change { display: flex; flex-wrap: wrap; gap: var(--space-2); font-size: var(--text-small); }
.positive-on-navy { color: var(--color-hero-gain); }
.summary-change > span + span { color: var(--color-hero-gain); }
.summary-caption { margin-top: var(--space-1); color: var(--color-hero-muted); font-size: var(--text-caption); }
.summary-spacer { flex: 1; min-height: var(--space-5); }
.summary-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); padding-top: var(--space-4); border-top: 1px solid var(--color-hero-muted); }
.summary-facts dt { font-size: var(--text-caption); color: var(--color-hero-muted); }
.summary-facts dd { margin-top: var(--space-2); font-size: var(--text-lead); font-weight: var(--weight-semibold); overflow-wrap: anywhere; }
.summary-facts small { display: block; margin-top: var(--space-1); }
.summary-foot { margin-top: var(--space-4); font-size: var(--text-caption); color: var(--color-hero-muted); }
.performance { display: flex; flex-direction: column; }
.period { padding: var(--space-1) var(--space-2); background: var(--surface-low); border-radius: var(--shape-full); white-space: nowrap; }
.chart-legend { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); color: var(--color-muted); font-size: var(--text-caption); margin-top: var(--space-4); }
.chart-legend > span { display: flex; align-items: center; gap: var(--space-2); }
.chart-legend small { margin-left: auto; }
.value-key, .invested-key { display: inline-block; width: var(--space-3); border-top: 2px solid var(--color-accent); }
.invested-key { border-color: var(--color-muted); border-top-style: dashed; }
.plot-frame { display: flex; align-items: stretch; gap: var(--space-2); margin-top: var(--space-3); }
.performance-plot { display: block; width: calc(100% - 3rem); height: auto; overflow: visible; color: var(--color-accent); }
.plot-scale { display: flex; flex-direction: column; justify-content: space-between; width: 2.5rem; padding: 1% 0; color: var(--color-muted); font-size: var(--text-caption); }
.plot-dates { display: flex; justify-content: space-between; padding-right: 3rem; margin: var(--space-2) 0 var(--space-3); color: var(--color-muted); font-size: var(--text-caption); }
.plot-grid path { fill: none; stroke: var(--color-grid); }
.plot-area { fill: url(#area); }
.plot-value { fill: none; stroke: var(--color-accent); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.plot-invested { fill: none; stroke: var(--color-muted); stroke-width: 2; stroke-dasharray: 6 6; }
.plot-point { fill: var(--color-accent); stroke: var(--color-surface); stroke-width: 3; }
.chart-values { margin-top: auto; border-top: 1px solid var(--color-border); padding-top: var(--space-2); }
.chart-values summary { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); min-height: var(--touch-target); border-radius: var(--shape-sm); font-size: var(--text-caption); color: var(--color-muted); cursor: pointer; }
.chart-values summary::after { content: "+"; font-size: var(--text-lead); }
.chart-values[open] summary::after { content: "−"; }
.table-scroll { overflow: auto; border-radius: var(--shape-sm); }
table { width: 100%; border-collapse: collapse; font-size: var(--text-caption); }
caption { text-align: left; color: var(--color-muted); padding: var(--space-2) 0; }
th, td { padding: var(--space-2); border-bottom: 1px solid var(--color-border); text-align: right; white-space: nowrap; }
th:first-child { text-align: left; }
.chart-hidden { flex: 1; display: grid; place-content: center; min-height: 210px; color: var(--color-muted); font-size: var(--text-small); }
.changes { display: flex; align-items: center; gap: var(--space-4); margin-top: var(--gap); background: var(--surface-low); box-shadow: none; }
.changes-intro { flex: 0 0 21%; }
.change-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); flex: 1; gap: var(--space-3); }
.change-metrics > div { padding-left: var(--space-4); border-left: 1px solid var(--color-border); }
.change-metrics dt { color: var(--color-muted); font-size: var(--text-caption); }
.change-metrics dd { font-size: var(--text-lead); font-weight: var(--weight-semibold); margin: var(--space-1) 0; }
.change-metrics small { display: block; font-weight: var(--weight-regular); }
.gain { color: var(--color-gain); }
.holdings-grid { display: grid; grid-template-columns: minmax(0, 1.85fr) minmax(0, 1fr); gap: var(--gap); align-items: start; margin-top: var(--space-4); }
.count { font-size: var(--text-caption); padding: var(--space-1) var(--space-2); border-radius: var(--shape-full); background: var(--color-surface-2); color: var(--color-muted); margin-left: var(--space-2); }
.text-link { display: inline-flex; gap: var(--space-2); align-items: center; min-height: var(--touch-target); font-size: var(--text-caption); color: var(--color-accent); border-radius: var(--shape-sm); }
.holding-columns, .holdings-list > li, .holdings-total { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: var(--space-3); }
.holding-columns { color: var(--color-muted); font-size: var(--text-caption); letter-spacing: 0.04em; padding: var(--space-4) 0 var(--space-2); }
.holding-columns span:not(:first-child) { text-align: right; }
.holdings-list { list-style: none; padding: 0; margin: 0; }
.holdings-list > li { padding: var(--space-3) 0; border-top: 1px solid var(--color-border); }
.fund-name { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.fund-name h3 { overflow-wrap: anywhere; }
.fund-name .fund-monogram { flex-shrink: 0; display: grid; place-content: center; width: 32px; height: 32px; border-radius: var(--shape-sm); font-size: var(--text-caption); font-weight: var(--weight-bold); color: var(--color-text); background: var(--surface-low); border: 1px solid var(--color-border); }
.fund-value, .fund-gain { display: grid; gap: var(--space-1); text-align: right; min-width: 0; }
.fund-value strong, .fund-gain strong { font-size: var(--text-small); font-weight: var(--weight-semibold); overflow-wrap: anywhere; }
.holdings-total { border-top: 1px solid var(--color-border); padding-top: var(--space-3); font-size: var(--text-small); }
.holdings-total > strong { text-align: right; overflow-wrap: anywhere; }
.allocation { background: var(--color-surface-2); }
.allocation-bar { display: flex; height: var(--space-3); border-radius: var(--shape-full); overflow: hidden; margin-top: var(--space-4); gap: 0; }
.allocation-bar > span:nth-child(1) { flex: 30; }
.allocation-bar > span:nth-child(2) { flex: 25; }
.allocation-bar > span:nth-child(3) { flex: 20; }
.allocation-bar > span:nth-child(4) { flex: 15; }
.allocation-bar > span:nth-child(5) { flex: 10; }
.series-a { background: var(--series-0); }
.series-b { background: var(--series-6); }
.series-c { background: var(--series-1); }
.series-d { background: var(--series-3); }
.series-e { background: var(--series-7); }
.allocation-list { list-style: none; padding: 0; margin: var(--space-3) 0; }
.allocation-list li { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); padding: var(--space-2) 0; font-size: var(--text-small); }
.allocation-list li > span { display: flex; align-items: baseline; gap: var(--space-2); }
.allocation-list i { width: var(--space-2); height: var(--space-2); border-radius: var(--shape-full); flex-shrink: 0; }
.allocation-list strong { font-weight: var(--weight-semibold); }
.allocation-foot { border-top: 1px solid var(--color-border); padding-top: var(--space-3); font-size: var(--text-small); }
.comparisons { margin-top: var(--space-4); background: transparent; box-shadow: none; }
.comparisons > p { color: var(--color-muted); font-size: var(--text-small); margin-top: var(--space-3); max-width: 65ch; }
.study-footer { display: flex; justify-content: space-between; align-items: center; gap: var(--space-4); padding: var(--space-4) 0 0; color: var(--color-muted); font-size: var(--text-caption); }
.study-footer strong { color: var(--color-text); font-weight: var(--weight-semibold); }
.mobile-nav { display: none; }
@keyframes settle { from { opacity: var(--motion-reveal-opacity); transform: translateY(var(--motion-nudge)); }
to { opacity: 1; transform: none; }
}
.page-heading, .overview-grid, .changes, .holdings-grid { animation: settle var(--duration-medium) var(--ease-standard) both; }
@media (max-width: 1200px) { .sidebar { width: 192px; padding: var(--space-3); }
.workspace { margin-left: 192px; }
.overview-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); }
.headline { font-size: var(--text-figure); }
.holdings-grid { grid-template-columns: minmax(0, 1fr); }
.allocation-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 var(--space-4); }
.changes-intro { flex-basis: 18%; }
.change-metrics > div { padding-left: var(--space-3); }
}
@media (max-width: 900px) { .sidebar { display: none; }
.workspace { margin-left: 0; }
main { padding-bottom: calc(var(--mobile-nav-height) + var(--space-5) + env(safe-area-inset-bottom)); }
.mobile-nav { display: flex; position: fixed; bottom: 0; left: 0; right: 0; z-index: 5; padding: var(--space-2) var(--space-3) calc(var(--space-2) + env(safe-area-inset-bottom)); border-top: 1px solid var(--glass-edge); background: var(--nav-background); backdrop-filter: var(--glass-blur); gap: var(--space-1); }
.mobile-nav a { display: flex; justify-content: center; align-items: center; min-height: var(--touch-target); flex: 1; border-radius: var(--shape-md); font-size: var(--text-caption); color: var(--color-muted); }
.mobile-nav a[aria-current] { color: var(--on-primary-container); background: var(--primary-container); }
}
@media (max-width: 640px) { html { scroll-padding-top: var(--space-4); }
.topbar { min-height: 72px; padding: var(--space-2) var(--space-3); }
.breadcrumb { gap: var(--space-2); }
.breadcrumb > span, .breadcrumb { font-size: var(--text-caption); }
  .breadcrumb { display: none; }
  .top-actions { width: 100%; justify-content: space-between; flex-wrap: wrap; }
.demo-label { display: block; }
main { padding-top: var(--space-4); }
.page-heading { display: block; }
h1 { max-width: 19ch; }
.as-of { text-align: left; margin-top: var(--space-3); font-size: var(--text-caption); }
.as-of strong { display: inline; margin-left: var(--space-2); font-size: var(--text-caption); }
.overview-grid { grid-template-columns: minmax(0, 1fr); }
.summary { padding: var(--space-4); }
.headline { font-size: var(--text-display); }
.summary-spacer { min-height: var(--space-4); }
.summary-facts { padding-top: var(--space-3); }
.summary-foot { margin-top: var(--space-3); }
.performance, .holdings, .allocation, .changes, .comparisons { padding: var(--space-3); }
.performance .section-head { flex-wrap: wrap; }
.chart-legend small { margin-left: 0; width: 100%; }
.changes { display: block; }
.changes-intro { margin-bottom: var(--space-3); }
.change-metrics { grid-template-columns: minmax(0, 1fr); gap: 0; }
.change-metrics > div { display: grid; grid-template-columns: 1fr 1fr; align-items: baseline; gap: 0 var(--space-2); border-left: 0; padding: var(--space-2) 0; border-top: 1px solid var(--color-border); }
.change-metrics dd { text-align: right; font-size: var(--text-body); }
.change-metrics .caption { grid-column: 1 / -1; }
.holdings .section-head { flex-wrap: wrap; gap: 0; }
.holding-columns { display: none; }
.holdings-list { margin-top: var(--space-2); }
.holdings-list > li { grid-template-columns: 1fr 1fr; gap: var(--space-2); padding: var(--space-3) 0; }
.fund-name { grid-column: 1 / -1; }
.fund-value { text-align: left; padding-left: var(--space-5); }
.fund-value strong::before { content: "Value"; display: block; color: var(--color-muted); font-size: var(--text-caption); font-weight: var(--weight-regular); }
.fund-gain strong::before { content: "Total gain"; display: block; color: var(--color-muted); font-size: var(--text-caption); font-weight: var(--weight-regular); }
.holdings-total { grid-template-columns: 1fr 1fr; }
.holdings-total > span { grid-column: 1 / -1; }
.holdings-total > strong:first-of-type { text-align: left; }
.allocation-list { display: block; }
.comparisons .section-head { flex-wrap: wrap; }
.study-footer { display: block; }
}
@media (forced-colors: active) { .panel, .fund-monogram, .mobile-nav, .sidebar { border: 1px solid CanvasText; }
.plot-value, .plot-invested, .plot-point { stroke: CanvasText; }
.plot-grid path { stroke: GrayText; }
.plot-point { fill: Canvas; }
}
.change-metrics dd.caption { font-size: var(--text-caption); font-weight: var(--weight-regular); text-align: left; }

/* Reflow follows available space, including enlarged text. */
.topbar, .section-head { flex-wrap: wrap; }
.caption, .allocation-list, .study-footer { overflow-wrap: anywhere; }
.summary-facts { grid-template-columns: repeat(auto-fit, minmax(min(100%, 8rem), 1fr)); }
.mobile-nav { flex-wrap: wrap; }
.mobile-nav a { flex: 1 1 4rem; }
@media (max-width: 640px) {
  .period { white-space: normal; }
  .change-metrics > div { grid-template-columns: repeat(auto-fit, minmax(min(100%, 6rem), 1fr)); }
  .study-footer > span { display: block; }
}

main { container-type: inline-size; }
.mobile-nav a { flex-basis: 3rem; }
@container (max-width: 12em) {
  .panel { padding: var(--space-2); }
  .plot-dates span:nth-child(2), .plot-dates span:nth-child(3) { display: none; }
  .headline { font-size: var(--text-lead); }
  .holdings-list > li, .holdings-total, .allocation-list li { display: block; }
  .fund-monogram { display: none; }
  .fund-value, .fund-gain { padding-left: 0; text-align: left; margin-top: var(--space-2); }
  .holdings-total > strong { display: block; text-align: left; margin-top: var(--space-2); }
  .allocation-list strong { display: block; margin-top: var(--space-1); }
}
.design-notes { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; max-width: 80ch; }
`;
