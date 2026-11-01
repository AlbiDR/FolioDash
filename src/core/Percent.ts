/**
 * Display only. A ratio such as 0.1111 becomes `11,11 %`, in Italian notation.
 * Null means the figure is unavailable and shows a dash; it is never zero.
 */
export function formatPercent(ratio: number | null, options: { readonly signed?: boolean } = {}): string {
  if (ratio === null || !Number.isFinite(ratio)) return "-";
  const hundredths = Math.round(Math.abs(ratio) * 10_000);
  const whole = String(Math.floor(hundredths / 100)).replace(/\B(?=(\d{3})+(?!\d))/gu, ".");
  const fraction = String(hundredths % 100).padStart(2, "0");
  const sign = hundredths === 0 ? "" : ratio < 0 ? "-" : options.signed === true ? "+" : "";
  return `${sign}${whole},${fraction} %`;
}
