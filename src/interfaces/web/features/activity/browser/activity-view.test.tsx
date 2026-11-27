import { render } from "preact";
import { afterEach, expect, it, vi } from "vitest";
import { parseExpenseAmounts, type ExpenseDay } from "../../../../../core/expenses/work-expenses";
import { parseIsoDate } from "../../../../../core/values/iso-date";
import "../../../shared/tokens.css";
import { ActivityView } from "../activity-view";

const host = document.createElement("div");
document.body.append(host);
afterEach(() => {
  render(null, host);
  host.replaceChildren();
});

function day(text: string): ExpenseDay {
  const date = parseIsoDate(text);
  const amounts = parseExpenseAmounts([24000, 70000, 24000, null, null]);
  if (date === null || amounts === null) throw new Error("bad fixture");
  return { date, amounts, revision: `synthetic:${text}` };
}

it("stops filtering by a month that is no longer listed when the days change", async () => {
  render(<ActivityView days={[day("2026-10-12"), day("2026-11-09")]} demo />, host);
  const select = host.querySelector("select") as HTMLSelectElement;
  select.value = "2026-10";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await vi.waitFor(() => {
    expect(host.querySelectorAll(".activity-row")).toHaveLength(1);
  });
  render(<ActivityView days={[day("2026-11-09")]} demo={false} />, host);
  await vi.waitFor(() => {
    expect(host.querySelectorAll(".activity-row")).toHaveLength(1);
  });
  expect((host.querySelector("select") as HTMLSelectElement).value).toBe("");
});
