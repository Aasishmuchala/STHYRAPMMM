// Geolocation helpers for the attendance tracker. Pure functions so the
// distance / radius logic is unit-testable without a browser or DB.

export type LatLng = { latitude: number; longitude: number };

const EARTH_RADIUS_M = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two coordinates, in metres (haversine formula).
 * Accurate to well under a metre at the scales that matter here.
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Is `point` within `radiusMeters` of `center`? Returns the decision plus the
 * measured distance so callers can store/show it. Optionally widen the radius by
 * the device's reported GPS accuracy so a present-but-imprecise phone isn't
 * wrongly rejected (`accuracyMeters`).
 */
export function isWithinRadius(
  point: LatLng,
  center: LatLng,
  radiusMeters: number,
  accuracyMeters = 0,
): { ok: boolean; distanceMeters: number } {
  const d = distanceMeters(point, center);
  const allowance = Math.max(0, radiusMeters) + Math.max(0, accuracyMeters);
  return { ok: d <= allowance, distanceMeters: d };
}

/**
 * Find the nearest of several named locations to a point. Returns the closest
 * location and whether the point is inside its radius. Null when no locations.
 */
export function nearestLocation<T extends LatLng & { radius_m: number }>(
  point: LatLng,
  locations: T[],
  accuracyMeters = 0,
): { location: T; distanceMeters: number; ok: boolean } | null {
  let best: { location: T; distanceMeters: number; ok: boolean } | null = null;
  for (const loc of locations) {
    const { ok, distanceMeters: d } = isWithinRadius(point, loc, loc.radius_m, accuracyMeters);
    if (!best || d < best.distanceMeters) best = { location: loc, distanceMeters: d, ok };
  }
  return best;
}
