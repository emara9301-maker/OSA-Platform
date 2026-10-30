import { describe, expect, it } from "vitest";
import { nextClassStart, timeUntil } from "./class-time";

// Malaysia time as a UTC instant: 2026-11-02 is a Monday.
const malaysia = (day: number, hour: number, minute = 0) => Date.UTC(2026, 10, day, hour - 8, minute);

describe("class countdown", () => {
  it("a Monday 10:00 class, seen on Monday at 09:00, starts in one hour", () => {
    const now = malaysia(2, 9);
    const start = nextClassStart(1, "10:00", now);

    expect(start).toBe(malaysia(2, 10));
    expect(timeUntil(start, now)).toEqual({ days: 0, hours: 1 });
  });

  it("a class that already started today is counted for next week", () => {
    const now = malaysia(2, 11);

    expect(nextClassStart(1, "10:00", now)).toBe(malaysia(9, 10));
  });

  it("a Wednesday class, seen on Monday at 09:00, is two days and one hour away", () => {
    const now = malaysia(2, 9);
    const start = nextClassStart(3, "10:00", now);

    expect(timeUntil(start, now)).toEqual({ days: 2, hours: 1 });
  });

  it("a Sunday class, seen on Monday, is six days away", () => {
    const now = malaysia(2, 9);

    expect(timeUntil(nextClassStart(7, "09:00", now), now).days).toBe(6);
  });
});

describe("the next class", () => {
  it("the class that starts first is chosen, and classes already passed this week are skipped", async () => {
    const { soonestClass } = await import("./class-time");
    const now = malaysia(2, 9);
    const classes = [
      { name: "Wednesday", weekday: 3, start_time: "10:00" },
      { name: "Monday later", weekday: 1, start_time: "18:00" },
      { name: "Monday earlier", weekday: 1, start_time: "08:00" },
    ];

    expect(soonestClass(classes, now)?.name).toBe("Monday later");
    expect(soonestClass([], now)).toBeNull();
  });
});
