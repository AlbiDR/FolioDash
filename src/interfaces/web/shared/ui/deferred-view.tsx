import type { ComponentChildren, JSX } from "preact";
import { Suspense } from "preact/compat";
import { useErrorBoundary, useLayoutEffect, useState } from "preact/hooks";

/** On-demand screens retain a readable loading and recovery path, including offline failures. */
export function DeferredView(props: { readonly children: ComponentChildren }): JSX.Element {
  const failure: unknown = useErrorBoundary()[0];
  if (failure !== undefined && failure !== null) {
    return (
      <section class="review-problem" role="alert">
        <h2 class="card-title">This view could not load</h2>
        <p>Check your connection before reloading. Reloading discards unsaved entries.</p>
        <button
          class="primary"
          type="button"
          onClick={() => {
            window.location.reload();
          }}
        >
          Reload view
        </button>
      </section>
    );
  }
  return <Suspense fallback={<ViewLoading />}>{props.children}</Suspense>;
}

function ViewLoading(): JSX.Element | null {
  const [visible, setVisible] = useState(false);
  useLayoutEffect(() => {
    // Short chunk loads should leave the shell steady, without flashing a status card.
    const timer = window.setTimeout(() => {
      setVisible(true);
    }, 300);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);
  if (!visible) return null;
  return (
    <section class="notice" data-busy="true" role="status">
      <p>Loading view…</p>
    </section>
  );
}
