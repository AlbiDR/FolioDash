// Source for the isolated, generated design study. Not imported by the application.
export const STUDY_HTML = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>Portfolio composition study · FolioDash</title>
    <link rel="icon" href="icon.svg" />
    <link rel="stylesheet" href="tokens.css" />
    <link rel="stylesheet" href="portfolio-layout-study.css" />
    <link rel="stylesheet" href="control-feedback.css" />
    <script src="portfolio-layout-study.js" defer></script>
  </head>
  <body class="shell">
    <a class="skip" href="#portfolio">Skip to portfolio</a>
    <aside class="sidebar" aria-label="Study navigation">
      <a class="brand" href="#portfolio"
        ><img src="icon.svg" alt="" width="40" height="40" /><span
          >FolioDash<small>Your financial workspace</small></span
        ></a
      >
      <p class="nav-label">IN THIS PORTFOLIO</p>
      <nav aria-label="Portfolio sections">
        <a class="selected" href="#portfolio" aria-current="location"><span class="nav-number">01</span> Overview</a>
        <a href="#holdings"><span class="nav-number">02</span> Holdings</a>
        <a href="#allocation"><span class="nav-number">03</span> Allocation</a>
        <a href="#comparisons"><span class="nav-number">04</span> Comparisons</a>
      </nav>
      <div class="sidebar-note">
        <span class="study-dot"></span> Layout study<small
          >Invented figures. No account connection or financial actions.</small
        >
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <span class="breadcrumb">FolioDash <span aria-hidden="true">/</span> <strong>Portfolio</strong></span>
        <div class="top-actions">
          <span class="demo-label">Synthetic data</span
          ><button id="privacy" type="button" aria-pressed="false">Hide figures</button>
        </div>
      </header>
      <main id="portfolio" tabindex="-1">
        <div class="page-heading">
          <div>
            <p class="eyebrow">PORTFOLIO OVERVIEW</p>
            <h1>Your portfolio.</h1>
            <p class="intro">The bigger picture, down to each fund.</p>
          </div>
          <p class="as-of">Latest statement<strong>17 November 2026</strong></p>
        </div>

        <div class="overview-grid">
          <section class="summary panel" aria-labelledby="value-title">
            <div class="section-head">
              <h2 id="value-title">Total fund value</h2>
              <span class="tag">5 funds</span>
            </div>
            <p class="headline sensitive">128.450,00 €</p>
            <p class="summary-change">
              <span class="positive-on-navy sensitive">+2.150,00 €</span><span class="sensitive">+1,70%</span>
            </p>
            <p class="summary-caption">since the previous month</p>
            <div class="summary-spacer"></div>
            <dl class="summary-facts">
              <div>
                <dt>Net invested</dt>
                <dd class="sensitive">110.000,00 €</dd>
              </div>
              <div>
                <dt>Total gain</dt>
                <dd class="positive-on-navy sensitive">+18.450,00 €<small>+16,77%</small></dd>
              </div>
            </dl>
            <p class="summary-foot">Fund values only. Account cash excluded.</p>
          </section>

          <section class="performance panel" aria-labelledby="performance-title">
            <div class="section-head">
              <div>
                <h2 id="performance-title">Performance</h2>
                <p class="caption">Recorded fund value and net invested</p>
              </div>
              <span class="period">Apr-Nov 2026</span>
            </div>
            <div class="chart-legend">
              <span><i class="value-key"></i>Fund value</span><span><i class="invested-key"></i>Net invested</span
              ><small>EUR · linear scale</small>
            </div>
            <div class="chart-sensitive">
              <div class="plot-frame">
                <svg class="performance-plot" viewBox="0 0 640 215" preserveAspectRatio="none" role="img" aria-labelledby="plot-title plot-desc">
                  <title id="plot-title">Illustrative portfolio chart</title>
                  <desc id="plot-desc">
                    Eight invented observations, April to November 2026. Fund value rises from 110,800 to 128,450 euros,
                    with intervening falls. Net invested stays at 110,000 euros. Exact figures follow in the table.
                  </desc>
                  <defs>
                    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stop-color="currentColor" stop-opacity=".28" />
                      <stop offset="1" stop-color="currentColor" stop-opacity="0" />
                    </linearGradient>
                  </defs>
                  <g class="plot-grid"><path d="M12 18H621 M12 63H621 M12 108H621 M12 153H621 M12 198H621" /></g>

                  <path
                    class="plot-area"
                    d="M12 190.8L105 160.2L201 174.6L294 112.95L387 132.3L477 75.6L570 51.3L621 31.95V198H12Z"
                  />
                  <path class="plot-invested" d="M12 198H621" />
                  <path
                    class="plot-value"
                    d="M12 190.8L105 160.2L201 174.6L294 112.95L387 132.3L477 75.6L570 51.3L621 31.95"
                  />
                  <path class="plot-point" d="M621 31.95h0" />
                </svg>
                <div class="plot-scale" aria-hidden="true">
                  <span>130k</span><span>125k</span><span>120k</span><span>115k</span><span>110k</span>
                </div>
              </div>
              <div class="plot-dates" aria-hidden="true">
                <span>Apr</span><span>Jul</span><span>Sep</span><span>Nov</span>
              </div>
            </div>
            <p class="chart-hidden" hidden>Chart hidden while figures are private.</p>
            <details class="chart-values">
              <summary>View the eight illustrative observations</summary>
              <div class="table-scroll" tabindex="0" role="region" aria-label="Illustrative chart values">
                <table>
                  <caption>
                    Design data only · not a production chart
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Observation</th>
                      <th scope="col">Fund value</th>
                      <th scope="col">Net invested</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">28 Apr 2026</th>
                      <td class="sensitive">110.800,00 €</td>
                      <td class="sensitive">110.000,00 €</td>
                    </tr>
                    <tr>
                      <th scope="row">29 May 2026</th>
                      <td class="sensitive">114.200,00 €</td>
                      <td class="sensitive">110.000,00 €</td>
                    </tr>
                    <tr>
                      <th scope="row">30 Jun 2026</th>
                      <td class="sensitive">112.600,00 €</td>
                      <td class="sensitive">110.000,00 €</td>
                    </tr>
                    <tr>
                      <th scope="row">31 Jul 2026</th>
                      <td class="sensitive">119.450,00 €</td>
                      <td class="sensitive">110.000,00 €</td>
                    </tr>
                    <tr>
                      <th scope="row">31 Aug 2026</th>
                      <td class="sensitive">117.300,00 €</td>
                      <td class="sensitive">110.000,00 €</td>
                    </tr>
                    <tr>
                      <th scope="row">30 Sep 2026</th>
                      <td class="sensitive">123.600,00 €</td>
                      <td class="sensitive">110.000,00 €</td>
                    </tr>
                    <tr>
                      <th scope="row">31 Oct 2026</th>
                      <td class="sensitive">126.300,00 €</td>
                      <td class="sensitive">110.000,00 €</td>
                    </tr>
                    <tr>
                      <th scope="row">17 Nov 2026</th>
                      <td class="sensitive">128.450,00 €</td>
                      <td class="sensitive">110.000,00 €</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        </div>

        <section class="changes panel" aria-labelledby="changes-title">
          <div class="changes-intro">
            <h2 id="changes-title">Changes</h2>
            <p class="caption">The context behind the total</p>
          </div>
          <dl class="change-metrics">
            <div>
              <dt>Month on month</dt>
              <dd class="gain sensitive">+2.150,00 € <small>+1,70%</small></dd>
              <dd class="caption">Since October’s statement</dd>
            </div>
            <div>
              <dt>Year to date</dt>
              <dd>-</dd>
              <dd class="caption">Needs a January statement</dd>
            </div>
            <div>
              <dt>Year on year</dt>
              <dd>-</dd>
              <dd class="caption">Needs November 2025</dd>
            </div>
          </dl>
        </section>

        <div class="holdings-grid">
          <section class="holdings panel" id="holdings" tabindex="-1" aria-labelledby="holdings-title">
            <div class="section-head">
              <div>
                <h2 id="holdings-title">Your holdings <span class="count">5</span></h2>
                <p class="caption">The funds that make up your portfolio</p>
              </div>
              <a class="text-link" href="#allocation">See allocation <span aria-hidden="true">↗</span></a>
            </div>
            <div class="holding-columns" aria-hidden="true">
              <span>FUND</span><span>VALUE / SHARE</span><span>TOTAL GAIN</span>
            </div>
            <ul class="holdings-list">
              <li>
                <div class="fund-name">
                  <span class="fund-monogram series-a">GE</span>
                  <div>
                    <h3>Global Equity</h3>
                    <span class="caption">Illustrative fund · Equity</span>
                  </div>
                </div>
                <div class="fund-value">
                  <strong class="sensitive">38.535,00 €</strong
                  ><span class="caption sensitive">30,00% of portfolio</span>
                </div>
                <div class="fund-gain">
                  <strong class="gain sensitive">+6.535,00 €</strong><span class="caption sensitive">+20,42%</span>
                </div>
              </li>
              <li>
                <div class="fund-name">
                  <span class="fund-monogram series-b">EB</span>
                  <div>
                    <h3>European Bonds</h3>
                    <span class="caption">Illustrative fund · Bonds</span>
                  </div>
                </div>
                <div class="fund-value">
                  <strong class="sensitive">32.112,50 €</strong
                  ><span class="caption sensitive">25,00% of portfolio</span>
                </div>
                <div class="fund-gain">
                  <strong class="gain sensitive">+2.112,50 €</strong><span class="caption sensitive">+7,04%</span>
                </div>
              </li>
              <li>
                <div class="fund-name">
                  <span class="fund-monogram series-c">MA</span>
                  <div>
                    <h3>Multi-asset</h3>
                    <span class="caption">Illustrative fund · Mixed</span>
                  </div>
                </div>
                <div class="fund-value">
                  <strong class="sensitive">25.690,00 €</strong
                  ><span class="caption sensitive">20,00% of portfolio</span>
                </div>
                <div class="fund-gain">
                  <strong class="gain sensitive">+3.690,00 €</strong><span class="caption sensitive">+16,77%</span>
                </div>
              </li>
              <li>
                <div class="fund-name">
                  <span class="fund-monogram series-d">EM</span>
                  <div>
                    <h3>Emerging Markets</h3>
                    <span class="caption">Illustrative fund · Equity</span>
                  </div>
                </div>
                <div class="fund-value">
                  <strong class="sensitive">19.267,50 €</strong
                  ><span class="caption sensitive">15,00% of portfolio</span>
                </div>
                <div class="fund-gain">
                  <strong class="gain sensitive">+4.267,50 €</strong><span class="caption sensitive">+28,45%</span>
                </div>
              </li>
              <li>
                <div class="fund-name">
                  <span class="fund-monogram series-e">SB</span>
                  <div>
                    <h3>Short-term Bonds</h3>
                    <span class="caption">Illustrative fund · Bonds</span>
                  </div>
                </div>
                <div class="fund-value">
                  <strong class="sensitive">12.845,00 €</strong
                  ><span class="caption sensitive">10,00% of portfolio</span>
                </div>
                <div class="fund-gain">
                  <strong class="gain sensitive">+1.845,00 €</strong><span class="caption sensitive">+16,77%</span>
                </div>
              </li>
            </ul>
            <div class="holdings-total">
              <span>Portfolio total</span><strong class="sensitive">128.450,00 €</strong
              ><strong class="gain sensitive">+18.450,00 €</strong>
            </div>
          </section>

          <section class="allocation panel" id="allocation" tabindex="-1" aria-labelledby="allocation-title">
            <div class="section-head">
              <div>
                <h2 id="allocation-title">Allocation</h2>
                <p class="caption">Share of total fund value</p>
              </div>
            </div>
            <div
              class="allocation-bar chart-sensitive"
              role="img"
              aria-label="Global Equity 30%, European Bonds 25%, Multi-asset 20%, Emerging Markets 15%, Short-term Bonds 10%"
            >
              <span class="series-a"></span><span class="series-b"></span><span class="series-c"></span
              ><span class="series-d"></span><span class="series-e"></span>
            </div>
            <ol class="allocation-list">
              <li>
                <span><i class="series-a"></i>Global Equity</span><strong class="sensitive">30%</strong>
              </li>
              <li>
                <span><i class="series-b"></i>European Bonds</span><strong class="sensitive">25%</strong>
              </li>
              <li>
                <span><i class="series-c"></i>Multi-asset</span><strong class="sensitive">20%</strong>
              </li>
              <li>
                <span><i class="series-d"></i>Emerging Markets</span><strong class="sensitive">15%</strong>
              </li>
              <li>
                <span><i class="series-e"></i>Short-term Bonds</span><strong class="sensitive">10%</strong>
              </li>
            </ol>
            <p class="allocation-foot">
              Five funds. One portfolio.<br /><span class="caption"
                >Weights describe value, not risk or future returns.</span
              >
            </p>
          </section>
        </div>

        <section class="comparisons panel" id="comparisons" tabindex="-1" aria-labelledby="comparison-title">
          <div class="section-head">
            <div>
              <p class="eyebrow">THE LONGER VIEW</p>
              <h2 id="comparison-title">Trends and comparisons</h2>
            </div>
            <span class="tag">Continues below in the app</span>
          </div>
          <p>
            Monthly change, fund comparisons and statement history remain visible after Holdings and Allocation. This
            study focuses on the opening Portfolio composition.
          </p>
        </section>
        <footer class="study-footer">
          <span
            ><strong>Portfolio / composition study 02</strong><br />Synthetic design data · illustrative chart · no
            Google connection</span
          ><a class="text-link" href="design-notes.html"
            >Read the design notes <span aria-hidden="true">↗</span></a
          >
        </footer>
      </main>
    </div>
    <nav class="mobile-nav" aria-label="Portfolio sections on mobile">
      <a href="#portfolio">Overview</a><a href="#holdings">Holdings</a><a href="#allocation">Allocation</a
      ><a href="#comparisons">Compare</a>
    </nav>
    <p class="sr-only" id="privacy-status" role="status"></p>
  </body>
</html>
`;
