import { describe, expect, it } from "vitest";
import { parsePoolHours, suggestMakeUpSlots } from "./make-ups";

describe("parsePoolHours", () => {
  it("reads am and pm hours", () => {
    expect(parsePoolHours("7am-10pm")).toEqual({ openMinutes: 420, closeMinutes: 1320 });
  });

  it("reads 24-hour times", () => {
    expect(parsePoolHours("07:00 - 22:30")).toEqual({ openMinutes: 420, closeMinutes: 1350 });
  });

  it("returns null when the hours cannot be read", () => {
    expect(parsePoolHours(null)).toBeNull();
    expect(parsePoolHours("daily")).toBeNull();
    expect(parsePoolHours("7-7")).toBeNull();
  });
});

describe("suggestMakeUpSlots", () => {
  const pool = { openMinutes: 420, closeMinutes: 1320 };
  // 27 Oct 2026, 10:00 in Malaysia.
  const now = new Date("2026-10-27T02:00:00Z");

  it("suggests the earliest free times after the minimum notice, inside pool hours", () => {
    // Now is 10:00 in Malaysia, so 6 hours' notice starts the search at 16:00.
    const slots = suggestMakeUpSlots({
      now,
      minNoticeHours: 6,
      durationMinutes: 45,
      pool,
      busy: [],
      count: 3,
      searchDays: 14,
      stepMinutes: 30,
    });
    expect(slots.map((s) => s.toISOString())).toEqual([
      "2026-10-27T08:00:00.000Z",
      "2026-10-27T08:30:00.000Z",
      "2026-10-27T09:00:00.000Z",
    ]);
  });

  it("skips times that overlap the coach's other lessons", () => {
    const slots = suggestMakeUpSlots({
      now,
      minNoticeHours: 6,
      durationMinutes: 45,
      pool,
      busy: [{ start: new Date("2026-10-27T08:00:00Z"), end: new Date("2026-10-27T08:45:00Z") }],
      count: 2,
      searchDays: 14,
      stepMinutes: 30,
    });
    expect(slots[0].toISOString()).toBe("2026-10-27T09:00:00.000Z");
  });

  it("never suggests a lesson that would end after the pool closes", () => {
    const slots = suggestMakeUpSlots({
      now: new Date("2026-10-27T12:00:00Z"),
      minNoticeHours: 0,
      durationMinutes: 60,
      pool: { openMinutes: 420, closeMinutes: 480 },
      busy: [],
      count: 5,
      searchDays: 2,
      stepMinutes: 30,
    });
    expect(slots.map((s) => s.toISOString())).toEqual(["2026-10-27T23:00:00.000Z"]);
  });
});
