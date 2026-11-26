import { render } from "preact";
import { afterEach, expect, it, vi } from "vitest";
import "../../tokens.css";
import "../motion/layers.css";
import { Presence } from "../presence";

const host = document.createElement("div");
host.style.cssText = "display:grid;row-gap:16px";
document.body.append(host);
afterEach(() => {
  render(null, host);
  host.replaceChildren();
});

function Layer(props: { readonly show: boolean }) {
  return (
    <>
      <Presence show={props.show}>
        <p id="note">Saved</p>
      </Presence>
      <p id="after">After</p>
    </>
  );
}

it("mounts its content when shown and keeps it mounted through its exit, then removes it", async () => {
  render(<Layer show={false} />, host);
  expect(host.querySelector("#note")).toBeNull();

  render(<Layer show />, host);
  expect(host.querySelector("#note")?.textContent).toBe("Saved");

  render(<Layer show={false} />, host);
  const wrapper = host.querySelector(".presence") as HTMLElement;
  expect(wrapper).not.toBeNull();
  expect(wrapper.getAttribute("data-present")).toBe("false");
  expect(wrapper.hasAttribute("inert")).toBe(true);
  expect(host.querySelector("#note")?.textContent).toBe("Saved");

  await vi.waitFor(
    () => {
      expect(host.querySelector(".presence")).toBeNull();
    },
    { timeout: 5000 },
  );
  expect(host.querySelector("#note")).toBeNull();
});

it("shifts the sibling below it while it leaves, so the layout never snaps", async () => {
  render(<Layer show />, host);
  await vi.waitFor(
    () => {
      expect(host.querySelector(".presence")?.getAttribute("data-settled")).toBe("true");
    },
    { timeout: 5000 },
  );
  const after = host.querySelector("#after") as HTMLElement;
  expect(after.getAnimations()).toHaveLength(0);

  render(<Layer show={false} />, host);
  expect(after.getAnimations().length).toBeGreaterThan(0);

  await vi.waitFor(
    () => {
      expect(after.getAnimations()).toHaveLength(0);
    },
    { timeout: 5000 },
  );
});

it("lets a change of mind during the exit bring the content straight back", async () => {
  render(<Layer show />, host);
  await vi.waitFor(
    () => {
      expect(host.querySelector(".presence")?.getAttribute("data-settled")).toBe("true");
    },
    { timeout: 5000 },
  );
  render(<Layer show={false} />, host);
  render(<Layer show />, host);
  await vi.waitFor(
    () => {
      expect(host.querySelector(".presence")?.getAttribute("data-present")).toBe("true");
    },
    { timeout: 5000 },
  );
  const wrapper = host.querySelector(".presence") as HTMLElement;
  expect(wrapper.getAttribute("data-present")).toBe("true");
  expect(wrapper.hasAttribute("inert")).toBe(false);
  expect(host.querySelector("#note")?.textContent).toBe("Saved");
});
