import type { JSX } from "preact";

export type IconName = "overview" | "import" | "history" | "connection" | "chevron" | "back" | "eye" | "eye-off" | "sidebar";

const PATHS: Readonly<Record<IconName, string>> = {
  overview: "M4 5v14h16M7 15l4-4 3 3 5-6",
  import: "M12 4v10m-4-4 4 4 4-4M5 19h14",
  history: "M4 12a8 8 0 1 0 16 0 8 8 0 1 0-16 0M12 8v4l3 2",
  connection: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  chevron: "M9 6l6 6-6 6",
  back: "M15 6l-6 6 6 6",
  sidebar: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6M9 4v16",
  eye: "M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
  "eye-off": "M3 3l18 18M10.6 6a9.4 9.4 0 0 1 1.4-.1c6.4 0 10 6.1 10 6.1a17 17 0 0 1-3.2 3.9M6.5 7.2A16.6 16.6 0 0 0 2 12s3.6 6.5 10 6.5c1.5 0 2.8-.3 4-.8M9.9 9.9a3 3 0 0 0 4.2 4.2",
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
