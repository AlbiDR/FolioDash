import type { Checkpoint } from "../../../../core/portfolio/checkpoints";
import { type IsoDate, toIsoDate } from "../../../../core/values/iso-date";
import { toEuroCents } from "../../../../core/values/money";
import type { OverviewModel } from "../../features/overview/model/overview-model";

function after(date: IsoDate, days: number): IsoDate | null {
  const base = new Date(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)) + days),
  );
  return toIsoDate(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
}

/**
 * One synthetic checkpoint in the middle of each demo year, so the sample chart and screen show what a
 * checkpoint looks like across the history. They hold no real amount and exist only in the signed-out demo.
 */
export function demoCheckpoints(model: OverviewModel): readonly Checkpoint[] {
  if (model.source !== "demo" || model.dates.length === 0) return [];
  const result: Checkpoint[] = [];
  const yearPositions = new Map<string, number[]>();
  model.dates.forEach((date, position) => {
    const year = date.slice(0, 4);
    const positions = yearPositions.get(year) ?? [];
    positions.push(position);
    yearPositions.set(year, positions);
  });
  for (const positions of yearPositions.values()) {
    const position = positions[Math.floor(positions.length / 2)];
    if (position === undefined) continue;
    const statement = model.dates[position];
    const total = model.totals[position]?.value;
    const date = statement === undefined ? null : after(statement, 10);
    const cents = total === undefined ? null : toEuroCents(Math.round(total * 1.01));
    if (date !== null && cents !== null)
      result.push({ id: `demo-checkpoint-${String(position)}`, date, cents, note: "Sample" });
  }
  return result;
}
