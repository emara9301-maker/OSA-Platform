import { describe, expect, it } from "vitest";
import { distanceKm, nearestCondos } from "./distance";

describe("distance", () => {
  it("is zero for the same point", () => {
    expect(distanceKm({ latitude: 3.1, longitude: 101.7 }, { latitude: 3.1, longitude: 101.7 })).toBe(0);
  });

  it("one degree of latitude is about 111 km", () => {
    const km = distanceKm({ latitude: 3, longitude: 101 }, { latitude: 4, longitude: 101 });
    expect(km).toBeGreaterThan(110.5);
    expect(km).toBeLessThan(111.5);
  });

  it("returns the nearest condos first, five at most, and skips condos with no location", () => {
    const here = { latitude: 3.0, longitude: 101.0 };
    const condos = [
      { name: "far", latitude: 4.0, longitude: 101.0 },
      { name: "no location", latitude: null, longitude: null },
      { name: "near", latitude: 3.01, longitude: 101.0 },
      { name: "middle", latitude: 3.1, longitude: 101.0 },
      { name: "b", latitude: 3.2, longitude: 101.0 },
      { name: "c", latitude: 3.3, longitude: 101.0 },
      { name: "d", latitude: 3.4, longitude: 101.0 },
    ];

    const result = nearestCondos(condos, here, 5);

    expect(result.map((condo) => condo.name)).toEqual(["near", "middle", "b", "c", "d"]);
  });
});
