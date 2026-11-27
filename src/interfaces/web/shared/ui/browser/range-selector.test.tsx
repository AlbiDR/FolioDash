import { render } from "preact";
import { afterEach, expect, it, vi } from "vitest";
import { RangeSelector } from "../range-selector";

const host = document.createElement("div");
document.body.append(host);
afterEach(() => {
  render(null, host);
  host.replaceChildren();
});

const options = [
  { id: "a", label: "A" },
  { id: "b", label: "B" },
  { id: "c", label: "C" },
];

function press(init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  host.querySelector("button")?.dispatchEvent(event);
  return event;
}

it("moves with the arrow keys but leaves browser shortcuts such as Alt+Left alone", () => {
  const onChange = vi.fn();
  render(<RangeSelector label="Range" options={options} value="b" onChange={onChange} />, host);
  const plain = press({ key: "ArrowLeft" });
  expect(plain.defaultPrevented).toBe(true);
  expect(onChange).toHaveBeenCalledTimes(1);
  for (const modifier of ["altKey", "ctrlKey", "metaKey", "shiftKey"] as const) {
    const event = press({ key: "ArrowLeft", [modifier]: true });
    expect(event.defaultPrevented).toBe(false);
  }
  expect(onChange).toHaveBeenCalledTimes(1);
});
