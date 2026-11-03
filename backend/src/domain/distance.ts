/** Straight-line (great-circle) distance in km between two points (plan A4). */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Stores sorted nearest first (ties broken by code, so the order is always the same). */
export function sortByDistance<T extends { lat: number; lng: number; code: string }>(
  point: { lat: number; lng: number },
  stores: T[],
): (T & { distanceKm: number })[] {
  return stores
    .map((store) => ({ ...store, distanceKm: haversineKm(point, store) }))
    .sort((x, y) => x.distanceKm - y.distanceKm || x.code.localeCompare(y.code));
}
