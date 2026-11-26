import assert from "node:assert/strict";
import type { LocalBrowser } from "../../lib/local-browser.ts";

/**
 * Opening a fund from a holding row is one view transition (docs/design/polished-by-default.md, phase 5): the row's
 * fund name becomes the fund page's title, while the sidebar and toolbar hold still and the old page leaves. Needs the
 * Portfolio at a desktop width with motion allowed, and a browser with view transitions.
 */
export async function assertFundContinuity(
  browser: Pick<LocalBrowser, "evaluate" | "waitFor">,
): Promise<{ readonly title: string; readonly groups: readonly string[] }> {
  const { evaluate, waitFor } = browser;
  if ((await evaluate("typeof document.startViewTransition === 'function'")) !== true) {
    return { title: "(no view transitions in this browser)", groups: [] };
  }
  const seen = (await evaluate(`new Promise((resolve) => {
    const link = document.querySelector('.desktop-holdings a[href^="#fund/"]');
    const name = link.textContent.trim();
    const pseudo = new Set();
    const deadline = performance.now() + 1500;
    link.click();
    const sample = () => {
      for (const animation of document.getAnimations()) {
        const element = animation.effect && animation.effect.pseudoElement;
        if (element) pseudo.add(element);
      }
      if (performance.now() > deadline) resolve({ name, pseudo: [...pseudo].sort() });
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  })`)) as { name: string; pseudo: string[] };
  assert.ok(seen.pseudo.includes("::view-transition-group(fund-title)"), "the row's fund name moves into the title");
  assert.ok(seen.pseudo.includes("::view-transition-old(root)"), "the Portfolio leaves as the outgoing page");
  for (const still of ["sidebar", "toolbar"]) {
    assert.ok(!seen.pseudo.includes(`::view-transition-group(${still})`), `the ${still} holds still`);
  }
  await waitFor(
    async () =>
      (await evaluate(`document.getElementById('page-title')?.textContent === ${JSON.stringify(seen.name)}`)) === true,
    "the fund page shows the fund's name as its title",
  );
  return { title: seen.name, groups: seen.pseudo };
}
