// The workspace reports in Africa/Lagos, which is UTC+1 with no daylight saving,
// so local midnight maps to the previous day 23:00 UTC.
const WORKSPACE_OFFSET_HOURS = 1;

export const WORKSPACE_TIME_ZONE = "Africa/Lagos";

/**
 * Start of the current calendar week (Monday 00:00) in the workspace timezone,
 * expressed as a Date. The reports card is labelled "New this week", so counting
 * a rolling seven days would include last weekend and disagree with the label.
 */
export function startOfCurrentWeek(now: Date = new Date()): Date {
  // Work out the calendar date in the workspace timezone.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WORKSPACE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);

  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(value.year);
  const month = Number(value.month);
  const day = Number(value.day);

  // Shift that date onto UTC midnight so weekday maths is unambiguous.
  const utcMidnight = new Date(Date.UTC(year, month - 1, day));
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value.weekday);
  const daysSinceMonday = (weekdayIndex + 6) % 7;
  utcMidnight.setUTCDate(utcMidnight.getUTCDate() - daysSinceMonday);

  // Convert local Monday 00:00 back to a real instant.
  return new Date(utcMidnight.getTime() - WORKSPACE_OFFSET_HOURS * 60 * 60 * 1000);
}
