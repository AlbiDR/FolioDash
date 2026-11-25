import assert from "node:assert/strict";
import type { LocalBrowser } from "../lib/local-browser.ts";

/**
 * The sidebar collapse is one movement: the grid track, the navigation's slide and its fade all transition, both ways,
 * and the sidebar settles at its exact track. A later stylesheet once replaced these transition lists with colour-only
 * ones, so the collapse snapped (docs/design/polished-by-default.md, phase 0). Needs a wide viewport and motion allowed.
 */
export async function assertSidebarCollapse(
  browser: Pick<LocalBrowser, "evaluate" | "waitFor">,
): Promise<{ readonly openTrack: number }> {
  const { evaluate, waitFor } = browser;
  const toggle = `(() => {
    const shell=document.querySelector('.shell'), nav=document.querySelector('.main-nav');
    const seen=new Set();
    shell.addEventListener('transitionrun', e => { if (e.target===shell||e.target===nav) seen.add(e.propertyName); });
    window.sidebarSeen=seen;
    document.querySelector('.sidebar-toggle').click();
  })()`;
  const transitioned = "[...window.sidebarSeen].sort().join()";
  const track = "parseFloat(getComputedStyle(document.querySelector('.shell')).gridTemplateColumns)";
  const settled =
    "document.querySelector('.shell').getAnimations().length===0 && document.querySelector('.main-nav').getAnimations().length===0";
  const expected = "grid-template-columns,opacity,transform";

  const openTrack = (await evaluate(track)) as number;
  assert.ok(openTrack > 0, "the sidebar starts open on a wide viewport");
  await evaluate(toggle);
  await waitFor(
    async () => (await evaluate(transitioned)) === expected,
    "sidebar collapse transitions track, slide and fade",
  );
  await waitFor(async () => (await evaluate(settled)) === true, "sidebar collapse settles");
  assert.equal(
    await evaluate(`document.querySelector('.shell').dataset.nav==='collapsed' && ${track}===0`),
    true,
    "collapsed sidebar releases its track",
  );
  await evaluate(toggle);
  await waitFor(
    async () => (await evaluate(transitioned)) === expected,
    "sidebar reopening transitions track, slide and fade",
  );
  await waitFor(async () => (await evaluate(settled)) === true, "sidebar reopening settles");
  assert.equal(await evaluate(track), openTrack, "reopened sidebar restores its exact track");
  return { openTrack };
}
