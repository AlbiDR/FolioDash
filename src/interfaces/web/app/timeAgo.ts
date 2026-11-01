/** A plain-words age such as "just now" or "3 hours ago". Display only. */
export function describeAge(now: number, then: number): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${String(minutes)} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${String(hours)} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${String(days)} days ago`;
}
