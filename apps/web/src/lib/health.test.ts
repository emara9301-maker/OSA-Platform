import { describe, expect, it } from "vitest";
import { checkDatabase } from "./health";

describe("checkDatabase", () => {
  it("reads the current time from the local database", async () => {
    const time = await checkDatabase();

    expect(time).toBeInstanceOf(Date);
    expect(Math.abs(Date.now() - time.getTime())).toBeLessThan(60_000);
  });
});
