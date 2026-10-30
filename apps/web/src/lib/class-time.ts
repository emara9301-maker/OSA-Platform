const minute = 60 * 1000;
const hour = 60 * minute;
const day = 24 * hour;

// Malaysia is UTC+8 all year round.
const malaysiaOffset = 8 * hour;

// The next time a weekly class starts, after `now`. weekday: 1 = Monday ... 7 = Sunday. startTime: "HH:MM[:SS]".
export function nextClassStart(weekday: number, startTime: string, now: number): number {
  const local = new Date(now + malaysiaOffset);
  const todayWeekday = ((local.getUTCDay() + 6) % 7) + 1;
  const [hours, minutes] = startTime.split(":").map(Number);
  const daysAhead = (weekday - todayWeekday + 7) % 7;
  let start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + daysAhead, hours - 8, minutes);
  if (start <= now) {
    start += 7 * day;
  }
  return start;
}

// How far away a time is, in whole days and hours.
export function timeUntil(target: number, now: number): { days: number; hours: number } {
  const remaining = Math.max(0, target - now);
  return { days: Math.floor(remaining / day), hours: Math.floor((remaining % day) / hour) };
}

// The class that starts first after `now`, with its start time. Null when there are no classes.
export function soonestClass<T extends { weekday: number; start_time: string }>(
  classes: T[],
  now: number,
): (T & { start: number }) | null {
  let best: (T & { start: number }) | null = null;
  for (const item of classes) {
    const start = nextClassStart(item.weekday, item.start_time, now);
    if (best === null || start < best.start) {
      best = { ...item, start };
    }
  }
  return best;
}
