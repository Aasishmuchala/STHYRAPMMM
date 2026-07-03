import { describe, it, expect } from "vitest";
import { distanceMeters, isWithinRadius, nearestLocation } from "./geo";

// Reference: 0.00001° of latitude ≈ 1.11 m.
const OFFICE = { latitude: 12.9716, longitude: 77.5946 }; // Bengaluru

describe("distanceMeters", () => {
  it("is zero for the same point", () => {
    expect(distanceMeters(OFFICE, OFFICE)).toBeCloseTo(0, 5);
  });

  it("measures a small north offset accurately (~11m for 0.0001°)", () => {
    const north = { latitude: OFFICE.latitude + 0.0001, longitude: OFFICE.longitude };
    expect(distanceMeters(OFFICE, north)).toBeGreaterThan(10);
    expect(distanceMeters(OFFICE, north)).toBeLessThan(12);
  });

  it("is symmetric", () => {
    const b = { latitude: 12.98, longitude: 77.61 };
    expect(distanceMeters(OFFICE, b)).toBeCloseTo(distanceMeters(b, OFFICE), 6);
  });
});

describe("isWithinRadius", () => {
  it("accepts a point inside the radius", () => {
    const near = { latitude: OFFICE.latitude + 0.00002, longitude: OFFICE.longitude }; // ~2.2m
    expect(isWithinRadius(near, OFFICE, 5).ok).toBe(true);
  });

  it("rejects a point outside the radius", () => {
    const far = { latitude: OFFICE.latitude + 0.001, longitude: OFFICE.longitude }; // ~111m
    const r = isWithinRadius(far, OFFICE, 50);
    expect(r.ok).toBe(false);
    expect(r.distanceMeters).toBeGreaterThan(100);
  });

  it("widens the gate by the device's GPS accuracy", () => {
    const edge = { latitude: OFFICE.latitude + 0.0001, longitude: OFFICE.longitude }; // ~11m
    expect(isWithinRadius(edge, OFFICE, 5).ok).toBe(false); // 11m > 5m
    expect(isWithinRadius(edge, OFFICE, 5, 10).ok).toBe(true); // 5 + 10 allowance
  });
});

describe("nearestLocation", () => {
  const locations = [
    { latitude: 12.9716, longitude: 77.5946, radius_m: 50, name: "HQ" },
    { latitude: 13.0, longitude: 77.6, radius_m: 50, name: "Annex" },
  ];

  it("returns null with no locations", () => {
    expect(nearestLocation(OFFICE, [])).toBeNull();
  });

  it("picks the closest location and flags in-radius", () => {
    const atHq = { latitude: 12.97161, longitude: 77.5946 };
    const r = nearestLocation(atHq, locations);
    expect(r?.location.name).toBe("HQ");
    expect(r?.ok).toBe(true);
  });

  it("picks the closest even when outside every radius", () => {
    const middle = { latitude: 12.985, longitude: 77.597 };
    const r = nearestLocation(middle, locations);
    expect(r).not.toBeNull();
    expect(r?.ok).toBe(false);
  });
});
