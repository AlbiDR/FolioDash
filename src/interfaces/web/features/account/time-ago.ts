/** A plain-words age such as "just now" or "3 hours ago". Display only. */
export function describeAge(now: number, then: number): string {
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${String(minutes)} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${String(hours)} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${String(days)} days ago`;
}
