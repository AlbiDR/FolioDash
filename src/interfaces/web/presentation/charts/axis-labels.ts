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
  const positioned = labels.map((label) => {
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

/** Of several neighbouring labels with the same text, only the last is kept, so an axis never repeats a month. */
export function dropRepeatedLabels<Label extends { readonly text: string }>(
  labels: readonly Label[],
): readonly Label[] {
  return labels.filter((label, index) => labels[index + 1]?.text !== label.text);
}

/**
 * Which value ticks print their label. A tick whose rounded label equals the one before it is left unlabelled (its
 * gridline stays), and the highest tick always prints, taking the place of an equal neighbour.
 */
export function printedTickLabels(labels: readonly string[]): readonly boolean[] {
  const printed = labels.map((label, index) => index === 0 || label !== labels[index - 1]);
  const last = labels.length - 1;
  if (last > 0 && !printed[last]) {
    printed[last] = true;
    // The neighbour it equalled gives way, unless that neighbour is the lowest tick, which always prints.
    if (last - 1 > 0) printed[last - 1] = false;
    else printed[last] = false;
  }
  return printed;
}
