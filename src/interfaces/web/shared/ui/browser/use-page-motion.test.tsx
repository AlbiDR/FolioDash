import { afterEach, beforeEach, expect, it, vi } from "vitest";
import "../../tokens.css";
import { createPageMotion } from "../use-page-motion";

let page: HTMLElement;
beforeEach(() => {
  page = document.createElement("main");
  document.body.append(page);
});
afterEach(() => {
  page.remove();
});

it("changes pages inside a real view transition and commits only the latest destination", async () => {
  expect(typeof document.startViewTransition).toBe("function");
  const motion = createPageMotion({ current: page });
  const first = vi.fn();
  const last = vi.fn(() => {
    // The entry mark is set before the new page mounts, so its arrival can read it.
    expect(page.getAttribute("data-arrival")).toBe("entered");
  });
  motion.change(first);
  motion.change(last);
  await vi.waitFor(() => {
    expect(last).toHaveBeenCalledOnce();
  });
  expect(first).not.toHaveBeenCalled();
  expect(page.inert).toBe(false);
  expect(page.hasAttribute("data-page-exiting")).toBe(false);
});

it("a forced finish commits at once and skips the transition without an unhandled rejection", async () => {
  const rejections: unknown[] = [];
  const record = (event: PromiseRejectionEvent) => rejections.push(event.reason);
  window.addEventListener("unhandledrejection", record);
  const motion = createPageMotion({ current: page });
  const commit = vi.fn();
  motion.change(commit);
  motion.finish();
  expect(commit).toHaveBeenCalledOnce();
  await new Promise((resolve) => setTimeout(resolve, 200));
  window.removeEventListener("unhandledrejection", record);
  expect(commit).toHaveBeenCalledOnce();
  expect(rejections).toEqual([]);
});
