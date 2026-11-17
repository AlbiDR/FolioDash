import type { Checkpoint } from "../../../core/Checkpoints";
import { type IsoDate, toIsoDate } from "../../../core/IsoDate";
import { toEuroCents } from "../../../core/Money";
import type { OverviewModel } from "../features/overview/OverviewModel";

function after(date: IsoDate, days: number): IsoDate | null {
  const base = new Date(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)) + days),
  );
  return toIsoDate(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
}

/**
 * Two invented checkpoints between the demo's last statements, so the sample chart and screen show what a
 * checkpoint looks like. They hold no real amount and exist only in the signed-out demo.
 */
export function demoCheckpoints(model: OverviewModel): readonly Checkpoint[] {
  if (model.source !== "demo" || model.dates.length < 2) return [];
  const result: Checkpoint[] = [];
  for (const [offset, position, days] of [
    [1.012, model.dates.length - 2, 10],
    [1.01, model.dates.length - 1, 9],
  ] as const) {
    const statement = model.dates[position];
    const total = model.totals[position]?.value;
    const date = statement === undefined ? null : after(statement, days);
    const cents = total === undefined ? null : toEuroCents(Math.round(total * offset));
    if (date !== null && cents !== null)
      result.push({ id: `demo-checkpoint-${String(position)}`, date, cents, note: "Sample" });
  }
  return result;
}
