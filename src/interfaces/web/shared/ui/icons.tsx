import type { JSX } from "preact";

export type IconName = "overview" | "import" | "history" | "connection" | "chevron" | "back";

const PATHS: Readonly<Record<IconName, string>> = {
  overview: "M4 5v14h16M7 15l4-4 3 3 5-6",
  import: "M12 4v10m-4-4 4 4 4-4M5 19h14",
  history: "M4 12a8 8 0 1 0 16 0 8 8 0 1 0-16 0M12 8v4l3 2",
  connection: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  chevron: "M9 6l6 6-6 6",
  back: "M15 6l-6 6 6 6",
};

/** A small outline icon that takes its colour from the text. Decorative: the label beside it carries the meaning. */
export function Icon(props: { readonly name: IconName; readonly size?: number }): JSX.Element {
  const size = props.size ?? 24;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[props.name]} />
    </svg>
  );
}
