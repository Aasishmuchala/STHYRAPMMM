"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { LooseSupabase as DB } from "@/lib/supabase/loose-client";
import { nearestLocation } from "@/lib/geo";
import { verifyAttendanceToken } from "@/lib/attendanceToken";

type Result<T = unknown> = ({ ok: true } & T) | { error: string };

type LocationRow = {
  id: string;
  division_id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
};

// ── Anti-spoof guards ───────────────────────────────────────────────────────
// Browser geolocation on a desktop is IP/WiFi-based (coarse) and can be faked via
// remote desktop into an always-on office PC; real phone GPS is precise. We (1)
// require a mobile device, (2) reject imprecise readings, and (3) audit IP + UA.
const MAX_ACCURACY_M = 200;     // coarser than this ⇒ almost certainly IP/desktop
const ACCURACY_BUFFER_CAP = 40; // only forgive this much GPS jitter on the radius

async function requestMeta() {
  const h = await headers();
  const ua = h.get("user-agent") ?? "";
  const fwd = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim();
  const ip = fwd || h.get("x-real-ip") || null;
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  return { ua, ip, isMobile };
}

type PresenceOk = { ok: true; location: LocationRow; distance: number };
function evaluatePresence(
  latitude: number,
  longitude: number,
  accuracyM: number | null,
  locations: LocationRow[],
  isMobile: boolean,
): { error: string } | PresenceOk {
  if (!isMobile) {
    return { error: "Attendance can only be marked from a phone — not a desktop or remote session." };
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { error: "We couldn't read your location. Enable GPS/location permission and try again." };
  }
  const acc = Number.isFinite(accuracyM ?? NaN) ? Math.max(0, accuracyM as number) : null;
  if (acc === null || acc > MAX_ACCURACY_M) {
    return { error: "Your location isn't precise enough (this usually means a desktop, IP, or spoofed location). Open this on your phone, outdoors, with GPS on." };
  }
  if (locations.length === 0) {
    return { error: "No attendance locations have been set up yet. Ask your owner to add one." };
  }
  const nearest = nearestLocation({ latitude, longitude }, locations, Math.min(acc, ACCURACY_BUFFER_CAP));
  if (!nearest) return { error: "No attendance locations found." };
  const distance = Math.round(nearest.distanceMeters);
  if (!nearest.ok) {
    return { error: `You're ${distance}m from "${nearest.location.name}" — move within ${nearest.location.radius_m}m and retry.` };
  }
  return { ok: true, location: nearest.location, distance };
}

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

  const { ua, ip, isMobile } = await requestMeta();

  // RLS returns only the locations of companies this user belongs to.
  const { data: locRows, error: locError } = await supabase
    .from("attendance_locations")
    .select("id,division_id,name,latitude,longitude,radius_m")
    .returns<LocationRow[]>();
  if (locError) return { error: locError.message };

  const check = evaluatePresence(latitude, longitude, accuracyM, locRows ?? [], isMobile);
  if ("error" in check) return { error: check.error };

  const acc = Number.isFinite(accuracyM ?? NaN) ? Math.max(0, accuracyM as number) : null;
  const { error: insertError } = await supabase.from("attendance_records").insert({
    user_id: user.id,
    division_id: check.location.division_id,
    location_id: check.location.id,
    latitude,
    longitude,
    accuracy_m: acc,
    distance_m: check.distance,
    status: "present",
    ip,
    user_agent: ua,
    is_mobile: isMobile,
  });
  if (insertError) {
    if (/duplicate|unique/i.test(insertError.message)) return { error: "You've already checked in today." };
    if (/policy|permission/i.test(insertError.message)) return { error: "You're not a member of this company." };
    return { error: insertError.message };
  }

  revalidatePath("/attendance");
  return { ok: true, locationName: check.location.name, distanceMeters: check.distance };
}

// ── Token check-in: tapped from the 6am email link, no login required ───────
// The signed token identifies the user; we verify it, then use the service role
// to record their attendance (there's no session to satisfy RLS at 6am).
export async function checkInWithToken(
  token: string,
  latitude: number,
  longitude: number,
  accuracyM: number | null,
): Promise<Result<{ locationName: string; distanceMeters: number }>> {
  const verified = verifyAttendanceToken(token);
  if (!verified) return { error: "This attendance link is invalid or has expired. Sign in to check in instead." };

  const { ua, ip, isMobile } = await requestMeta();
  const admin = createServiceClient() as unknown as DB;

  const { data: mems } = await admin.from("division_members").select("division_id").eq("user_id", verified.userId);
  const divIds = ((mems ?? []) as { division_id: string }[]).map((m) => m.division_id);
  if (divIds.length === 0) return { error: "You're not assigned to a company yet." };

  const { data: locRows, error: locError } = await admin
    .from("attendance_locations")
    .select("id,division_id,name,latitude,longitude,radius_m")
    .in("division_id", divIds)
    .returns<LocationRow[]>();
  if (locError) return { error: locError.message };

  const check = evaluatePresence(latitude, longitude, accuracyM, locRows ?? [], isMobile);
  if ("error" in check) return { error: check.error };

  const acc = Number.isFinite(accuracyM ?? NaN) ? Math.max(0, accuracyM as number) : null;
  const { error: insertError } = await admin.from("attendance_records").insert({
    user_id: verified.userId,
    division_id: check.location.division_id,
    location_id: check.location.id,
    latitude,
    longitude,
    accuracy_m: acc,
    distance_m: check.distance,
    status: "present",
    ip,
    user_agent: ua,
    is_mobile: isMobile,
  });
  if (insertError) {
    if (/duplicate|unique/i.test(insertError.message)) return { error: "You've already checked in today." };
    return { error: insertError.message };
  }
  return { ok: true, locationName: check.location.name, distanceMeters: check.distance };
}
