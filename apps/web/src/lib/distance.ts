export type Point = { latitude: number; longitude: number };

const earthRadiusKm = 6371;

// Straight-line distance between two points on the earth, in kilometres.
export function distanceKm(from: Point, to: Point): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

// The nearest condos that have a location, closest first. Condos without a location are left out.
export function nearestCondos<T extends { latitude: number | null; longitude: number | null }>(
  condos: T[],
  from: Point,
  count: number,
): (T & { km: number })[] {
  return condos
    .flatMap((condo) =>
      condo.latitude === null || condo.longitude === null
        ? []
        : [{ ...condo, km: distanceKm(from, { latitude: condo.latitude, longitude: condo.longitude }) }],
    )
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}
