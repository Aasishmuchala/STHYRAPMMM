"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";
import { nearestLocation } from "@/lib/geo";

type Result<T = unknown> = ({ ok: true } & T) | { error: string };

type LocationRow = {
  id: string;
  division_id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
};

// ── Owner / manager: manage geofenced locations ─────────────────────────────
// RLS ("managers manage attendance locations") is the real guard — only an
// owner/lead/super-admin of `divisionId` can insert here.
export async function addAttendanceLocation(
  divisionId: string,
  name: string,
  latitude: number,
  longitude: number,
  radiusM: number,
): Promise<Result> {
  const supabase = (await createClient()) as unknown as DB;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const cleanName = name.trim();
  if (!cleanName) return { error: "Give the location a name." };
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return { error: "Pick a point on the map or paste coordinates." };
  const radius = Math.round(radiusM);
  if (!Number.isFinite(radius) || radius <= 0 || radius > 10000) return { error: "Radius must be between 1 and 10000 metres." };

  const { error } = await supabase.from("attendance_locations").insert({
    division_id: divisionId,
    name: cleanName,
    latitude,
    longitude,
    radius_m: radius,
    created_by: user.id,
  });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return { error: `A location named "${cleanName}" already exists for this company.` };
    if (/policy|permission/i.test(error.message)) return { error: "Only an owner or lead can add locations." };
    return { error: error.message };
  }
  revalidatePath("/settings");
  revalidatePath("/attendance");
  return { ok: true };
}

export async function deleteAttendanceLocation(id: string): Promise<Result> {
  const supabase = (await createClient()) as unknown as DB;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("attendance_locations").delete().eq("id", id);
  if (error) return { error: /policy/i.test(error.message) ? "Only an owner or lead can remove locations." : error.message };
  revalidatePath("/settings");
  revalidatePath("/attendance");
  return { ok: true };
}

// ── Anyone: geo-verified daily check-in ─────────────────────────────────────
// Records the caller's own attendance IF their GPS is within the radius of one
// of their company's registered locations. RLS ("insert own attendance") ensures
// a user can only ever write their own record, in a company they belong to.
export async function checkIn(
  latitude: number,
  longitude: number,
  accuracyM: number | null,
): Promise<Result<{ locationName: string; distanceMeters: number }>> {
  const supabase = (await createClient()) as unknown as DB;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { error: "We couldn't read your location. Enable GPS/location permission and try again." };
  }

  // RLS returns only the locations of companies this user belongs to.
  const { data: locRows, error: locError } = await supabase
    .from("attendance_locations")
    .select("id,division_id,name,latitude,longitude,radius_m")
    .returns<LocationRow[]>();
  if (locError) return { error: locError.message };
  const locations = locRows ?? [];
  if (locations.length === 0) {
    return { error: "No attendance locations have been set up yet. Ask your owner to add one." };
  }

  const accuracy = Number.isFinite(accuracyM ?? NaN) ? Math.max(0, accuracyM as number) : 0;
  const nearest = nearestLocation({ latitude, longitude }, locations, accuracy);
  if (!nearest) return { error: "No attendance locations found." };

  const distance = Math.round(nearest.distanceMeters);
  if (!nearest.ok) {
    return { error: `You're ${distance}m from "${nearest.location.name}" — too far to check in. Move within ${nearest.location.radius_m}m and retry.` };
  }

  const { error: insertError } = await supabase.from("attendance_records").insert({
    user_id: user.id,
    division_id: nearest.location.division_id,
    location_id: nearest.location.id,
    latitude,
    longitude,
    accuracy_m: accuracy || null,
    distance_m: distance,
    status: "present",
  });
  if (insertError) {
    if (/duplicate|unique/i.test(insertError.message)) return { error: "You've already checked in today." };
    if (/policy|permission/i.test(insertError.message)) return { error: "You're not a member of this company." };
    return { error: insertError.message };
  }

  revalidatePath("/attendance");
  return { ok: true, locationName: nearest.location.name, distanceMeters: distance };
}
