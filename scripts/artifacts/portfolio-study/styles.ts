// Source for the isolated, generated design study. Not imported by the application.
export const STUDY_CSS = String.raw`/* Uses authoritative FolioDash tokens; isolated composition proposal. */
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 6rem; }
body { margin: 0; background: radial-gradient(ellipse at 4% 0%, var(--ambient-a), transparent 50%), radial-gradient(ellipse at 96% 0%, var(--ambient-b), transparent 45%), var(--color-background); color: var(--color-text); font: var(--text-body)/var(--leading-body) var(--font-body); font-variant-numeric: tabular-nums; }
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
.sidebar { position: fixed; inset: var(--space-3) auto var(--space-3) var(--space-3); width: 208px; display: flex; flex-direction: column; padding: var(--space-4) var(--space-3); background: var(--nav-background); backdrop-filter: var(--glass-blur); border: 1px solid var(--glass-edge); border-radius: var(--shape-xl); box-shadow: var(--glass-shadow); }
.brand { display: flex; align-items: center; gap: var(--space-2); min-height: var(--touch-target); font-size: var(--text-lead); font-weight: var(--weight-bold); letter-spacing: -0.03em; }
.brand img { border-radius: var(--shape-md); }
.brand small { display: block; color: var(--color-muted); font-size: var(--text-caption); font-weight: var(--weight-regular); letter-spacing: 0; }
.nav-label { margin: calc(var(--space-5) * 1.5) 0 var(--space-3); color: var(--color-muted); font-size: var(--text-caption); letter-spacing: 0.08em; }
.sidebar nav { display: grid; gap: var(--space-2); }
.sidebar nav a { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); min-height: var(--touch-target); border-radius: var(--shape-md); font-size: var(--text-small); font-weight: var(--weight-semibold); }
.sidebar nav .selected { background: color-mix(in srgb, var(--color-accent) 20%, var(--color-surface-2)); color: var(--on-primary-container); box-shadow: inset 0 0 0 1px var(--color-border); }
.nav-number { display: grid; place-items: center; width: 28px; height: 28px; border-radius: var(--shape-sm); background: var(--color-surface-2); color: var(--color-muted); font-size: var(--text-caption); font-weight: var(--weight-semibold); }
.sidebar-note { margin-top: auto; padding-top: var(--space-4); border-top: 1px solid var(--color-border); font-size: var(--text-small); }
.sidebar-note small { display: block; margin-top: var(--space-2); color: var(--color-muted); line-height: var(--leading-body); }
.study-dot { display: inline-block; width: var(--space-2); height: var(--space-2); margin-right: var(--space-2); border-radius: var(--shape-full); background: var(--color-accent); }
.workspace { margin-left: 224px; }
.topbar { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); min-height: 64px; margin: var(--space-3) var(--page-inset) 0; padding: var(--space-2) var(--space-3); border: 1px solid var(--glass-edge); border-radius: var(--shape-xl); background: var(--nav-background); backdrop-filter: var(--glass-blur); box-shadow: var(--glass-shadow); }
.breadcrumb { display: flex; gap: var(--space-3); color: var(--color-muted); font-size: var(--text-small); }
.breadcrumb strong { color: var(--color-text); font-weight: var(--weight-semibold); }
.top-actions { display: flex; align-items: center; gap: var(--space-3); }
.demo-label, .tag, .period { font-size: var(--text-caption); color: var(--color-muted); }
.demo-label { padding: var(--space-1) var(--space-2); border: 1px solid var(--color-border); border-radius: var(--shape-full); }
#privacy { min-height: var(--touch-target); padding: var(--space-2) var(--space-3); background: var(--color-surface); color: var(--color-text); border: 1px solid var(--color-border); border-radius: var(--shape-full); font-size: var(--text-small); font-weight: var(--weight-semibold); }
#privacy[aria-pressed="true"] { background: var(--primary-container); color: var(--on-primary-container); }
main { display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.7fr); gap: var(--gap); max-width: 1480px; margin: 0 auto; padding: var(--space-4) var(--page-inset) var(--space-5); }
.page-heading { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: end; gap: var(--space-4); margin-bottom: var(--space-2); }
.eyebrow { color: var(--color-muted); font-size: var(--text-caption); font-weight: var(--weight-semibold); letter-spacing: 0.1em; margin-bottom: var(--space-2); }
h1 { font-size: var(--text-figure); font-weight: var(--weight-bold); line-height: var(--leading-tight); letter-spacing: -0.045em; }
.intro { color: var(--color-muted); font-size: var(--text-small); margin-top: var(--space-2); }
.as-of { flex-shrink: 0; color: var(--color-muted); font-size: var(--text-caption); text-align: right; padding: var(--space-2) var(--space-3); border-left: 2px solid var(--color-accent); }
.as-of strong { display: block; font-size: var(--text-small); font-weight: var(--weight-semibold); color: var(--color-text); margin-top: var(--space-1); }
.panel { border: 1px solid var(--color-border); border-radius: var(--shape-xl); background: linear-gradient(135deg, var(--color-surface-2), var(--color-surface)); box-shadow: var(--shadow-card-lift), inset 0 1px 0 var(--color-border); padding: var(--space-4); min-width: 0; }
.overview-grid { display: contents; }
.section-head { display: flex; justify-content: space-between; align-items: start; gap: var(--space-3); }
.caption { color: var(--color-muted); font-size: var(--text-caption); line-height: var(--leading-body); }
.section-head .caption { margin-top: var(--space-1); }
.summary { display: flex; flex-direction: column; background: radial-gradient(ellipse at 100% 0%, color-mix(in srgb, var(--color-accent) 55%, transparent), transparent 75%), linear-gradient(135deg, var(--color-hero), color-mix(in srgb, var(--color-accent) 35%, var(--color-hero))); color: var(--color-on-hero); padding: var(--space-4); box-shadow: var(--shadow-card-lift), inset 0 1px 0 var(--color-hero-muted); }
.summary h2 { font-size: var(--text-small); color: var(--color-hero-muted); letter-spacing: 0; }
.summary .tag { background: var(--color-hero); color: var(--color-on-hero); padding: var(--space-1) var(--space-2); border: 1px solid var(--color-hero-muted); border-radius: var(--shape-full); }
.headline { font-size: var(--text-display); line-height: var(--leading-tight); font-weight: var(--weight-semibold); letter-spacing: -0.055em; margin: var(--space-4) 0 var(--space-2); overflow-wrap: anywhere; }
.summary-change { display: flex; flex-wrap: wrap; gap: var(--space-2); font-size: var(--text-small); }
.positive-on-navy { color: var(--color-hero-gain); }
.summary-change > span + span { color: var(--color-hero-gain); background: color-mix(in srgb, var(--color-hero-gain) 12%, transparent); padding: 0 var(--space-2); border-radius: var(--shape-full); }
.summary-caption { margin-top: var(--space-1); color: var(--color-hero-muted); font-size: var(--text-caption); }
.summary-spacer { min-height: var(--space-4); }
.summary-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); padding-top: var(--space-3); border-top: 1px solid color-mix(in srgb, var(--color-hero-muted) 35%, transparent); }
.summary-facts dt { font-size: var(--text-caption); color: var(--color-hero-muted); }
.summary-facts dd { margin-top: var(--space-2); font-size: var(--text-lead); font-weight: var(--weight-semibold); overflow-wrap: anywhere; }
.summary-facts small { display: block; margin-top: var(--space-1); }
.summary-foot { margin-top: var(--space-4); font-size: var(--text-caption); color: var(--color-hero-muted); }
.performance { grid-column: 2; grid-row: 2 / span 2; display: flex; flex-direction: column; background: linear-gradient(145deg, var(--color-surface-2), var(--color-surface)); }
.period { padding: var(--space-1) var(--space-2); background: var(--surface-low); border-radius: var(--shape-full); white-space: nowrap; }
.chart-legend { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); color: var(--color-muted); font-size: var(--text-caption); margin-top: var(--space-4); }
.chart-legend > span { display: flex; align-items: center; gap: var(--space-2); }
.chart-legend small { margin-left: auto; }
.value-key, .invested-key { display: inline-block; width: var(--space-3); border-top: 2px solid var(--color-accent); }
.invested-key { border-color: var(--color-muted); border-top-style: dashed; }
.plot-frame { position: relative; flex: 1; min-height: 340px; margin-top: var(--space-4); }
.performance-plot { position: absolute; inset: 0 auto 0 0; display: block; width: calc(100% - 3rem); height: 100%; overflow: visible; color: var(--color-accent); }
.plot-scale { position: absolute; right: 0; top: 8.37%; bottom: 7.91%; display: flex; flex-direction: column; justify-content: space-between; width: 2.5rem; color: var(--color-muted); font-size: var(--text-caption); }
.plot-dates { display: flex; justify-content: space-between; padding-right: 3rem; margin: var(--space-2) 0 var(--space-3); color: var(--color-muted); font-size: var(--text-caption); }
.plot-grid path { fill: none; stroke: var(--color-grid); }
.plot-area { fill: url(#area); }
.plot-value { fill: none; stroke: var(--color-accent); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.plot-invested { fill: none; stroke: var(--color-muted); stroke-width: 2; stroke-dasharray: 6 6; }
.plot-point { fill: none; stroke: var(--color-accent); stroke-width: 8; stroke-linecap: round; }
.chart-values { margin-top: auto; border-top: 1px solid var(--color-border); padding-top: var(--space-2); }
.chart-values summary { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); min-height: var(--touch-target); border-radius: var(--shape-sm); font-size: var(--text-caption); color: var(--color-muted); cursor: pointer; }
.chart-values summary::after { content: "+"; font-size: var(--text-lead); }
.chart-values[open] summary::after { content: "−"; }
.table-scroll { overflow: auto; max-width: 100%; min-width: 0; border-radius: var(--shape-sm); }
table { width: 100%; border-collapse: collapse; font-size: var(--text-caption); }
caption { text-align: left; color: var(--color-muted); padding: var(--space-2) 0; }
th, td { padding: var(--space-2); border-bottom: 1px solid var(--color-border); text-align: right; white-space: nowrap; }
th:first-child { text-align: left; }
.chart-hidden { flex: 1; display: grid; place-content: center; min-height: 210px; color: var(--color-muted); font-size: var(--text-small); }
.changes { grid-column: 1; grid-row: 3; display: block; margin-top: 0; background: var(--color-surface-2); box-shadow: var(--shadow-card); }
.changes-intro { margin-bottom: var(--space-3); }
.change-metrics { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-3); }
.change-metrics > div { padding: var(--space-3) 0 0; border-top: 1px solid var(--color-border); }
.change-metrics dt { color: var(--color-muted); font-size: var(--text-caption); }
.change-metrics dd { font-size: var(--text-title); font-weight: var(--weight-semibold); margin: var(--space-1) 0; }
.change-metrics small { display: inline-block; padding: 0 var(--space-2); margin-left: var(--space-1); border-radius: var(--shape-full); background: color-mix(in srgb, var(--color-gain) 10%, transparent); font-weight: var(--weight-semibold); }
.gain { color: var(--color-gain); }
.holdings-grid { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1.85fr) minmax(0, 1fr); gap: var(--gap); align-items: start; margin-top: var(--space-2); }
.count { font-size: var(--text-caption); padding: var(--space-1) var(--space-2); border-radius: var(--shape-full); background: var(--color-surface-2); color: var(--color-muted); margin-left: var(--space-2); }
.text-link { display: inline-flex; gap: var(--space-2); align-items: center; min-height: var(--touch-target); font-size: var(--text-caption); color: var(--color-accent); border-radius: var(--shape-sm); }
.holding-columns, .holdings-list > li, .holdings-total { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr); align-items: center; gap: var(--space-3); }
.holding-columns { color: var(--color-muted); font-size: var(--text-caption); letter-spacing: 0.04em; padding: var(--space-4) 0 var(--space-2); }
.holding-columns span:not(:first-child) { text-align: right; }
.holdings-list { list-style: none; padding: 0; margin: 0; }
.holdings-list > li { padding: var(--space-3) 0; border-top: 1px solid var(--color-border); }
.fund-name { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.fund-name h3 { overflow-wrap: anywhere; }
.fund-name .fund-monogram { flex-shrink: 0; display: grid; place-content: center; width: 36px; height: 36px; border-radius: var(--shape-md); font-size: var(--text-caption); font-weight: var(--weight-bold); color: var(--color-text); background: color-mix(in srgb, var(--color-accent) 15%, var(--color-surface)); border: 1px solid var(--color-border); box-shadow: inset 0 1px 0 var(--glass-edge); }
.fund-value, .fund-gain { display: grid; gap: var(--space-1); text-align: right; min-width: 0; }
.fund-value strong, .fund-gain strong { font-size: var(--text-small); font-weight: var(--weight-semibold); overflow-wrap: anywhere; }
.holdings-total { border-top: 1px solid var(--color-border); padding-top: var(--space-3); font-size: var(--text-small); }
.holdings-total > strong { text-align: right; overflow-wrap: anywhere; }
.allocation { background: linear-gradient(145deg, var(--primary-container), var(--color-surface-2)); }
.allocation-bar { position: relative; display: block; width: min(100%, 12rem); aspect-ratio: 1; height: auto; border-radius: var(--shape-full); margin: var(--space-4) auto; background: conic-gradient(var(--series-0) 0% 30%, var(--series-6) 30% 55%, var(--series-1) 55% 75%, var(--series-3) 75% 90%, var(--series-7) 90% 100%); box-shadow: var(--shadow-card); }
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
.comparisons { grid-column: 1 / -1; margin-top: var(--space-2); background: transparent; box-shadow: none; }
.comparisons > p { color: var(--color-muted); font-size: var(--text-small); margin-top: var(--space-3); max-width: 65ch; }
.study-footer { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; gap: var(--space-4); padding: var(--space-4) 0 0; color: var(--color-muted); font-size: var(--text-caption); }
.study-footer strong { color: var(--color-text); font-weight: var(--weight-semibold); }
.mobile-nav { display: none; }
@keyframes settle { from { opacity: var(--motion-reveal-opacity); transform: translateY(var(--motion-nudge)); }
to { opacity: 1; transform: none; }
}
.page-heading, .overview-grid, .changes, .holdings-grid { animation: settle var(--duration-medium) var(--ease-standard) both; }
@media (max-width: 1200px) { .sidebar { width: 176px; padding: var(--space-3); }
.workspace { margin-left: 192px; }
main { grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); }
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
.topbar { min-height: 64px; padding: var(--space-2) var(--space-3); margin: var(--space-2) var(--space-3) 0; }
.breadcrumb { gap: var(--space-2); }
.breadcrumb > span, .breadcrumb { font-size: var(--text-caption); }
  .breadcrumb { display: none; }
  .top-actions { width: 100%; justify-content: space-between; flex-wrap: wrap; }
.demo-label { display: block; }
main { display: block; padding-top: var(--space-4); }
.page-heading { display: block; margin-bottom: var(--space-4); }
h1 { max-width: 19ch; }
.as-of { text-align: left; margin-top: var(--space-3); font-size: var(--text-caption); border-left: 0; padding: 0; }
.as-of strong { display: inline; margin-left: var(--space-2); font-size: var(--text-caption); }
.overview-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gap); }
.performance { grid-column: auto; grid-row: auto; }
.plot-frame { min-height: 220px; }
.changes, .holdings-grid { margin-top: var(--gap); }
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
.allocation-bar > span { display: none; }
.allocation-bar::before { content: ""; position: absolute; inset: 19%; border-radius: var(--shape-full); background: var(--color-surface-2); box-shadow: inset 0 0 0 1px var(--color-border); }
.allocation-bar::after { content: "5 funds"; position: absolute; inset: 0; display: grid; place-items: center; font-size: var(--text-lead); font-weight: var(--weight-semibold); }
@media (max-width: 640px) { .allocation-bar { width: min(100%, 10rem); } }
.performance > .chart-sensitive { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.chart-values { min-width: 0; width: 100%; }
.chart-values:not([open]) > .table-scroll { display: none; }
.plot-value, .plot-invested, .plot-grid path, .plot-point { vector-effect: non-scaling-stroke; }
`;
