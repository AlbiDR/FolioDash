import type { JSX } from "preact";

/**
 * In-page orientation for a long screen: each item scrolls to a section heading and moves focus there.
 * It never changes the route, so the address bar and bookmarks stay as they are.
 */
export function PageNav(props: { readonly items: readonly { readonly id: string; readonly label: string }[] }): JSX.Element {
  return (
    <nav class="page-nav" aria-label="On this page">
      <p class="page-nav-label" aria-hidden="true">Jump to</p>
      <ul>
        {props.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              class="page-nav-item"
              onClick={() => {
                const target = document.getElementById(item.id);
                if (target === null) return;
                target.scrollIntoView({ block: "start", behavior: "auto" });
                // A disclosure is opened and its summary focused, so the jump lands on readable content.
                if (target instanceof HTMLDetailsElement) {
                  target.open = true;
                  target.querySelector("summary")?.focus({ preventScroll: true });
                } else target.focus({ preventScroll: true });
              }}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
