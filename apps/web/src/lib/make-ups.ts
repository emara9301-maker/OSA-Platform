// Malaysia has no daylight saving, so a fixed offset keeps the wall-clock maths simple.
const kualaLumpurOffsetMs = 8 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;
const slotStepMinutes = 30;

export type PoolHours = { openMinutes: number; closeMinutes: number };
export type Busy = { start: Date; end: Date };

function toMinutes(hour: number, minute: number, meridiem: string | undefined): number {
  let h = hour;
  if (meridiem === "pm" && h < 12) {
    h += 12;
  }
  if (meridiem === "am" && h === 12) {
    h = 0;
  }
  return h * 60 + minute;
}

// Reads the free-text pool hours of a condo, such as "7am-10pm", "07:00-22:00" or "7-22".
// Returns null when the text does not give an opening and closing time, so no slots are suggested.
export function parsePoolHours(text: string | null): PoolHours | null {
  if (!text) {
    return null;
  }
  const times = [...text.toLowerCase().matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/g)];
  if (times.length < 2) {
    return null;
  }
  const [open, close] = times.map((m) => toMinutes(Number(m[1]), Number(m[2] ?? 0), m[3]));
  if (close <= open) {
    return null;
  }
  return { openMinutes: open, closeMinutes: close };
}

// Earliest free start times for a make-up with the same coach, inside pool hours and after the minimum notice.
export function suggestMakeUpSlots(input: {
  now: Date;
  minNoticeHours: number;
  durationMinutes: number;
  pool: PoolHours;
  busy: Busy[];
  count: number;
  searchDays: number;
}): Date[] {
  const earliest = input.now.getTime() + input.minNoticeHours * 60 * 60 * 1000;
  const local = new Date(input.now.getTime() + kualaLumpurOffsetMs);
  const firstDay = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const durationMs = input.durationMinutes * 60 * 1000;
  const slots: Date[] = [];

  for (let day = 0; day < input.searchDays && slots.length < input.count; day++) {
    const midnight = firstDay + day * dayMs - kualaLumpurOffsetMs;
    for (
      let minute = input.pool.openMinutes;
      minute + input.durationMinutes <= input.pool.closeMinutes && slots.length < input.count;
      minute += slotStepMinutes
    ) {
      const start = midnight + minute * 60 * 1000;
      const end = start + durationMs;
      if (start < earliest) {
        continue;
      }
      if (input.busy.some((b) => b.start.getTime() < end && b.end.getTime() > start)) {
        continue;
      }
      slots.push(new Date(start));
    }
  }
  return slots;
}
