export interface AxisLabel {
  readonly key: string;
  readonly text: string;
  readonly x: number;
}

export interface PositionedAxisLabel extends AxisLabel {
  readonly visible: boolean;
}

/** Presentation only: reserve the latest label, then fit earlier labels without collisions. */
export function positionAxisLabels(
  labels: readonly AxisLabel[],
  widths: Readonly<Record<string, number>>,
  left: number,
  right: number,
  gap: number,
): readonly PositionedAxisLabel[] {
  const positioned = labels.map(label => {
    const width = widths[label.key] ?? label.text.length * gap;
    const fits = Number.isFinite(width) && width >= 0 && width <= right - left;
    const x = fits ? Math.max(left + width / 2, Math.min(right - width / 2, label.x)) : label.x;
    return { ...label, x, width, visible: false, fits };
  });
  const last = positioned[positioned.length - 1];
  if (last === undefined || !last.fits) return positioned;
  last.visible = true;
  const reservedLeft = last.x - last.width / 2 - gap;
  let previousRight = left - gap;
  for (const label of positioned.slice(0, -1)) {
    const start = label.x - label.width / 2;
    const end = label.x + label.width / 2;
    if (!label.fits || start < previousRight + gap || end > reservedLeft) continue;
    label.visible = true;
    previousRight = end;
  }
  return positioned;
}
