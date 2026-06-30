import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

const BRIDGE_NAME = "omega_api_key";

type LooseClient = SupabaseClient<any, any, any>;

function serviceDb(): LooseClient {
  return createServiceClient() as unknown as LooseClient;
}

export async function readSharedOmegaKey(): Promise<string | null> {
  try {
    const supabase = serviceDb();
    const { data, error } = await supabase
      .from("ai_secret_bridge")
      .select("secret")
      .eq("name", BRIDGE_NAME)
      .maybeSingle<{ secret: string }>();
    if (error) return null;
    const secret = data?.secret?.trim();
    return secret ? secret : null;
  } catch {
    return null;
  }
}

export async function hasSharedOmegaKey(): Promise<boolean> {
  return Boolean(await readSharedOmegaKey());
}

export async function writeSharedOmegaKey(secret: string, userId: string | null): Promise<void> {
  const value = secret.trim();
  if (!value) return;
  try {
    const supabase = serviceDb();
    await supabase.from("ai_secret_bridge").upsert({
      name: BRIDGE_NAME,
      secret: value,
      updated_by: userId,
    });
  } catch {
    // Best-effort mirror for non-owner AI access.
  }
}

export async function clearSharedOmegaKey(): Promise<void> {
  try {
    const supabase = serviceDb();
    await supabase.from("ai_secret_bridge").delete().eq("name", BRIDGE_NAME);
  } catch {
    // Best-effort clear.
  }
}
