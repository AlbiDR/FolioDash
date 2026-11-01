import type { JSX } from "preact";
import { OverviewView } from "../features/overview/OverviewView";
import { DEMO_VARIANTS, demoPortfolio, demoVariantFrom } from "./demoPortfolio";

export function App(): JSX.Element {
  const variant = demoVariantFrom(window.location.search);
  return (
    <>
      <header class="app-header">
        <h1>FolioDash</h1>
        <p class="notice" role="status">
          Demonstration with invented data. No real portfolio, bank file or Google account is connected.
        </p>
        <nav aria-label="Demonstration portfolios">
          <ul class="demo-nav">
            {DEMO_VARIANTS.map((entry) => (
              <li key={entry.id}>
                <a href={`?demo=${entry.id}`} aria-current={entry.id === variant ? "page" : undefined}>
                  {entry.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main>
        <OverviewView model={demoPortfolio(variant)} />
      </main>
    </>
  );
}
