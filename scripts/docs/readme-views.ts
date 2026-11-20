// The one list of README screenshots. Capture, Pages assembly and the README check all read it.
// Adding a route to the app fails the type check until it has an entry here, so a new screen is
// either captured automatically on the next release or skipped with a written reason.
import type { Route } from "../../src/interfaces/web/app/routes.ts";

export type RouteName = Route["name"];

export interface CapturedView {
  /** Address fragment the demo opens on. */
  readonly hash: string;
  /** Exact page heading once the view is ready; `null` waits for the first fund page instead. */
  readonly heading: string | null;
  /** Clicked after opening `hash`, for screens reached through a link rather than their own address. */
  readonly open?: string;
  /** File name without theme or extension. */
  readonly file: string;
  /** Every image is drawn without the page background, the sidebar and the top bar. `include` names the elements the picture shows (the
   * banner and the page content when absent): the crop follows what is painted inside them and everything else is made invisible.
   * `hide` removes what sits below them from the layout; `style` is extra CSS for a view whose parts differ in width. A new view
   * needs none of these unless the release rejects its framing. */
  readonly crop?: { readonly include?: string; readonly hide?: string; readonly style?: string };
  /** Phone-sized dark capture, written to this file name. */
  readonly mobile?: string;
  /** Placed by the generated README gallery. The overview and expenses are placed by hand in the README. */
  readonly gallery?: { readonly title: string; readonly caption: string; readonly alt: string };
}

export type ViewEntry = CapturedView | { readonly skip: string };

/** Keyed by every route name, so TypeScript rejects a route without an entry. */
export const VIEWS: Readonly<Record<RouteName, ViewEntry>> = {
  overview: {
    hash: "#overview",
    heading: "Portfolio",
    file: "hero",
    mobile: "portfolio-mobile.png",
    crop: {
      include:
        ".get-started,.hero,.portfolio-trend,.portfolio-holdings,.allocation-card,.movers-card,.period-results,.portfolio-explore",
      hide: ".dashboard-analysis",
    },
  },
  expenses: {
    hash: "#expenses",
    heading: "Work expenses",
    file: "expenses",
    crop: {
      include: ".get-started,.expense-entry,.expense-week",
      hide: ".page-nav,.expense-year-section,.expense-record",
    },
  },
  months: {
    hash: "#months",
    heading: "Month by month",
    file: "months",
    crop: { include: ".notice,.month-matrices", hide: ".mobile-months" },
    gallery: {
      title: "Month by month",
      caption: "Every statement laid side by side, so you can see how each month moved.",
      alt: "The month-by-month tables for the invented portfolio, one column per statement",
    },
  },
  checkpoints: {
    hash: "#checkpoints",
    heading: "Checkpoints",
    file: "checkpoints",
    // The cards span the page but their form and figures are narrow; a form-width column keeps the picture balanced.
    crop: { include: ".notice,.checkpoints .card", style: ".checkpoints .card{max-inline-size:52rem}" },
    gallery: {
      title: "Checkpoints",
      caption: "Record a value between statements and see it on the Performance chart.",
      alt: "The checkpoints screen listing value-only records between statements, with invented amounts",
    },
  },
  fund: {
    hash: "#overview",
    heading: null,
    open: 'a[href^="#fund/"]',
    file: "fund",
    gallery: {
      title: "One fund in detail",
      caption: "Weight, trend and history for a single holding.",
      alt: "A fund detail page with its value history and invented holdings",
    },
  },
  import: {
    hash: "#import",
    heading: "Update your portfolio",
    file: "import",
    // The notice spans the page but the form below it is 52rem wide; matching them keeps the picture balanced.
    crop: { include: ".notice,.import", style: ".notice{max-inline-size:52rem}" },
    gallery: {
      title: "Review before you save",
      caption: "Check dates, holdings and cash movements before anything is stored.",
      alt: "The import screen where a statement is chosen and reviewed before saving",
    },
  },
  connection: {
    hash: "#connection",
    heading: "Your data",
    file: "connection",
    gallery: {
      title: "Your data, your spreadsheet",
      caption: "Where your records live and how to reconnect or leave.",
      alt: "The Your data screen explaining where records are kept, shown signed out",
    },
  },
  activity: {
    skip: "A read-only list of recorded expense days, not yet in the README gallery; the rendered audits check it.",
  },
  history: { skip: "Reached from Import and shown by the same signed-out card, so Import already represents it." },
};

export const CAPTURED: readonly (readonly [RouteName, CapturedView])[] = (
  Object.entries(VIEWS) as [RouteName, ViewEntry][]
).flatMap(([name, entry]) => ("skip" in entry ? [] : [[name, entry] as const]));

/** Every PNG the release must contain: light and dark per view, plus the phone shots. */
export const README_IMAGES: readonly string[] = CAPTURED.flatMap(([, view]) => [
  `${view.file}-light.png`,
  `${view.file}-dark.png`,
  ...(view.mobile === undefined ? [] : [view.mobile]),
]);

export const MOBILE_IMAGES: ReadonlySet<string> = new Set(
  CAPTURED.flatMap(([, view]) => (view.mobile === undefined ? [] : [view.mobile])),
);

const BASE = "https://albidr.github.io/FolioDash/readme";
const START = "<!-- readme-gallery:start (generated by npm run docs:readme; edit scripts/docs/readme-views.ts) -->";
const END = "<!-- readme-gallery:end -->";

function cell(view: CapturedView & { gallery: NonNullable<CapturedView["gallery"]> }): string {
  return [
    '    <td width="50%" align="center" valign="top">',
    "      <picture>",
    `        <source media="(prefers-color-scheme: dark)" srcset="${BASE}/${view.file}-dark.png">`,
    `        <img src="${BASE}/${view.file}-light.png" width="520" alt="${view.gallery.alt}">`,
    "      </picture>",
    "      <br>",
    `      <sub><b>${view.gallery.title}</b><br>${view.gallery.caption}</sub>`,
    "    </td>",
  ].join("\n");
}

/** The README block between the markers, derived from the manifest. */
export function renderGallery(): string {
  const cells = CAPTURED.flatMap(([, view]) =>
    view.gallery === undefined ? [] : [cell({ ...view, gallery: view.gallery })],
  );
  const rows: string[] = [];
  for (let index = 0; index < cells.length; index += 2)
    rows.push(`  <tr>\n${cells.slice(index, index + 2).join("\n")}\n  </tr>`);
  return `${START}\n<table>\n${rows.join("\n")}\n</table>\n${END}`;
}

/** Replaces the generated block, or reports that the README has no markers. */
export function withGallery(readme: string): string | null {
  const start = readme.indexOf("<!-- readme-gallery:start");
  const end = readme.indexOf(END);
  if (start < 0 || end < start) return null;
  return `${readme.slice(0, start)}${renderGallery()}${readme.slice(end + END.length)}`;
}
