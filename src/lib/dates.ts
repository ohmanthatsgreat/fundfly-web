// Shared deadline parsing/formatting.
//
// grants.gov and other federal feeds use far-future sentinel dates
// (e.g. 01/01/2099) to mean "no fixed deadline / rolling". Treat any date
// more than 20 years out as a placeholder rather than a real deadline, so the
// UI shows "Rolling" instead of a bogus "Jan 1, 2099".
const PLACEHOLDER_MIN_YEAR = new Date().getFullYear() + 20;

/** Parse a deadline string. Returns null for missing, unparseable, or
 *  far-future placeholder dates. */
export function parseDeadline(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime()) || d.getFullYear() >= PLACEHOLDER_MIN_YEAR) return null;
  return d;
}

/** "Mar 5, 2026" — or "Rolling" for missing/placeholder deadlines. */
export function formatDeadline(value: string | null | undefined): string {
  const d = parseDeadline(value);
  if (!d) return "Rolling";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Whole days until the deadline (negative if past). Null when there is no
 *  real deadline. */
export function daysUntilDeadline(value: string | null | undefined): number | null {
  const d = parseDeadline(value);
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

/** True only for a real, non-placeholder deadline that has already passed. */
export function isDeadlinePast(value: string | null | undefined): boolean {
  const days = daysUntilDeadline(value);
  return days !== null && days < 0;
}
