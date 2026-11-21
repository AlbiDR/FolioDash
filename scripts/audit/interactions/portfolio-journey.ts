// Portfolio journey: sorting, orientation and the direct route to the months.
import { setTimeout as delay } from "node:timers/promises";
import type { JourneyContext } from "./browser-steps.ts";

export async function portfolioJourney({
  call,
  evaluate,
  evaluateWith,
  waitFor,
  check,
  visit,
  survey,
}: JourneyContext): Promise<void> {
  // Portfolio: inspect the complete range-to-chart journey, not only selector declarations.
  for (const width of [390, 1440]) {
    await visit("overview", width);
    for (const [route, down] of [
      ["#connection", true],
      ["#overview", false],
    ] as const) {
      const stretched = await evaluateWith(
        async (destination, movingDown, horizontal) => {
          const pill = document.querySelector<HTMLElement>(".nav-pill");
          const link = document.querySelector<HTMLAnchorElement>(`.nav-link[href="${destination}"]`);
          if (!pill || !link) return false;
          const edges = () => {
            const insets = (
              getComputedStyle(pill)
                .clipPath.split(" round ")[0]
                ?.match(/-?[\d.]+px/g) ?? []
            ).map(parseFloat);
            const box = pill.getBoundingClientRect();
            const top = insets[0] ?? NaN;
            const right = insets[1] ?? top;
            if (horizontal) return [box.left + (insets[3] ?? right), box.right - right] as const;
            return [box.top + top, box.bottom - (insets[2] ?? top)] as const;
          };
          const [top, bottom] = edges();
          link.click();
          let expanded = false;
          let movedDuringExit = false;
          const deadline = performance.now() + 2500;
          while (performance.now() < deadline) {
            await new Promise(requestAnimationFrame);
            const [nextTop, nextBottom] = edges();
            const lead = movingDown ? nextBottom - bottom : top - nextTop;
            const trail = movingDown ? nextTop - top : bottom - nextBottom;
            movedDuringExit ||= lead > 1 && document.querySelector("[data-page-exiting]") !== null;
            expanded ||= lead - trail > bottom - top;
            const box = link.getBoundingClientRect();
            if (
              Math.abs(nextTop - (horizontal ? box.left : box.top)) < 1 &&
              Math.abs(nextBottom - (horizontal ? box.right : box.bottom)) < 1
            ) {
              const icon = link.querySelector("svg")?.getBoundingClientRect();
              if (!icon) return false;
              // Make the pill participate in hit testing to detect a fill painted over the icon.
              pill.style.pointerEvents = "auto";
              const hit = document.elementFromPoint(icon.left + icon.width / 2, icon.top + icon.height / 2);
              pill.style.pointerEvents = "";
              return movedDuringExit && expanded && link.contains(hit) && link.getAttribute("aria-current") === "page";
            }
          }
          return false;
        },
        route,
        down,
        width === 390,
      );
      await check(
        String(stretched),
        `sidebar starts during page exit, stretches and settles moving ${down ? "down" : "up"}`,
      );
    }
  }
  await visit("overview");
  await survey("Portfolio / desktop / initial");
  // The wide Performance card spans the hero and Changes rows: its plot uses the spare height instead of leaving a void.
  await waitFor(
    async () =>
      (await evaluate(
        "(()=>{const card=document.querySelector('.portfolio-trend .chart');const last=card.lastElementChild.getBoundingClientRect();return card.getBoundingClientRect().bottom-last.bottom<=40&&document.querySelector('.portfolio-trend .chart-svg').getBoundingClientRect().height>300})()",
      )) === true,
    "wide Performance plot filling its card",
  );
  await check(
    "(()=>{const svg=document.querySelector('.portfolio-trend .chart-svg');const box=svg.getBoundingClientRect();return box.height<=box.width*0.8+1&&box.height<=561})()",
    "filled Performance plot stays a wide, bounded shape",
  );
  // Inspect both ends of the plot and then move the same selection with the keyboard.
  for (const endpoint of ["first-of-type", "last-of-type"]) {
    const point = (await evaluateWith((end) => {
      const svg = document.querySelector<SVGSVGElement>(".portfolio-trend .chart-plot svg");
      if (!svg) throw new Error("Performance plot missing");
      svg.scrollIntoView({ block: "center", behavior: "instant" });
      const bounds = svg.getBoundingClientRect();
      const mark = svg.querySelector<SVGCircleElement>(`.chart-series:first-child circle:${end}`);
      if (!mark) throw new Error("Performance observation missing");
      return {
        x: bounds.left + (mark.cx.baseVal.value * bounds.width) / svg.viewBox.baseVal.width,
        y: bounds.top + bounds.height / 2,
      };
    }, endpoint)) as { x: number; y: number };
    await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
    await check(
      `(() => {
      const plot=document.querySelector('.portfolio-trend .chart-plot');
      const tooltip=plot.querySelector('.chart-inspection-tooltip');
      if (!tooltip) return false;
      const guide=plot.querySelector('.chart-guide').x1.baseVal.value;
      const marks=[...plot.querySelectorAll('.chart-series circle.is-active')];
      const dots=[...plot.querySelectorAll('.chart-inspection-dot')];
      const bounds=plot.getBoundingClientRect(), tip=tooltip.getBoundingClientRect();
      const exact=marks.map(mark=>Number(mark.dataset.value).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})+' €');
      const readout=plot.previousElementSibling;
      return dots.length===2 && marks.length===2 &&
        dots.every((dot,i)=>dot.cx.baseVal.value===guide && dot.cy.baseVal.value===marks[i].cy.baseVal.value) &&
        plot.querySelectorAll('.chart-inspection-halo').length===2 &&
        exact.every(value=>tooltip.textContent.includes(value)&&readout.textContent.includes(value)) &&
        !readout.querySelector('[data-counting]') &&
        tooltip.querySelector('.chart-inspection-date').textContent===readout.querySelector('.chart-readout-date').textContent &&
        tip.left>=bounds.left-1 && tip.right<=bounds.right+1;
    })()`,
      `Performance hover aligns the exact values, guide and halos at the ${endpoint} endpoint`,
    );
  }
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
  await check("!document.querySelector('.chart-inspection-tooltip')", "leaving Performance clears hover inspection");
  await evaluate("document.querySelector('.portfolio-trend input[type=range]').focus({preventScroll:true})");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Home", code: "Home" });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Home", code: "Home" });
  await check(
    "(()=>{const tip=document.querySelector('.chart-inspection-tooltip');const slider=document.activeElement;return !!tip&&slider.value==='0'&&[...tip.querySelectorAll('strong')].every(value=>slider.getAttribute('aria-valuetext').includes(value.textContent))})()",
    "keyboard scrubbing shares exact Performance values with the tooltip",
  );
  await evaluate("document.querySelector('.privacy-toggle').click()");
  await check(
    "(()=>{const tip=document.querySelector('.chart-inspection-tooltip');return !!tip&&[...tip.querySelectorAll('strong')].every(value=>!/[0-9]/.test(value.textContent))})()",
    "privacy immediately masks tooltip amounts",
  );
  await evaluate("document.querySelector('.privacy-toggle').click()");
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  await check("!document.querySelector('.chart-inspection-tooltip')", "Escape dismisses Performance inspection");
  // The headline carries the change since last month beside the total.
  await check(
    "!!document.querySelector('.hero .hero-delta .pill') && document.querySelector('.hero .hero-delta').getBoundingClientRect().top>document.querySelector('.hero .hero-value').getBoundingClientRect().top",
    "the hero shows the month's change beside the total",
  );
  // Each held fund shows its weight as a bar that matches its percentage, and a trend line under its value; the rail names what moved most.
  await check(
    "(()=>{const rows=[...document.querySelectorAll('.desktop-holdings .holdings-table tbody tr:not(.closed):not(.holdings-group)')];const pcts=rows.map(row=>parseFloat(row.children[2].textContent.replace(/\\./g,'').replace(',','.')));const top=Math.max(...pcts);return rows.length>0&&rows.every((row,i)=>{const bar=row.querySelector('.share-bar > span');return !!bar&&Math.abs(parseFloat(bar.style.inlineSize)-pcts[i]/top*100)<0.2&&row.querySelector('.share-bar').getAttribute('aria-hidden')==='true'})&&Math.abs(parseFloat(rows[pcts.indexOf(top)].querySelector('.share-bar > span').style.inlineSize)-100)<0.01})()",
    "each held fund's weight bar compares its share with the largest holding",
  );
  await check(
    "(()=>{const lines=[...document.querySelectorAll('.desktop-holdings .holdings-table td .sparkline')];return lines.length>0&&lines.every(line=>line.getAttribute('aria-hidden')==='true'&&!!line.querySelector('.spark-line'))})()",
    "held funds show a decorative trend line under their value",
  );
  await check(
    "(()=>{const card=document.querySelector('.movers-card');const links=[...card.querySelectorAll('a.mover')];const size=a=>Math.abs(parseFloat(a.querySelector('.mover-figures').firstElementChild.textContent.replace(/[^0-9,]/g,'').replace(',','.')));return links.length>=1&&links.length<=3&&links.every(a=>a.getAttribute('href').startsWith('#fund/'))&&links.every((a,i)=>i===0||size(links[i-1])>=size(a))&&!!card.closest('.portfolio-rail')?.querySelector('.allocation-card')})()",
    "the rail names up to three funds by size of change, each linking to its fund, beside allocation",
  );
  // The total row repeats the portfolio's own figures and agrees with the rows it sums.
  await check(
    "(()=>{const n=text=>parseFloat(text.replace(/[^0-9,\\-]/g,'').replace(',','.'));const body=[...document.querySelectorAll('.desktop-holdings .holdings-table tbody tr:not(.holdings-group)')];const total=document.querySelector('.desktop-holdings .holdings-table tfoot tr.holdings-total');const sum=index=>body.reduce((acc,row)=>acc+(Number.isNaN(n(row.children[index].textContent))?0:n(row.children[index].textContent)),0);return !!total&&total.children[1].textContent===document.querySelector('.hero .hero-value').textContent&&Math.abs(n(total.children[1].textContent)-sum(1))<0.02&&Math.abs(n(total.children[4].textContent)-sum(4))<0.02&&Math.abs(n(total.children[5].textContent)-sum(5))<0.02})()",
    "the holdings total row matches the headline and the sum of its rows",
  );
  await check(
    "document.querySelector('#holdings-held-rows .holdings-group-count')?.textContent.trim()==='7' && document.querySelector('#holdings-closed-rows .holdings-group-count')?.textContent.trim()==='1'",
    "the default showcase groups seven held funds and one closed fund",
  );
  // The holdings table fits its card: every column keeps its full figure and nothing is clipped at the card edge.
  await check(
    "(()=>{const region=document.querySelector('.desktop-holdings');return getComputedStyle(region).display!=='none'&&region.scrollWidth<=region.clientWidth+1&&[...region.querySelectorAll('td, th')].every(cell=>cell.scrollWidth<=cell.clientWidth+1)})()",
    "no holdings figure is clipped by its column or the card edge",
  );
  // Holdings sort: a header sorts, repeating reverses, a third choice restores the saved order, and the order is announced.
  await evaluate(
    "window.auditHoldingNames=()=>[...document.querySelectorAll('.desktop-holdings .holdings-table tbody th a')].map(a=>a.textContent)",
  );
  await evaluate("window.auditDefaultOrder=window.auditHoldingNames().join('|')");
  await evaluate("[...document.querySelectorAll('.sort-button')].find(button=>button.textContent==='Gain %').click()");
  await delay(300);
  await check(
    "(()=>{const th=[...document.querySelectorAll('.desktop-holdings .holdings-table thead th')].find(n=>n.textContent.trim()==='Gain %');const held=[...document.querySelectorAll('.desktop-holdings .holdings-table tbody tr:not(.closed):not(.holdings-group)')].map(row=>parseFloat(row.children[3].textContent.replace('+','').replace('.','').replace(',','.')));const last=[...document.querySelectorAll('.desktop-holdings .holdings-table tbody tr:not(.holdings-group)')].at(-1);return th.getAttribute('aria-sort')==='descending'&&held.length>1&&held.every((value,index)=>index===0||held[index-1]>=value)&&last.classList.contains('closed')&&[...document.querySelectorAll('[role=status]')].some(n=>n.textContent.includes('sorted by Gain %, highest first'))})()",
    "a column sorts holdings high to low, keeps sold funds last and announces it",
  );
  await evaluate("[...document.querySelectorAll('.sort-button')].find(button=>button.textContent==='Gain %').click()");
  await delay(300);
  await check(
    "[...document.querySelectorAll('.desktop-holdings .holdings-table thead th')].find(n=>n.textContent.trim()==='Gain %').getAttribute('aria-sort')==='ascending'",
    "choosing the column again reverses it",
  );
  await evaluate("[...document.querySelectorAll('.sort-button')].find(button=>button.textContent==='Gain %').click()");
  await delay(300);
  await check(
    "window.auditHoldingNames().join('|')===window.auditDefaultOrder && [...document.querySelectorAll('.desktop-holdings .holdings-table thead th')].every(n=>n.getAttribute('aria-sort')==='none')",
    "a third choice restores the saved order",
  );
  // Journey order: summary and performance, then the fund list, then analysis. Analysis cards end with their content.
  await check(
    "(()=>{const holdings=document.querySelector('.portfolio-holdings');const analysis=document.querySelector('.dashboard-analysis');return !!holdings&&!!analysis&&holdings.getBoundingClientRect().top<analysis.getBoundingClientRect().top&&!!(holdings.compareDocumentPosition(analysis)&Node.DOCUMENT_POSITION_FOLLOWING)})()",
    "holdings come before trends and comparisons",
  );
  await check(
    "[...document.querySelectorAll('.analysis-grid > .card')].every(card=>{const style=getComputedStyle(card);const room=card.getBoundingClientRect().bottom-card.lastElementChild.getBoundingClientRect().bottom;return room<=parseFloat(style.paddingBottom)+16})",
    "analysis cards end with their content instead of stretching into empty space",
  );
  await evaluate(
    "[...document.querySelectorAll('.portfolio-explore .page-nav button')].find(button=>button.textContent==='Holdings').click()",
  );
  await check(
    "document.activeElement?.id==='holdings-heading' && location.hash==='#overview'",
    "portfolio orientation moves focus to holdings without changing route",
  );
  await evaluate(
    "[...document.querySelectorAll('.portfolio-explore .page-nav button')].find(button=>button.textContent==='Trends and comparisons').click()",
  );
  await check(
    "document.activeElement?.id==='portfolio-analysis' && !!document.querySelector('.dashboard-analysis .analysis-grid') && !document.querySelector('#portfolio-analysis')?.closest('details:not([open])')",
    "portfolio orientation focuses visible trends",
  );
  await evaluate("document.querySelector('.portfolio-history-link').click()");
  await waitFor(
    async () =>
      (await evaluate("location.hash==='#months' && !!document.querySelector('.mobile-months select')")) === true,
    "direct month-by-month navigation",
  );
  await check(
    "getComputedStyle(document.querySelector('.mobile-months')).display!=='none'",
    "statement selector is visible on desktop",
  );
  await check(
    "(()=>{const sections=[...document.querySelector('.months').children];return sections.findIndex(n=>n.classList.contains('month-matrices'))<sections.findIndex(n=>n.classList.contains('mobile-months')) && !!document.querySelector('.month-matrices .totals') && !document.querySelector('.month-matrices')?.closest('details:not([open])')})()",
    "month comparison is visible before the statement inspector",
  );
  await visit("overview", 1440, "different");
  await check(
    "document.querySelectorAll('.desktop-holdings .holdings-group').length===0 && document.querySelectorAll('.desktop-holdings tbody th a').length===4",
    "a short list stays one table without group headers",
  );
}
