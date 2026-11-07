import { describe, expect, it, vi } from "vitest";
import { armGestureRenewal } from "./GestureRenewal";

function target() {
  const listeners = new Set<(event: Event) => void>();
  return {
    listeners,
    addEventListener: (_type: "click", listener: (event: Event) => void) => { listeners.add(listener); },
    removeEventListener: (_type: "click", listener: (event: Event) => void) => { listeners.delete(listener); },
    click: (isTrusted = true) => { for (const listener of [...listeners]) listener({ isTrusted } as Event); },
  };
}

describe("renewing Google access on the person's next click", () => {
  it("renews on a trusted click when renewal is needed, and only then", () => {
    const page = target();
    const renew = vi.fn();
    let needed = false;
    armGestureRenewal(page, { needed: () => needed, renew });
    page.click();
    expect(renew).not.toHaveBeenCalled();
    needed = true;
    page.click();
    expect(renew).toHaveBeenCalledOnce();
  });

  it("ignores a scripted click, which carries no gesture and would only be blocked", () => {
    const page = target();
    const renew = vi.fn();
    armGestureRenewal(page, { needed: () => true, renew });
    page.click(false);
    expect(renew).not.toHaveBeenCalled();
  });

  it("does not renew a second time when the first renewal already started", () => {
    const page = target();
    let needed = true;
    const renew = vi.fn(() => { needed = false; });
    armGestureRenewal(page, { needed: () => needed, renew });
    page.click();
    page.click();
    expect(renew).toHaveBeenCalledOnce();
  });

  it("renews at once when the page was opened from a gesture that is still active", () => {
    const page = target();
    const renew = vi.fn();
    armGestureRenewal(page, { needed: () => true, renew }, { isActive: true });
    expect(renew).toHaveBeenCalledOnce();
  });

  it("does not renew at once without an active gesture, and stops listening when disarmed", () => {
    const page = target();
    const renew = vi.fn();
    const disarm = armGestureRenewal(page, { needed: () => true, renew }, { isActive: false });
    expect(renew).not.toHaveBeenCalled();
    disarm();
    page.click();
    expect(renew).not.toHaveBeenCalled();
    expect(page.listeners.size).toBe(0);
  });
});
