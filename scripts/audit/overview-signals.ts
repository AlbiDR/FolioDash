// Runs the real Portfolio view over invented, long recorded data, never a live account.
import { runSyntheticJourney } from "../lib/synthetic-harness.ts";

const assertions = await runSyntheticJourney({
  name: "Portfolio signals",
  entry: "tests/fixtures/overview-browser.ts",
  directory: "dist/acceptance/overview-audit",
  port: Number(process.env["FOLIODASH_OVERVIEW_AUDIT_PORT"] ?? 4310),
  config: "config/vite.overview-audit.config.ts",
  readySelector: ".portfolio-dashboard",
  run: async ({ evaluate, waitFor, check }) => {
    const settle = async (): Promise<void> => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    };
    const notices =
      "[...document.querySelectorAll('.attention .notice')].map(n=>n.textContent.replace(/\\s+/g,' ').trim())";

    // Forty-seven days after the latest statement, the next one is due and the notice says so, with a way to add it.
    await check(
      `(()=>{const items=${notices};const link=document.querySelector('.attention .notice a');return items.length===1&&items[0].includes('47 days old')&&items[0].includes('Add the next one')&&link.getAttribute('href')==='#import'&&link.textContent==='Add statement'})()`,
      "a statement that is 47 days old asks for the next one",
    );

    // Exactly on the threshold it is not yet due.
    await evaluate("window.syntheticOverview.setToday('2027-07-20')");
    await settle();
    await check("!document.querySelector('.attention')", "a statement 35 days old asks for nothing yet");

    // An unconfirmed history change comes first, whatever the date, and points at Your data.
    await evaluate("window.syntheticOverview.setPending(true)");
    await settle();
    await check(
      `(()=>{const items=${notices};const link=document.querySelector('.attention .notice a');return items.length===1&&items[0].startsWith('A history change needs checking')&&link.getAttribute('href')==='#connection'})()`,
      "an unconfirmed history change is raised on its own",
    );
    await evaluate("window.syntheticOverview.setToday('2027-08-01')");
    await settle();
    await check(
      `(()=>{const items=${notices};return items.length===2&&items[0].startsWith('A history change needs checking')&&items[1].includes('47 days old')})()`,
      "an unconfirmed change is listed before the reminder",
    );
    await evaluate("window.syntheticOverview.setPending(false)");
    await settle();

    // Notices use the shared warning notice, so they are announced as status.
    await check(
      "[...document.querySelectorAll('.attention .notice')].every(n=>n.classList.contains('notice-warning')&&n.getAttribute('role')==='status')",
      "attention items use the shared warning notice",
    );

    // Three calendar years of recorded history show the monthly returns grid.
    await check(
      "(()=>{const rows=[...document.querySelectorAll('.returns-table tbody tr')];return rows.length===3&&rows.map(r=>r.querySelector('th').textContent).join(',')==='2025,2026,2027'&&rows.every(r=>r.querySelectorAll('td').length===12)})()",
      "three years of history make a three-row monthly returns grid",
    );
    await waitFor(
      async () =>
        (await evaluate(
          "document.querySelectorAll('.returns-cell[data-tone=gain]').length>0 && document.querySelectorAll('.returns-cell[data-tone=loss]').length>0",
        )) === true,
      "gain and loss cells",
    );
    await check(
      "[...document.querySelectorAll('.returns-cell')].every(cell=>cell.textContent.trim()==='-'||/^[+-]?\\d+,\\d\\d %$/.test(cell.textContent.trim()))",
      "every filled cell writes its signed percentage, so the tint is never the only cue",
    );
  },
}).then((count) => count);
console.log(`Synthetic rendered Portfolio signals passed: ${String(assertions)} assertions.`);
