/** CSS optimizers may serialize the same token as 180ms or .18s; browser timers use milliseconds. */
export function motionMilliseconds(value: string): number {
  const time = value.trim();
  const amount = Number.parseFloat(time);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  if (time.endsWith("ms")) return amount;
  if (time.endsWith("s")) return amount * 1000;
  return 0;
}
