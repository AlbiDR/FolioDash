import { render } from "preact";
import { afterEach, expect, it } from "vitest";
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

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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

  await wait(700);
  expect(host.querySelector(".presence")).toBeNull();
  expect(host.querySelector("#note")).toBeNull();
});

it("shifts the sibling below it while it leaves, so the layout never snaps", async () => {
  render(<Layer show />, host);
  await wait(500);
  const after = host.querySelector("#after") as HTMLElement;
  expect(after.getAnimations()).toHaveLength(0);

  render(<Layer show={false} />, host);
  await Promise.resolve();
  expect(after.getAnimations().length).toBeGreaterThan(0);

  await wait(700);
  expect(after.getAnimations()).toHaveLength(0);
});

it("lets a change of mind during the exit bring the content straight back", async () => {
  render(<Layer show />, host);
  await wait(500);
  render(<Layer show={false} />, host);
  await wait(60);
  render(<Layer show />, host);
  await wait(500);
  const wrapper = host.querySelector(".presence") as HTMLElement;
  expect(wrapper.getAttribute("data-present")).toBe("true");
  expect(wrapper.hasAttribute("inert")).toBe(false);
  expect(host.querySelector("#note")?.textContent).toBe("Saved");
});
